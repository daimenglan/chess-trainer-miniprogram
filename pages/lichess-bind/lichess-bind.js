"use strict";
/**
 * Lichess 账号绑定页
 *
 * 主路径：OAuth 2.0 授权码 + PKCE（与网页版一致）——
 * 生成授权票据 → 复制授权入口链接 → 用户在浏览器打开并授权 →
 * 后端回调完成绑定并把结果写回票据 → 本页轮询自动完成，无需粘贴令牌。
 *
 * 备用路径：手动创建个人访问令牌后粘贴（OAuth 跳转不可用时兜底）。
 */
const api = require('../../utils/api');
const bind = require('../../utils/lichessBind');
const util = require('../../utils/util');
const { trackEvent } = require('../../utils/analytics');
/** 各入口返回时的兜底落地页 */
const BACK_FALLBACK = {
    online: '/pages/online/online',
    profile: '/pages/profile/profile',
    login: '/pages/choice/choice',
};
Page({
    /** 同步主题 */
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    /** 轮询定时器与当前票据（非渲染状态，与 online 页 _clockTimer 同风格） */
    _pollTimer: null,
    _pollTicket: '',
    data: {
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
        /** 来源页面标识（返回时用于兜底落地） */
        from: 'online',
        /** 'bind' = 已登录用户的绑定；'login' = 用 Lichess 登录/注册本系统 */
        mode: 'bind',
        /** 令牌创建页地址（备用路径展示用） */
        tokenUrl: bind.TOKEN_URL,
        requiredScopes: bind.REQUIRED_SCOPES,
        /** ===== OAuth 主路径 ===== */
        /** 是否已生成授权票据 */
        oauthStarted: false,
        /** 授权入口链接（供展示与重新复制） */
        oauthUrl: '',
        /** 是否正在等待用户完成浏览器授权 */
        oauthWaiting: false,
        /** 轮询得到的状态提示 */
        oauthHint: '',
        /** ===== 令牌备用路径 ===== */
        /** 备用路径是否展开 */
        fallbackOpen: false,
        token: '',
        loading: false,
        error: '',
        /** 已绑定时的展示 */
        bound: false,
        lichessUsername: '',
        profile: null,
    },
    onLoad(query) {
        const mode = query?.mode === 'login' ? 'login' : 'bind';
        const from = query?.from || 'online';
        this.setData({ from, mode });
        wx.setNavigationBarTitle({ title: mode === 'login' ? 'Lichess 账号登录' : '绑定 Lichess 账号' });
        if (mode === 'bind') {
            this._loadStatus();
        }
        // 续接上次未完成的授权：用户去浏览器期间本页可能被回收，回来后应继续等待结果
        const pending = bind.loadPendingTicket();
        if (pending && pending.mode === mode) {
            this.setData({
                oauthStarted: true,
                oauthWaiting: true,
                oauthUrl: pending.url,
                oauthHint: '正在等待浏览器授权结果…',
            });
            this._startPolling(pending.ticket);
        }
    },
    onShow() {
        this._syncTheme();
        // 用户切到浏览器时 onHide 停了轮询，切回来需恢复：
        // 立即补查一次（不等下个周期），并重启定时器以便尚未授权时继续等待
        if (this.data.oauthWaiting && this._pollTicket) {
            this._startPolling(this._pollTicket);
        }
    },
    onHide() {
        this._stopPolling();
    },
    onUnload() {
        this._stopPolling();
    },
    /** 拉取当前绑定状态：已绑定则显示账号卡片，可解绑或重新授权 */
    _loadStatus() {
        api.getLichessBinding()
            .then((res) => {
            const data = res?.data || {};
            this.setData({
                bound: !!data.bound,
                lichessUsername: data.lichessUsername || '',
                profile: data.profile || null,
            });
        })
            .catch((err) => {
            // 账号未完成（微信用户未设密码）：引导先设密码，设完自动回来继续绑定
            if (err?.code === 'PROFILE_INCOMPLETE') {
                wx.navigateTo({ url: `/pages/set-password/set-password?returnTo=/pages/lichess-bind/lichess-bind?from=${this.data.from}` });
                return;
            }
            // 灰度未放行 / 未配置时给出明确提示，而不是静默空白
            this.setData({ error: err?.message || '' });
        });
    },
    // ===== OAuth 主路径 =====
    /** 生成授权票据并把授权入口链接复制到剪贴板 */
    onStartOAuth() {
        if (this.data.loading || this.data.oauthWaiting)
            return;
        trackEvent('lichess_bind_start', { mode: this.data.mode });
        this.setData({ loading: true, error: '' });
        bind.startOAuth(this.data.mode).then((result) => {
            // 账号未完成（微信用户未设密码）：引导先设密码，设完自动回来继续绑定
            if (result?.code === 'PROFILE_INCOMPLETE') {
                this.setData({ loading: false });
                wx.navigateTo({ url: `/pages/set-password/set-password?returnTo=/pages/lichess-bind/lichess-bind?from=${this.data.from}` });
                return;
            }
            if (result?.error) {
                this.setData({ loading: false, error: result.error });
                return;
            }
            this.setData({
                loading: false,
                oauthStarted: true,
                oauthWaiting: true,
                oauthUrl: result.url,
                oauthHint: '链接已复制，请在浏览器中打开并授权',
            });
            wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none', duration: 2500 });
            this._startPolling(result.ticket);
        });
    },
    /** 重新复制授权链接（用户误清理剪贴板时用） */
    onCopyOAuthUrl() {
        if (!this.data.oauthUrl)
            return;
        bind.copyToClipboard(this.data.oauthUrl).then(() => {
            wx.showToast({ title: '链接已复制', icon: 'none' });
        });
    },
    /** 开始轮询授权结果（先立即查一次，再从浏览器切回时无需等待一个周期） */
    _startPolling(ticket) {
        this._stopPolling();
        this._pollTicket = ticket;
        this._pollOnce();
        this._pollTimer = setInterval(() => this._pollOnce(), 2000);
    },
    _stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    },
    /** 查询一次授权结果并按状态处理 */
    _pollOnce() {
        const ticket = this._pollTicket;
        if (!ticket)
            return;
        bind.queryTicket(ticket).then((status) => {
            if (status.status === 'pending')
                return;
            // 到了终态就停止轮询，避免空转
            this._stopPolling();
            bind.clearPendingTicket();
            if (status.status === 'expired') {
                this.setData({
                    oauthStarted: false,
                    oauthWaiting: false,
                    oauthUrl: '',
                    oauthHint: '',
                    error: '授权已超时，请重新发起',
                });
                return;
            }
            if (status.status === 'failed') {
                this.setData({
                    oauthStarted: false,
                    oauthWaiting: false,
                    oauthUrl: '',
                    oauthHint: '',
                    error: status.error || '授权失败，请重试',
                });
                return;
            }
            // completed
            this.setData({ oauthWaiting: false, oauthHint: '' });
            if (this.data.mode === 'login') {
                this._applyLoginResult(status);
            }
            else {
                this._applyBindResult(status.lichessUsername || '');
            }
        });
    },
    // ===== 授权结果落地 =====
    /** bind 模式：授权完成后的页面反馈 */
    _applyBindResult(lichessUsername) {
        bind.persistBinding(lichessUsername || null);
        this.setData({
            bound: true,
            lichessUsername,
            oauthStarted: false,
            oauthUrl: '',
            error: '',
        });
        util.showToast('Lichess 绑定成功', 'success');
        trackEvent('lichess_bind_success', { lichessUsername });
        this._loadStatus();
        setTimeout(() => {
            util.navigateBackSafe(BACK_FALLBACK[this.data.from] || '/pages/online/online');
        }, 1200);
    },
    /**
     * login 模式：写入登录态并进入系统
     * 供 OAuth 与备用令牌两条路径共用
     */
    _applyLoginResult(data) {
        if (!data?.token) {
            this.setData({ loading: false, error: data?.error || '登录失败，请重试' });
            return;
        }
        const app = getApp();
        app.setToken(data.token);
        app.saveUser({
            userId: data.userId,
            username: data.username,
            role: data.role,
            avatarUrl: data.avatarUrl,
            membership: data.membership || null,
            teacherStatus: data.teacherStatus || null,
            lichessUsername: data.lichessUsername || null,
        });
        this.setData({ loading: false });
        wx.showToast({
            title: data.isNewUser ? '已用 Lichess 账号注册并登录' : '登录成功',
            icon: 'success',
        });
        setTimeout(() => {
            wx.reLaunch({ url: '/pages/choice/choice' });
        }, 1000);
    },
    // ===== 令牌备用路径 =====
    /** 展开/收起备用路径 */
    onToggleFallback() {
        this.setData({ fallbackOpen: !this.data.fallbackOpen, error: '' });
    },
    onTokenInput(e) {
        this.setData({ token: e.detail.value, error: '' });
    },
    /** 复制令牌创建页地址（备用路径） */
    onCopyUrl() {
        bind.copyTokenUrl().then(() => {
            wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none', duration: 2500 });
        });
    },
    /** 提交令牌：bind 模式为绑定账号，login 模式为登录/注册本系统 */
    onSubmit() {
        const token = (this.data.token || '').trim();
        if (!token) {
            this.setData({ error: '请粘贴 Lichess 访问令牌' });
            return;
        }
        if (this.data.loading)
            return;
        this.setData({ loading: true, error: '' });
        if (this.data.mode === 'login') {
            this._submitLogin(token);
        }
        else {
            this._submitBind(token);
        }
    },
    /** 绑定模式：把令牌绑到当前登录的本系统账号 */
    _submitBind(token) {
        bind.bindWithToken(token).then((result) => {
            if (result.success) {
                this.setData({ loading: false, token: '', error: '' });
                this._applyBindResult(result.lichessUsername || '');
            }
            else if (result.code === 'PROFILE_INCOMPLETE') {
                this.setData({ loading: false });
                wx.navigateTo({ url: `/pages/set-password/set-password?returnTo=/pages/lichess-bind/lichess-bind?from=${this.data.from}` });
            }
            else {
                this.setData({ loading: false, error: result.error || '绑定失败' });
            }
        });
    },
    /** 登录模式：用令牌登录或自动注册本系统账号 */
    _submitLogin(token) {
        api.lichessLoginToken(token)
            .then((res) => {
            const data = res?.data;
            if (!data || !data.token) {
                this.setData({ loading: false, error: res?.error || '登录失败，请重试' });
                return;
            }
            this.setData({ token: '' });
            this._applyLoginResult(data);
        })
            .catch((err) => {
            this.setData({ loading: false, error: err?.message || '登录失败，请检查令牌是否正确' });
        });
    },
    /** 解绑 */
    onUnbind() {
        wx.showModal({
            title: '解除 Lichess 绑定',
            content: '确定要解除 Lichess 账号绑定吗？解除后将无法与 Lichess 棋手对弈',
            confirmText: '解除',
            cancelText: '取消',
            success: (res) => {
                if (!res.confirm)
                    return;
                bind.unbind().then((result) => {
                    if (result.success) {
                        bind.persistBinding(null);
                        this.setData({ bound: false, lichessUsername: '', profile: null });
                        util.showToast('已解除绑定', 'success');
                    }
                    else {
                        util.showToast(result.error || '解除绑定失败', 'none');
                    }
                });
            },
        });
    },
});

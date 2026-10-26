"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 小程序登录页：只做微信授权登录
 *
 * 为什么砍成只有微信：入口来自三处
 *   - web-view 内 H5 的「微信登录」跳来（?from=webview）
 *   - scheme 拉起落地（?ticket=xxx，手机浏览器点「微信登录」唤起微信）
 *   - 各业务页 / 401 过期时的裸跳
 * 三者最终都应落到同一步：wx.login → 后端 confirm 换 JWT。
 *
 * 账号密码登录、注册、忘记密码、Lichess 登录等入口已移除：
 * 同一套功能在网页版 H5 登录页完整保留，用户可从网页版使用。
 * 新用户首次授权由后端自动建号（confirm 返回 isNewUser），无需单独注册。
 *
 * 保留的接口约定（勿删）：
 *   - onWeChatLogin / onWeChatRetry / doWeChatLogin：被 test/wechat-login-test.js 直接调用
 *   - onLoad 的 ticket 落地：scheme 场景自动登录
 *   - from=webview：web-view 场景静默登录，回跳时 navigateBack 回原 tab
 */
const app = getApp();
const api = require('../../utils/api');
const { trackEvent } = require('../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
        loading: false,
        error: '',
        // scheme 拉起落地 / web-view 唤起时的状态遮罩
        wxTicket: '', // 手机浏览器发起登录时生成的票据
        wxLanding: false, // 是否处于自动登录流程（scheme 落地或 web-view 唤起）
        wxFromWebView: false, // 是否由 web-view 内 H5 唤起的静默登录
        wxStatus: 'loading', // loading | success | error
        wxMessage: '',
        // 用户协议与隐私政策授权
        agreed: false,
        // 装饰性浮动棋子
        floatPieces: ['♚', '♛', '♜', '♝', '♞', '♟', '♔', '♕', '♖', '♗', '♘', '♙'].map((ch, i) => ({
            ch,
            left: (i % 4) * 25 + 10,
            top: Math.floor(i / 4) * 25 + 5,
            size: 32 + i * 8,
            delay: i * 0.5,
        })),
    },
    /** 同步主题 */
    _syncTheme() {
        try {
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    /** 切换协议勾选状态 */
    onToggleAgreement() {
        this.setData({ agreed: !this.data.agreed, error: '' });
    },
    /** 取消/拒绝登录：返回上一页，不强制用户登录 */
    onCancelLogin() {
        const pages = getCurrentPages();
        if (pages.length >= 2) {
            wx.navigateBack({ delta: 1 });
        }
        else {
            // 直接从分享/scheme 进入且无上一页：回首页
            wx.redirectTo({ url: '/pages/choice/choice' });
        }
    },
    /** 打开《用户服务协议》/《隐私政策》 */
    onOpenAgreement(e) {
        // 原生协议页已移除，由 H5 侧处理
        wx.showModal({
            title: '服务协议及隐私保护',
            content: '请前往网页版阅读完整的《用户服务协议》与《隐私政策》',
            confirmText: '知道了',
            cancelText: '取消',
        });
    },
    /** 协议未勾选时就地提示（不用弹窗，避免反复弹窗打扰用户） */
    ensureAgreed() {
        // 由 web-view 内 H5 唤起时，协议同意已在 H5 登录页完成，不再二次提示
        if (this.data.wxFromWebView)
            return true;
        if (this.data.agreed)
            return true;
        this.setData({ error: '请先勾选并同意《用户服务协议》和《隐私政策》' });
        return false;
    },
    /**
     * 登录成功后的去向。
     *
     * 优先退回上一页（用户从对弈/棋谱/我的 等页面跳来时，应回到原处），
     * 只有确实是首屏入口时才回首页 tab。
     */
    _afterLoginNavigate() {
        // 好友邀请落地页已移除，登录后直接回首页
        const pages = getCurrentPages();
        if (pages.length >= 2) {
            wx.navigateBack({ delta: 1 });
            return;
        }
        wx.redirectTo({ url: '/pages/choice/choice' });
    },
    onLoad(options) {
        // scheme 拉起落地：手机外部浏览器点「微信登录」→ 生成票据并唤起微信打开本页
        // query 整体经过 encodeURIComponent，先解外层再使用
        const raw = (options && options.ticket) || '';
        const fromWebView = options && options.from === 'webview';
        let ticket = '';
        try {
            ticket = decodeURIComponent(raw);
        }
        catch (e) {
            ticket = raw;
        }
        if (!ticket) {
            // 由 web-view 内 H5 唤起：用户已在小程序里，且协议同意已在 H5 侧完成。
            // 直接静默 wx.login，登录成功后回原 tab（token 经壳页重建 web-view 地址带回 H5）。
            if (fromWebView) {
                this.setData({ wxFromWebView: true, wxLanding: true, loading: true, error: '' });
                this.doWeChatLogin('').finally(() => {
                    this.setData({ loading: false });
                });
            }
            return;
        }
        this.setData({ wxTicket: ticket, wxLanding: true, wxStatus: 'loading', wxMessage: '' });
        this.doWeChatLogin(ticket);
    },
    /** 保存登录结果 */
    _applyLoginResult(data, toastTitle) {
        app.setToken(data.token);
        // 埋点：微信授权登录成功
        trackEvent('login', { method: 'wechat' });
        // 存储用户信息（含会员/教师状态，与网页版同步）
        app.saveUser({
            userId: data.userId,
            username: data.username,
            role: data.role,
            avatarUrl: data.avatarUrl,
            membership: data.membership || null,
            teacherStatus: data.teacherStatus || null,
            lichessUsername: data.lichessUsername || null,
        });
        wx.showToast({ title: toastTitle, icon: 'success' });
    },
    /** 微信授权登录（页面按钮） */
    onWeChatLogin() {
        if (this.data.loading)
            return;
        if (!this.ensureAgreed())
            return;
        this.setData({ loading: true, error: '' });
        this.doWeChatLogin('')
            .finally(() => {
            this.setData({ loading: false });
        });
    },
    /**
     * 执行微信登录：wx.login 取 code → 上报后端换取 JWT
     *
     * @param ticket 非空时为 scheme 拉起落地流程，需在页面上展示状态并支持重试
     */
    doWeChatLogin(ticket) {
        return new Promise((resolve) => {
            wx.login({
                success: (res) => {
                    if (!res || !res.code) {
                        this._handleWxFail(ticket, '获取微信登录凭证失败，请重试');
                        resolve();
                        return;
                    }
                    api.wechatMiniAppLogin(res.code, ticket || undefined)
                        .then((resp) => {
                        const data = resp && resp.data;
                        if (!data || !data.token) {
                            this._handleWxFail(ticket, (resp && resp.error) || '登录失败，请重试');
                            resolve();
                            return;
                        }
                        this._applyLoginResult(data, data.isNewUser ? '注册成功' : '登录成功');
                        if (ticket) {
                            // scheme 拉起场景：展示结果后进入系统
                            this.setData({ wxStatus: 'success', wxMessage: '登录成功，正在进入...' });
                            setTimeout(() => {
                                this._afterLoginNavigate();
                            }, 1200);
                        }
                        else {
                            this._afterLoginNavigate();
                        }
                        resolve();
                    })
                        .catch((err) => {
                        this._handleWxFail(ticket, err && err.message ? err.message : '网络错误');
                        resolve();
                    });
                },
                fail: () => {
                    this._handleWxFail(ticket, '微信登录失败，请重试');
                    resolve();
                },
            });
        });
    },
    /** 登录失败：自动登录流程展示遮罩错误，手动点击流程展示行内错误 */
    _handleWxFail(ticket, message) {
        if (ticket) {
            this.setData({ wxStatus: 'error', wxMessage: message });
            return;
        }
        this.setData({ wxStatus: 'error', wxMessage: message, error: message, wxLanding: false });
    },
    /** 自动登录流程重试（scheme 落地 / web-view 唤起失败后） */
    onWeChatRetry() {
        const ticket = this.data.wxTicket;
        if (this.data.wxStatus === 'error' && !ticket) {
            // 无票据时（web-view 唤起失败）：降级为手动点一次授权
            this.setData({ wxLanding: false, error: '', wxStatus: 'loading' });
            this.onWeChatLogin();
            return;
        }
        if (!ticket) {
            this.setData({ wxStatus: 'error', wxMessage: '缺少登录凭证，请回到浏览器重新发起登录' });
            return;
        }
        this.setData({ wxStatus: 'loading', wxMessage: '' });
        this.doWeChatLogin(ticket);
    },
    onShow() {
        this._syncTheme();
    },
});

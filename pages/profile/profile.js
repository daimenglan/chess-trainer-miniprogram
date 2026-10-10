"use strict";
/** 我的 Tab：小程序壳，内容由 H5 个人中心渲染。 */
const profileApp = getApp();
Page({
    data: { WebViewUrl: '', token: '', loading: true, error: '', __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark') },
    _buildUrl() { return ((profileApp?.globalData?.baseUrl || 'https://mychess.com.cn').replace(/\/$/, '') + '/profile'); },
    _urlWithToken(token) { const base = this._buildUrl(); return token ? `${base}#webview_token=${encodeURIComponent(token)}&ai=disabled` : base; },
    _readToken(options) { let token = profileApp?.globalData?.token || ''; if (!token) {
        try {
            token = wx.getStorageSync('auth_token') || '';
        }
        catch (_) { }
    } if (options?.token) {
        try {
            token = decodeURIComponent(options.token);
        }
        catch (_) {
            token = options.token;
        }
    } return token; },
    onLoad(options) { const token = this._readToken(options); this.setData({ token, WebViewUrl: this._urlWithToken(token), loading: true, error: '' }); },
    onShow() { const theme = profileApp?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== theme)
        this.setData({ __theme__: theme }); this._syncTokenFromApp(); },
    /** 原生登录页登录成功后 switchTab 回本页：onShow 触发但 onLoad 不会，故检测全局 token 变化重建 web-view 地址 */
    _syncTokenFromApp() { const token = (profileApp && profileApp.globalData && profileApp.globalData.token) || ''; if (!token || token === this.data.token)
        return; this.setData({ token, WebViewUrl: this._urlWithToken(token) }); },
    _postTokenToWeb() { if (!this.data.token)
        return; wx.createSelectorQuery().select('.shell-web-view').context((res) => { if (res?.postMessage)
        res.postMessage({ type: 'setToken', token: this.data.token }); }).exec(); },
    onMessage(e) { const msg = e?.detail?.data; if (!msg)
        return; if (msg.type === 'ready') {
        this._postTokenToWeb();
        this.setData({ loading: false, error: '' });
    }
    else if (msg.type === 'navigateTo' && msg.url)
        wx.navigateTo({ url: msg.url });
    else if (msg.type === 'navigateBack')
        wx.navigateBack({ delta: msg.delta || 1 });
    else if (msg.type === 'redirect' && msg.url)
        wx.redirectTo({ url: msg.url }); },
    onError() { this.setData({ loading: false, error: '网页加载失败，请检查网络连接或稍后重试' }); },
    onRetry() { this.setData({ loading: true, error: '', WebViewUrl: this._urlWithToken(this.data.token) }); },
    /** 分享给朋友 */
    onShareAppMessage() {
        return {
            title: '♟️ MyChess 国际象棋 · AI 陪练在线对弈',
            path: '/pages/profile/profile',
        };
    },
    /** 分享到朋友圈 */
    onShareTimeline() {
        return {
            title: '♟️ MyChess 国际象棋 · AI 陪练在线对弈',
            query: '',
        };
    },
});

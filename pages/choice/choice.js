"use strict";
/** 首页 Tab：小程序壳，内容由 H5 首页渲染。 */
const choiceApp = getApp();
Page({
    data: {
        WebViewUrl: '',
        token: '',
        loading: true,
        error: '',
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
    },
    _buildUrl() {
        const baseUrl = (choiceApp && choiceApp.globalData && choiceApp.globalData.baseUrl) || 'https://mychess.com.cn';
        return baseUrl.replace(/\/$/, '') + '/';
    },
    _urlWithToken(token) {
        const base = this._buildUrl();
        if (!token)
            return base;
        // 放在 hash 里：网页版 App.tsx 从 location.hash 解析 webview_token，
        // 放在 query 段会解析不到，H5 侧将一直停留在未登录态。
        // 小程序壳额外附加 ai=disabled，H5 读取后关闭全部 AI 功能。
        return `${base}#webview_token=${encodeURIComponent(token)}&ai=disabled`;
    },
    _readToken(options) {
        let token = (choiceApp && choiceApp.globalData && choiceApp.globalData.token) || '';
        if (!token) {
            try {
                token = wx.getStorageSync('auth_token') || '';
            }
            catch (_) { /* ignore */ }
        }
        if (options?.token) {
            try {
                token = decodeURIComponent(options.token);
            }
            catch (_) {
                token = options.token;
            }
        }
        return token;
    },
    onLoad(options) {
        const token = this._readToken(options);
        this.setData({ token, WebViewUrl: this._urlWithToken(token), loading: true, error: '' });
    },
    onShow() {
        const theme = choiceApp?.globalData?.settings?.uiTheme || 'dark';
        if (this.data.__theme__ !== theme)
            this.setData({ __theme__: theme });
        // 原生登录页登录成功后 switchTab 回本页：onShow 会触发但 onLoad 不会，
        // 故此处检测全局 token 变化并重建 web-view 地址，把新 token 带给 H5。
        this._syncTokenFromApp();
    },
    /** 全局 token 与当前页面持有的一致则不重建 web-view（避免多余刷新） */
    _syncTokenFromApp() {
        const token = (choiceApp && choiceApp.globalData && choiceApp.globalData.token) || '';
        if (!token || token === this.data.token)
            return;
        this.setData({ token, WebViewUrl: this._urlWithToken(token) });
    },
    _postTokenToWeb() {
        if (!this.data.token)
            return;
        wx.createSelectorQuery().select('.shell-web-view').context((res) => {
            if (res?.postMessage)
                res.postMessage({ type: 'setToken', token: this.data.token });
        }).exec();
    },
    onMessage(e) {
        const msg = e?.detail?.data;
        if (!msg)
            return;
        if (msg.type === 'ready') {
            this._postTokenToWeb();
            this.setData({ loading: false, error: '' });
        }
        else if (msg.type === 'navigateTo' && msg.url) {
            wx.navigateTo({ url: msg.url });
        }
        else if (msg.type === 'navigateBack') {
            wx.navigateBack({ delta: msg.delta || 1 });
        }
        else if (msg.type === 'redirect' && msg.url) {
            wx.redirectTo({ url: msg.url });
        }
    },
    onError() {
        this.setData({ loading: false, error: '网页加载失败，请检查网络连接或稍后重试' });
    },
    onRetry() {
        this.setData({ loading: true, error: '', WebViewUrl: this._urlWithToken(this.data.token) });
    },
    /** 分享给朋友 */
    onShareAppMessage() {
        return {
            title: '♟️ MyChess 国际象棋 · AI 陪练在线对弈',
            path: '/pages/choice/choice',
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

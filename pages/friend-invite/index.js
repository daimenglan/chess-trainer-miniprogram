"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 好友邀请落地页
 *
 * 扫码（options.scene）或点链接（options.token）进来的第一站。
 * 目标：不管对方是不是新用户，走完这一页都成为好友并在页面上给出下一步。
 *
 * 未登录时不能直接兑换（兑换接口需登录鉴权），所以把 token 存进 globalData
 * 再引导登录；登录成功后登录页回跳本页，由本页完成兑换。
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const friendInvite = require('../../utils/friendInvite');
const { trackEvent } = require('../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        /** 'redeeming' | 'success' | 'error' | 'needLogin' | 'invalid' */
        status: 'redeeming',
        errorMessage: '',
        /** 兑换成功后的对手信息 */
        result: null,
    },
    _token: '',
    _syncTheme() {
        try {
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    onLoad(options) {
        this._syncTheme();
        // 二维码走 scene，链接走 token（微信版本差异下也可能落在 q 上）
        const token = friendInvite.parseInviteToken(options);
        if (!token) {
            this.setData({
                status: 'invalid',
                errorMessage: '没有识别到邀请信息，请让好友重新分享一次',
            });
            return;
        }
        this._token = token;
        trackEvent('friend_invite_landing');
        // 存起来：未登录时登录页要用它回跳，已登录时本页直接用
        app.globalData.pendingFriendInvite = { token };
        if (!app.globalData.token) {
            this.setData({ status: 'needLogin' });
            return;
        }
        this._redeem();
    },
    onShow() {
        this._syncTheme();
        // 从登录页回跳回来后自动继续兑换
        if (this.data.status === 'needLogin' && app.globalData.token && this._token) {
            this._redeem();
        }
    },
    _redeem() {
        const token = this._token;
        if (!token)
            return;
        this.setData({ status: 'redeeming', errorMessage: '' });
        api.redeemShareToken(token)
            .then((res) => {
            const raw = res?.data || res || {};
            const result = friendInvite.describeRedeemResult(raw);
            // 兑换已完成，清掉待办，避免登录页再次回跳
            app.globalData.pendingFriendInvite = null;
            trackEvent('friend_invite_redeemed');
            this.setData({ status: 'success', result });
            try {
                wx.vibrateShort({ type: 'light' });
            }
            catch (e) { /* 部分基础库不支持 */ }
        })
            .catch((err) => {
            // 失败原因按后端原话展示（链接无效 / 已过期 / 已被使用 / 不能兑换自己生成的）
            this.setData({
                status: 'error',
                errorMessage: err?.message || '邀请链接无效或已过期',
            });
        });
    },
    onRetry() {
        if (!app.globalData.token) {
            this.onGoLogin();
            return;
        }
        this._redeem();
    },
    onGoLogin() {
        wx.navigateTo({ url: '/pages/login/login' });
    },
    onGoFriends() {
        // 已处理完（或已放弃）本次邀请：清掉待办，避免之后从别处登录时又被弹回本页
        app.globalData.pendingFriendInvite = null;
        wx.redirectTo({ url: '/pages/friends/friends' });
    },
    /** 接受邀请后直接进对弈页摆桌，比干看着"已成为好友"更有下一步 */
    onGoPlay() {
        app.globalData.pendingFriendInvite = null;
        wx.redirectTo({ url: '/pages/online/online' });
    },
    /**
     * 返回。
     *
     * 未登录时点「稍后再说」属于明确放弃：一并清掉待办，
     * 否则用户之后从任意入口登录，都会莫名被重定向回本页。
     */
    onBack() {
        app.globalData.pendingFriendInvite = null;
        util.navigateBackSafe('/pages/choice/choice');
    },
});

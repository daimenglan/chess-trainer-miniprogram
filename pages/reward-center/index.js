"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 奖励中心页
 */
const app = getApp();
const api = require('../../utils/api');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        rewards: [],
        loading: true,
    },
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
    onShow() {
        this._syncTheme();
        if (!app.globalData.token) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.loadRewards();
    },
    async loadRewards() {
        this.setData({ loading: true });
        try {
            // 通过龙币接口获取奖励记录
            const res = await api.getDragonCoinExchangeRecords(1, 20).catch(() => null);
            const data = res?.data || res || [];
            this.setData({ rewards: data, loading: false });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onBack() {
        wx.navigateBack();
    },
});

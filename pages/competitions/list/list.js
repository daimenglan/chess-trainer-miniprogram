"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 竞赛列表页
 */
const app = getApp();
const api = require('../../../utils/api');
Page({
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
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        competitions: [],
        loading: true,
        page: 1,
        pageSize: 20,
        hasMore: true,
    },
    onShow() {
        this._syncTheme();
        if (!app.globalData.token) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.loadCompetitions();
    },
    onUnload() { },
    async loadCompetitions() {
        this.setData({ loading: true });
        try {
            const res = await api.getCompetitions({ page: this.data.page, limit: this.data.pageSize });
            const list = res?.data || res || [];
            this.setData({
                competitions: this.data.page === 1 ? list : this.data.competitions.concat(list),
                loading: false,
                hasMore: list.length >= this.data.pageSize,
            });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onCompetitionTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/competitions/detail/detail?id=${id}` });
    },
    onRefresh() {
        this.setData({ page: 1 });
        this.loadCompetitions();
    },
    onLoadMore() {
        if (this.data.hasMore) {
            this.setData({ page: this.data.page + 1 });
            this.loadCompetitions();
        }
    },
    onBack() {
        wx.navigateBack();
    },
});

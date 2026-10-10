"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 竞赛详情页
 */
const app = getApp();
const api = require('../../../utils/api');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        competition: null,
        loading: true,
        competitionId: 0,
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
    onLoad(e) {
        this._syncTheme();
        const id = parseInt(e.id) || 0;
        this.setData({ competitionId: id });
        // 赛事详情是公开内容（后端 GET /competitions/:id 不挂 requireAuth），
        // 游客可直接浏览赛事信息、积分榜与对阵表；报名参赛才需账号。
        this.loadDetail();
    },
    async loadDetail() {
        this.setData({ loading: true });
        try {
            const res = await api.getCompetitionDetail(this.data.competitionId);
            const data = res?.data || res;
            this.setData({ competition: data, loading: false });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onJoin() {
        // 报名要写入参赛记录（后端 POST /:id/register 挂 requireAuth），需账号；
        // 未登录时给出登录引导并允许取消，取消则留在本页继续浏览赛事信息。
        if (!app.globalData.token) {
            wx.showModal({
                title: '登录提示',
                content: '报名参赛需要登录后使用，是否前往登录？',
                confirmText: '去登录',
                cancelText: '再逛逛',
                success: (res) => {
                    if (res.confirm)
                        wx.navigateTo({ url: '/pages/login/login' });
                },
            });
            return;
        }
        wx.showModal({
            title: '确认报名',
            content: '确定要报名参加这个竞赛吗？',
            success: (res) => {
                if (res.confirm) {
                    api.joinCompetition(this.data.competitionId)
                        .then(() => {
                        wx.showToast({ title: '报名成功', icon: 'success' });
                        this.loadDetail();
                    })
                        .catch((err) => {
                        wx.showToast({ title: err.message || '报名失败', icon: 'none' });
                    });
                }
            },
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

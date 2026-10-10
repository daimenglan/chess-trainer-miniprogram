"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 我的习题页
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        puzzles: [],
        stats: null,
        loading: true,
        activeTab: 'all',
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
        if (!util.requireLogin('我的习题')) {
            return;
        }
        this.loadAll();
    },
    async loadAll() {
        this.setData({ loading: true });
        try {
            const [puzzlesRes, statsRes] = await Promise.all([
                api.getUserPuzzles({ page: 1, pageSize: 20 }).catch(() => null),
                api.getUserPuzzleStats().catch(() => null),
            ]);
            this.setData({
                puzzles: puzzlesRes?.data?.puzzles || puzzlesRes?.puzzles || [],
                stats: statsRes?.data || statsRes || null,
                loading: false,
            });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onTabChange(e) {
        this.setData({ activeTab: e.detail });
    },
    onPuzzleTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/puzzles/user-solve/user-solve?id=${id}` });
    },
    onCreatePuzzle() {
        wx.showModal({
            title: '创建习题',
            content: '请从对局中选择一个局面创建习题',
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: '/pages/analysis/analysis' });
                }
            },
        });
    },
    onDeletePuzzle(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '确认删除',
            content: '确定要删除这个习题吗？',
            success: (res) => {
                if (res.confirm) {
                    api.deleteUserPuzzle(id)
                        .then(() => {
                        wx.showToast({ title: '已删除', icon: 'success' });
                        this.loadAll();
                    })
                        .catch((err) => {
                        wx.showToast({ title: err.message || '删除失败', icon: 'none' });
                    });
                }
            },
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

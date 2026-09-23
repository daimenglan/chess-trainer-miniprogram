"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 分销商管理
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');
Page({
    _syncTheme() {
        try {
            const a = getApp();
            const t = a?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== t)
                this.setData({ __theme__: t });
        }
        catch (e) { /* non-critical */ }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        distributors: [],
        loading: false,
    },
    onLoad() { if (!this.checkAdmin())
        return; this._syncTheme(); this.load(); },
    onShow() { this._syncTheme(); if (!this.checkAdmin())
        return; this.load(); },
    checkAdmin() {
        if (!util.isAdminUser()) {
            wx.showToast({ title: '权限不足', icon: 'none' });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800);
            return false;
        }
        return true;
    },
    load() {
        this.setData({ loading: true });
        api.getDistributors({ page: 1, limit: 50 }).then((res) => {
            this.setData({ distributors: res?.data?.items || res?.data || [] });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    onToggle(e) {
        const idx = e.currentTarget.dataset.index;
        const d = this.data.distributors[idx];
        api.toggleDistributorStatus(d._id || d.id, d.status !== 'active').then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
    },
});

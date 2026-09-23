"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 分销管理
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
        settings: {},
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
        api.getDistributionSettings().then((res) => {
            this.setData({ settings: res?.data || {} });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    goDistributors() { wx.navigateTo({ url: '/pages/admin/admin-distributors/admin-distributors' }); },
    goRecords() { wx.navigateTo({ url: '/pages/admin/admin-commission-records/admin-commission-records' }); },
    goRules() { wx.navigateTo({ url: '/pages/admin/admin-commission-rules/admin-commission-rules' }); },
    onEnabledChange(e) {
        const enabled = e.detail.value;
        this.setData({ 'settings.enabled': enabled });
        api.updateDistributionSettings({ enabled }).then(() => {
            wx.showToast({ title: '已保存', icon: 'success' });
        }).catch((err) => wx.showToast({ title: err?.message || '保存失败', icon: 'none' }));
    },
});

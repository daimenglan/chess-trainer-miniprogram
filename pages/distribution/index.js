"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 分销中心页
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const { trackEvent } = require('../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        profile: null,
        referralInfo: {},
        commissions: [],
        loading: true,
        activeTab: 'overview',
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
        if (!util.requireLogin('分销推广')) {
            return;
        }
        this.loadAll();
    },
    async loadAll() {
        this.setData({ loading: true });
        try {
            const [profileRes, referralRes, commissionRes] = await Promise.all([
                api.getMyDistributionProfile().catch(() => null),
                api.getMyReferralInfo().catch(() => null),
                api.getMyCommissions(1, 10).catch(() => null),
            ]);
            this.setData({
                profile: profileRes?.data || profileRes || null,
                referralInfo: referralRes?.data || referralRes || null,
                commissions: commissionRes?.data?.records || commissionRes?.records || [],
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
    onActivate() {
        trackEvent('distributor_activate');
        wx.showModal({
            title: '确认激活',
            content: '确定要激活成为分销员吗？',
            success: (res) => {
                if (res.confirm) {
                    api.activateDistributor()
                        .then(() => {
                        wx.showToast({ title: '激活成功', icon: 'success' });
                        this.loadAll();
                    })
                        .catch((err) => {
                        wx.showToast({ title: err.message || '激活失败', icon: 'none' });
                    });
                }
            },
        });
    },
    onRegenerateCode() {
        api.regenerateReferralCode()
            .then((res) => {
            wx.showToast({ title: '推广码已更新', icon: 'success' });
            this.loadAll();
        })
            .catch((err) => {
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

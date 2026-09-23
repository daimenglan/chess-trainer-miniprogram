"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 提现管理
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
        withdrawals: [],
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
        api.getAdminWithdrawals({ page: 1, limit: 50 }).then((res) => {
            this.setData({ withdrawals: res?.data?.items || res?.data || [] });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    onApprove(e) {
        const idx = e.currentTarget.dataset.index;
        const w = this.data.withdrawals[idx];
        api.approveWithdrawal(w._id || w.id).then(() => { wx.showToast({ title: '已批准', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
    },
    onReject(e) {
        const idx = e.currentTarget.dataset.index;
        const w = this.data.withdrawals[idx];
        wx.showModal({
            title: '拒绝提现', content: '请输入拒绝原因',
            editable: true,
            success: (res) => {
                if (res.confirm) {
                    api.rejectWithdrawal(w._id || w.id, res.content).then(() => { wx.showToast({ title: '已拒绝', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
    onComplete(e) {
        const idx = e.currentTarget.dataset.index;
        const w = this.data.withdrawals[idx];
        api.completeWithdrawal(w._id || w.id).then(() => { wx.showToast({ title: '已完成', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
    },
});

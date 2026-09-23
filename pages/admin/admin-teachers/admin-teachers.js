"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 教师管理
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
        teachers: [],
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
        api.getAdminTeachers().then((res) => {
            this.setData({ teachers: res?.data?.items || res?.data || [] });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    onApprove(e) {
        const idx = e.currentTarget.dataset.index;
        const t = this.data.teachers[idx];
        wx.showModal({
            title: '审核教师', content: '确定通过 "' + (t.nickname || '') + '" 的教师申请吗？',
            success: (res) => {
                if (res.confirm) {
                    api.approveTeacher(t._id || t.id).then(() => { wx.showToast({ title: '已通过', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
    onReject(e) {
        const idx = e.currentTarget.dataset.index;
        const t = this.data.teachers[idx];
        wx.showModal({
            title: '拒绝申请', content: '确定拒绝 "' + (t.nickname || '') + '" 的教师申请吗？',
            success: (res) => {
                if (res.confirm) {
                    api.rejectTeacher(t._id || t.id).then(() => { wx.showToast({ title: '已拒绝', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
});

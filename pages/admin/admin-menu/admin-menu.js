"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 菜单管理 — 与网页版一致：支持 hidden 可见/隐藏切换
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
        menus: [],
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
        api.getAdminMenuList().then((res) => {
            this.setData({ menus: res?.data?.items || res?.data || [] });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    /** 切换菜单项可见/隐藏（与网页版 hidden 一致） */
    onToggleMenu(e) {
        const idx = e.currentTarget.dataset.index;
        const m = this.data.menus[idx];
        const id = m._id || m.id;
        const nextHidden = !m.hidden;
        api.updateAdminMenuVisibility([{ id, hidden: nextHidden }]).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
    },
    onCreate() { wx.navigateTo({ url: '/pages/admin/admin-menu/edit/admin-menu-edit' }); },
    onEdit(e) {
        const idx = e.currentTarget.dataset.index;
        const m = this.data.menus[idx];
        wx.navigateTo({ url: '/pages/admin/admin-menu/edit/admin-menu-edit?id=' + (m._id || m.id) });
    },
    onDelete(e) {
        const idx = e.currentTarget.dataset.index;
        const m = this.data.menus[idx];
        wx.showModal({
            title: '确认删除', content: '确定删除菜单项 "' + (m.label || '') + '" 吗？',
            success: (res) => {
                if (res.confirm) {
                    api.deleteAdminMenu(m._id || m.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * AI Bot 管理 — 与网页版一致：支持启用/禁用、批量操作
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
        bots: [],
        loading: false,
    },
    onLoad() { if (!this.checkAdmin())
        return; this._syncTheme(); this.loadBots(); },
    onShow() { this._syncTheme(); if (!this.checkAdmin())
        return; this.loadBots(); },
    checkAdmin() {
        if (!util.isAdminUser()) {
            wx.showToast({ title: '权限不足', icon: 'none' });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800);
            return false;
        }
        return true;
    },
    loadBots() {
        this.setData({ loading: true });
        api.getAdminAiBots().then((res) => {
            this.setData({ bots: res?.data?.items || res?.data || [] });
        }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
    },
    /** 启用/禁用切换（与网页版 toggleAdminAiBot 一致） */
    onToggleBot(e) {
        const idx = e.currentTarget.dataset.index;
        const bot = this.data.bots[idx];
        const id = bot._id || bot.id;
        const newStatus = bot.enabled ? 'disable' : 'enable';
        wx.showModal({
            title: newStatus === 'enable' ? '启用 Bot' : '禁用 Bot',
            content: `确定${newStatus === 'enable' ? '启用' : '禁用'} "${bot.name}" 吗？`,
            success: (res) => {
                if (res.confirm) {
                    api.toggleAdminAiBot(id).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.loadBots(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
    onCreateBot() {
        wx.navigateTo({ url: '/pages/admin/admin-ai-bots/create' });
    },
    onEditBot(e) {
        const idx = e.currentTarget.dataset.index;
        const bot = this.data.bots[idx];
        wx.navigateTo({ url: '/pages/admin/admin-ai-bots/edit?id=' + (bot._id || bot.id) });
    },
    onDeleteBot(e) {
        const idx = e.currentTarget.dataset.index;
        const bot = this.data.bots[idx];
        wx.showModal({
            title: '确认删除', content: '确定删除 AI Bot "' + (bot.name || '') + '" 吗？',
            success: (res) => {
                if (res.confirm) {
                    api.deleteAdminAiBot(bot._id || bot.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadBots(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
                }
            }
        });
    },
});

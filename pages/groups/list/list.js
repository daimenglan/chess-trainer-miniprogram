"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 群组列表页
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');
const { trackEvent } = require('../../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        groups: [],
        loading: true,
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
        if (!util.requireLogin('群组')) {
            return;
        }
        this.loadGroups();
    },
    async loadGroups() {
        this.setData({ loading: true });
        try {
            const res = await api.getUserGroups();
            const list = res?.data || res || [];
            this.setData({ groups: list, loading: false });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onGroupTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/groups/chat/chat?id=${id}` });
    },
    onCreateGroup() {
        trackEvent('group_create');
        wx.showModal({
            title: '创建群组',
            content: '请输入群名称',
            editable: true,
            placeholderText: '群名称',
            success: (res) => {
                if (res.confirm && res.input && res.input.trim()) {
                    api.createGroup(res.input.trim())
                        .then(() => {
                        wx.showToast({ title: '创建成功', icon: 'success' });
                        this.loadGroups();
                    })
                        .catch((err) => {
                        wx.showToast({ title: err.message || '创建失败', icon: 'none' });
                    });
                }
            },
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

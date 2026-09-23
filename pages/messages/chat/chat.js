"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 消息聊天页
 */
const app = getApp();
const api = require('../../../utils/api');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        userId: 0,
        username: '',
        messages: [],
        inputText: '',
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
    onLoad(e) {
        this._syncTheme();
        const userId = parseInt(e.userId) || 0;
        const username = e.username || '';
        this.setData({ userId, username });
        if (!app.globalData.token) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.loadMessages();
    },
    async loadMessages() {
        this.setData({ loading: true });
        try {
            const res = await api.getConversation(this.data.userId);
            const list = res?.data || res || [];
            this.setData({ messages: list, loading: false });
            setTimeout(() => this.scrollToBottom(), 300);
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onInput(e) {
        this.setData({ inputText: e.detail.value });
    },
    onSend() {
        const text = this.data.inputText.trim();
        if (!text)
            return;
        api.sendMessage({ toUserId: this.data.userId, content: text, type: 'text' })
            .then((res) => {
            const msg = res?.data || res;
            this.data.messages.push({
                ...msg,
                fromUserId: app.globalData.user?.userId,
                toUserId: this.data.userId,
                content: text,
                createdAt: new Date().toISOString(),
            });
            this.setData({ messages: this.data.messages, inputText: '' });
            setTimeout(() => this.scrollToBottom(), 100);
        })
            .catch((err) => {
            wx.showToast({ title: err.message || '发送失败', icon: 'none' });
        });
    },
    scrollToBottom() {
        wx.createSelectorQuery().in(this).select('.messages-container').boundingClientRect((rect) => {
            if (rect) {
                wx.pageScrollTo({ scrollTop: rect.height, duration: 100 });
            }
        }).exec();
    },
    onBack() {
        wx.navigateBack();
    },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 群组聊天页 - 支持文本、表情、快捷短语、分享（棋谱/习题/邀请）
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');
const { trackEvent } = require('../../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        groupId: 0,
        groupName: '',
        messages: [],
        inputText: '',
        loading: true,
        // 面板状态
        showEmojiPanel: false,
        showPhrasePanel: false,
        showSharePanel: false,
        // 数据
        emojis: [],
        emojiCategories: [],
        quickPhrases: [],
        phraseCategories: [],
        groupMembers: [],
        groupInfo: null,
        // 分享数据
        sharePuzzles: [],
        shareRecords: [],
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
        const groupId = parseInt(e.id) || 0;
        this.setData({ groupId, groupName: e.name || '群聊' });
        if (!util.requireLogin('群聊')) {
            return;
        }
        this.loadMessages();
        this.loadEmojiData();
        this.loadPhraseData();
        this.loadGroupInfo();
    },
    async loadMessages() {
        this.setData({ loading: true });
        try {
            const res = await api.getGroupMessages(this.data.groupId, 1, 50);
            const list = res?.data || res || [];
            this.setData({ messages: list, loading: false });
            setTimeout(() => this.scrollToBottom(), 300);
        }
        catch {
            this.setData({ loading: false });
        }
    },
    async loadEmojiData() {
        try {
            const res = await api.getEmojis();
            const emojis = (res?.data || res || []);
            const categories = [...new Set(emojis.map((e) => e.category).filter(Boolean))];
            this.setData({ emojis, emojiCategories: categories });
        }
        catch { /* 静默 */ }
    },
    async loadPhraseData() {
        try {
            const res = await api.getQuickPhrases();
            const phrases = (res?.data || res || []);
            const categories = [...new Set(phrases.map((p) => p.category).filter(Boolean))];
            this.setData({ quickPhrases: phrases, phraseCategories: categories });
        }
        catch { /* 静默 */ }
    },
    async loadGroupInfo() {
        try {
            const res = await api.getGroupDetail(this.data.groupId);
            const info = res?.data || res || {};
            this.setData({
                groupInfo: info,
                groupMembers: info.members || [],
            });
        }
        catch { /* 静默 */ }
    },
    onInput(e) {
        this.setData({ inputText: e.detail.value });
    },
    /** 发送文本消息 */
    onSend() {
        const text = this.data.inputText.trim();
        if (!text)
            return;
        this._sendMessage('text', text);
    },
    /** 发送表情 */
    onSendEmoji(e) {
        const emoji = e.currentTarget.dataset.emoji;
        if (!emoji)
            return;
        this._sendMessage('emoji', emoji);
        this.setData({ showEmojiPanel: false });
    },
    /** 发送快捷短语 */
    onSendPhrase(e) {
        const text = e.currentTarget.dataset.text;
        if (!text)
            return;
        this._sendMessage('quick_phrase', text);
        this.setData({ showPhrasePanel: false });
    },
    /** 发送消息的统一方法 */
    _sendMessage(type, content) {
        trackEvent('social_send_message', { channel: 'group', type });
        api.sendGroupMessage(this.data.groupId, content, type)
            .then((res) => {
            const msg = res?.data || res;
            this.data.messages.push({
                ...msg,
                content,
                messageType: type,
                createdAt: new Date().toISOString(),
            });
            this.setData({ messages: this.data.messages, inputText: '' });
            setTimeout(() => this.scrollToBottom(), 100);
        })
            .catch((err) => {
            wx.showToast({ title: err.message || '发送失败', icon: 'none' });
        });
    },
    /** 切换表情面板 */
    onToggleEmoji() {
        this.setData({
            showEmojiPanel: !this.data.showEmojiPanel,
            showPhrasePanel: false,
            showSharePanel: false,
        });
    },
    /** 切换快捷短语面板 */
    onTogglePhrase() {
        this.setData({
            showPhrasePanel: !this.data.showPhrasePanel,
            showEmojiPanel: false,
            showSharePanel: false,
        });
    },
    /** 切换分享面板 */
    onToggleShare() {
        this.setData({
            showSharePanel: !this.data.showSharePanel,
            showEmojiPanel: false,
            showPhrasePanel: false,
        });
    },
    /** 关闭所有面板 */
    onClosePanels() {
        this.setData({ showEmojiPanel: false, showPhrasePanel: false, showSharePanel: false });
    },
    /** 头像文本：用户名首字符大写，无用户名时用 ? */
    formatAvatar(username) {
        if (!username)
            return '?';
        return username.charAt(0).toUpperCase();
    },
    scrollToBottom() {
        wx.createSelectorQuery().in(this).select('.messages-container').boundingClientRect((rect) => {
            if (rect) {
                wx.pageScrollTo({ scrollTop: rect.height, duration: 100 });
            }
        }).exec();
    },
    /** 查看成员 */
    onShowMembers() {
        wx.showActionSheet({
            itemList: ['取消'],
            success: (res) => { },
        });
        // 简单实现：用 modal 展示成员列表
        wx.showModal({
            title: `群成员（${this.data.groupMembers.length}人）`,
            content: this.data.groupMembers.map((m) => m.username || '?').join('、'),
            showCancel: false,
        });
    },
    onBack() {
        wx.navigateBack();
    },
    stopPropagation() { },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 意见反馈页
 */
const app = getApp();
const api = require('../../utils/api');
Page({
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
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        type: 'bug',
        content: '',
        contactInfo: '',
        loading: false,
        error: '',
        success: '',
        myFeedbacks: [],
        loadingList: true,
    },
    onShow() {
        this._syncTheme();
        if (!app.globalData.token) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.loadMyFeedbacks();
    },
    onTypeChange(e) {
        this.setData({ type: e.detail.value });
    },
    onContentInput(e) {
        this.setData({ content: e.detail.value, error: '' });
    },
    onContactInput(e) {
        this.setData({ contactInfo: e.detail.value });
    },
    onSubmit() {
        const { type, content } = this.data;
        if (!content.trim()) {
            this.setData({ error: '请填写反馈内容' });
            return;
        }
        this.setData({ loading: true, error: '', success: '' });
        api.submitFeedback({ type, content, contactInfo: this.data.contactInfo })
            .then((res) => {
            wx.showToast({ title: '反馈提交成功，谢谢！', icon: 'success' });
            this.setData({
                content: '',
                contactInfo: '',
                loading: false,
                success: '已提交',
            });
            this.loadMyFeedbacks();
        })
            .catch((err) => {
            this.setData({ error: err.message || '提交失败', loading: false });
        });
    },
    loadMyFeedbacks() {
        this.setData({ loadingList: true });
        api.getMyFeedback(1, 10)
            .then((res) => {
            const items = res?.data?.items || res?.items || [];
            this.setData({ myFeedbacks: items, loadingList: false });
        })
            .catch(() => {
            this.setData({ loadingList: false });
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

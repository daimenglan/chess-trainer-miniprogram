/**
 * 意见反馈页
 */
const app = getApp();
const api = require('../../utils/api');
const { trackEvent } = require('../../utils/analytics');

Page({
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    type: 'bug',
    content: '',
    contactInfo: '',
    loading: false,
    error: '',
    success: '',
    myFeedbacks: [] as any[],
    loadingList: true,
    /** 是否已登录：决定「我的反馈」区块是否展示（游客无可查询的历史） */
    loggedIn: false,
  },

  onShow() {
    this._syncTheme();
    // 意见反馈是微信审核明确要求「无需注册即可使用」的功能，且后端本就支持游客
    // 提交（user_id 可为空），这里不能拦。未登录时只跳过「我的反馈」列表。
    const loggedIn = !!app.globalData.token;
    this.setData({ loggedIn });
    if (loggedIn) {
      this.loadMyFeedbacks();
    } else {
      this.setData({ myFeedbacks: [], loadingList: false });
    }
  },

  onTypeChange(e: any) {
    this.setData({ type: e.detail.value });
  },

  onContentInput(e: any) {
    this.setData({ content: e.detail.value, error: '' });
  },

  onContactInput(e: any) {
    this.setData({ contactInfo: e.detail.value });
  },

  onSubmit() {
    const { type, content } = this.data;
    if (!content.trim()) {
      this.setData({ error: '请填写反馈内容' });
      return;
    }
    this.setData({ loading: true, error: '', success: '' });

    // 后端 FeedbackSubmitRequest 要求 title 必填（feedbackRoutes.ts 对 type/title/content
    // 三者做非空校验，缺 title 直接 400），而本页表单只有「类型 + 内容」两项。
    // 故用内容首行派生标题：既满足契约，又不必为一句话反馈额外增加一个输入框。
    const trimmed = content.trim();
    const firstLine = trimmed.split('\n')[0] || '';
    const title = firstLine.slice(0, 30) || '小程序意见反馈';

    // 字段名以 shared/types.ts 的 FeedbackSubmitRequest 为准：contact 而非 contactInfo
    api.submitFeedback({ type, title, content: trimmed, contact: this.data.contactInfo.trim() || undefined })
      .then((res: any) => {
        wx.showToast({ title: '反馈提交成功，谢谢！', icon: 'success' });
        trackEvent('feedback_submit', { type });
        this.setData({
          content: '',
          contactInfo: '',
          loading: false,
          success: '已提交，感谢您的反馈',
        });
        if (this.data.loggedIn) this.loadMyFeedbacks();
      })
      .catch((err: any) => {
        this.setData({ error: err.message || '提交失败', loading: false });
      });
  },

  loadMyFeedbacks() {
    this.setData({ loadingList: true });
    api.getMyFeedback(1, 10)
      .then((res: any) => {
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

export {};
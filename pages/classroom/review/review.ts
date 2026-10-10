/**
 * 教学反馈页
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    reviews: [] as any[],
    loading: true,
  },

  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  onShow() {
    this._syncTheme();
    if (!util.requireLogin('教学反馈')) {
      return;
    }
    this.loadReviews();
  },

  async loadReviews() {
    this.setData({ loading: true });
    try {
      // 教学反馈通过教师API获取
      const res = await api.getAdminTeacherApplications(1, 20).catch(() => null);
      const data = res?.data || res || [];
      this.setData({ reviews: data, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
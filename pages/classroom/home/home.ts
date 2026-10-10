/**
 * 教室主页（教师功能入口）
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    teacherStatus: null as any,
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
    if (!util.requireLogin('课堂')) {
      return;
    }
    this.loadTeacherStatus();
  },

  async loadTeacherStatus() {
    this.setData({ loading: true });
    try {
      const res = await api.getTeacherStatus();
      const data = res?.data || res;
      this.setData({ teacherStatus: data, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onApplyTeacher() {
    wx.showModal({
      title: '申请成为教师',
      content: '提交后需管理员审核，审核通过后即可使用教室功能',
      success: (res: any) => {
        if (res.confirm) {
          api.applyTeacher({})
            .then(() => {
              wx.showToast({ title: '申请已提交', icon: 'success' });
              this.loadTeacherStatus();
            })
            .catch((err: any) => {
              wx.showToast({ title: err.message || '申请失败', icon: 'none' });
            });
        }
      },
    });
  },

  onBoard() {
    wx.navigateTo({ url: '/pages/classroom/board/board' });
  },

  onCourseware() {
    wx.navigateTo({ url: '/pages/classroom/courseware/courseware' });
  },

  onReview() {
    wx.navigateTo({ url: '/pages/classroom/review/review' });
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
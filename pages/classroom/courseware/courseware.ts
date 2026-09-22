/**
 * 课件管理页
 */
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    coursewares: [] as any[],
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
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadCoursewares();
  },

  async loadCoursewares() {
    this.setData({ loading: true });
    try {
      const res = await api.listCoursewares();
      const list = res?.data || res || [];
      this.setData({ coursewares: list, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onCoursewareTap(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/classroom/courseware/detail/detail?id=${id}` });
  },

  onCreate() {
    wx.showModal({
      title: '创建课件',
      content: '请输入课件名称',
      editable: true,
      placeholderText: '课件名称',
      success: (res: any) => {
        if (res.confirm && res.input && res.input.trim()) {
          api.createCourseware({ name: res.input.trim() })
            .then(() => { wx.showToast({ title: '创建成功', icon: 'success' }); this.loadCoursewares(); })
            .catch((err: any) => { wx.showToast({ title: err.message || '创建失败', icon: 'none' }); });
        }
      },
    });
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
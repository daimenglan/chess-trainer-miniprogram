/**
 * 群组列表页
 */
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    groups: [] as any[],
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
    this.loadGroups();
  },

  async loadGroups() {
    this.setData({ loading: true });
    try {
      const res = await api.getUserGroups();
      const list = res?.data || res || [];
      this.setData({ groups: list, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onGroupTap(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/groups/chat/chat?id=${id}` });
  },

  onCreateGroup() {
    wx.showModal({
      title: '创建群组',
      content: '请输入群名称',
      editable: true,
      placeholderText: '群名称',
      success: (res: any) => {
        if (res.confirm && res.input && res.input.trim()) {
          api.createGroup(res.input.trim())
            .then(() => {
              wx.showToast({ title: '创建成功', icon: 'success' });
              this.loadGroups();
            })
            .catch((err: any) => {
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

export {};
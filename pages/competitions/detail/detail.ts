/**
 * 竞赛详情页
 */
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    competition: null as any,
    loading: true,
    competitionId: 0,
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

  onLoad(e: any) {
    this._syncTheme();
    const id = parseInt(e.id) || 0;
    this.setData({ competitionId: id });
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await api.getCompetitionDetail(this.data.competitionId);
      const data = res?.data || res;
      this.setData({ competition: data, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onJoin() {
    wx.showModal({
      title: '确认报名',
      content: '确定要报名参加这个竞赛吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.joinCompetition(this.data.competitionId)
            .then(() => {
              wx.showToast({ title: '报名成功', icon: 'success' });
              this.loadDetail();
            })
            .catch((err: any) => {
              wx.showToast({ title: err.message || '报名失败', icon: 'none' });
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
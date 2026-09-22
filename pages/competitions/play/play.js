/**
 * 竞赛对弈页
 */
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    matchId: '',
    match: null,
    loading: true,
  },

  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) {}
  },

  onLoad(e) {
    this._syncTheme();
    const matchId = e.matchId || e.id || '';
    this.setData({ matchId });
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadMatch();
  },

  async loadMatch() {
    this.setData({ loading: true });
    try {
      const res = await api.getCompetitionMatch(this.data.matchId);
      const data = res?.data || res;
      this.setData({ match: data, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onMove(e) {
    const move = e.detail.move;
    api.submitCompetitionMove(this.data.matchId, move)
      .then(() => { this.loadMatch(); })
      .catch((err) => {
        wx.showToast({ title: err.message || '走子失败', icon: 'none' });
      });
  },

  onBack() {
    wx.navigateBack();
  },
});

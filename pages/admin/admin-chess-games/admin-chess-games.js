/**
 * 棋谱管理
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) {}
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    games: [],
    loading: false,
    page: 1,
    total: 0,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); this.loadGames(); },
  onShow() { this._syncTheme(); if (!this.checkAdmin()) return; this.loadGames(); },
  checkAdmin() {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  loadGames() {
    this.setData({ loading: true });
    api.getChessGameRecords({ page: this.data.page, limit: 20 }).then((res) => {
      const items = res?.data?.items || res?.data || [];
      this.setData({ games: items, total: res?.data?.total || items.length });
    }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onGameDetail(e) {
    const idx = e.currentTarget.dataset.index;
    const game = this.data.games[idx];
    wx.navigateTo({ url: '/pages/admin/admin-game-detail/admin-game-detail?id=' + (game._id || game.id) });
  },
  onDeleteGame(e) {
    const idx = e.currentTarget.dataset.index;
    const game = this.data.games[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除该棋谱吗？',
      success: (res) => {
        if (res.confirm) {
          api.deleteRecord(game._id || game.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.loadGames(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});

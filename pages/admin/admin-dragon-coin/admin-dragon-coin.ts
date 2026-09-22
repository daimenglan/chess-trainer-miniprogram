/**
 * 龙币管理 — 与网页版一致：支持兑换配置/兑换项的 isActive 启用/禁用
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    configs: [] as any[],
    exchanges: [] as any[],
    loading: false,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); this.loadData(); },
  onShow() { this._syncTheme(); if (!this.checkAdmin()) return; this.loadData(); },
  checkAdmin(): boolean {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  loadData() {
    this.setData({ loading: true });
    Promise.all([
      api.getAdminDragonCoinConfigs().catch(() => ({ data: [] })),
      api.getAdminDragonCoinExchanges().catch(() => ({ data: [] })),
    ]).then((results: any[]) => {
      this.setData({
        configs: results[0]?.data?.items || results[0]?.data || [],
        exchanges: results[1]?.data?.items || results[1]?.data || [],
      });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换兑换配置启用/禁用（与网页版 isActive 一致） */
  onToggleConfig(e: any) {
    const idx = e.currentTarget.dataset.index;
    const cfg = this.data.configs[idx];
    const id = cfg._id || cfg.id;
    const next = cfg.isActive ? 0 : 1;
    api.updateDragonCoinConfig(id, { isActive: next }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.loadData(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  /** 切换兑换项启用/禁用 */
  onToggleExchange(e: any) {
    const idx = e.currentTarget.dataset.index;
    const ex = this.data.exchanges[idx];
    const id = ex._id || ex.id;
    const next = ex.isActive ? 0 : 1;
    api.updateDragonCoinExchange(id, { isActive: next }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.loadData(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
});
export {};
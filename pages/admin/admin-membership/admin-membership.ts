/**
 * 会员管理 — 与网页版一致：支持会员等级 status 启用/停用切换
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    levels: [] as any[],
    loading: false,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); this.load(); },
  onShow() { this._syncTheme(); if (!this.checkAdmin()) return; this.load(); },
  checkAdmin(): boolean {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  load() {
    this.setData({ loading: true });
    api.getAdminMembershipLevels().then((res: any) => {
      this.setData({ levels: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换会员等级启用/停用（与网页版 toggleStatus 一致） */
  onToggleLevel(e: any) {
    const idx = e.currentTarget.dataset.index;
    const level = this.data.levels[idx];
    const id = level._id || level.id;
    const next = level.status === 1 ? 0 : 1;
    api.updateAdminMembershipLevel(id, { status: next }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  goOrders() { wx.navigateTo({ url: '/pages/admin/admin-membership-orders/admin-membership-orders' }); },
  goCodes() { wx.navigateTo({ url: '/pages/admin/admin-membership-codes/admin-membership-codes' }); },
});
export {};
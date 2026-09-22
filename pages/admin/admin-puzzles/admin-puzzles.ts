/**
 * 习题管理 — 与网页版一致：支持 isValid 启用/禁用切换
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    puzzles: [] as any[],
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
    api.getAdminPuzzlesList().then((res: any) => {
      this.setData({ puzzles: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换习题启用/禁用（与网页版 isValid toggle 一致） */
  onTogglePuzzle(e: any) {
    const idx = e.currentTarget.dataset.index;
    const p = this.data.puzzles[idx];
    const id = p._id || p.id;
    const next = p.isValid ? 0 : 1;
    api.updateAdminPuzzle(id, { isValid: next }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  onCreate() { wx.navigateTo({ url: '/pages/admin/admin-puzzles/edit/admin-puzzles-edit' }); },
  onEdit(e: any) {
    const idx = e.currentTarget.dataset.index;
    const p = this.data.puzzles[idx];
    wx.navigateTo({ url: '/pages/admin/admin-puzzles/edit/admin-puzzles-edit?id=' + (p._id || p.id) });
  },
  onDelete(e: any) {
    const idx = e.currentTarget.dataset.index;
    const p = this.data.puzzles[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除该习题吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.deleteAdminPuzzle(p._id || p.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
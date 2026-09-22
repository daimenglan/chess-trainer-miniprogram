/**
 * 知识库管理 — 与网页版一致：支持 status 启用/禁用切换
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    items: [] as any[],
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
    api.getAdminKnowledgeList().then((res: any) => {
      this.setData({ items: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换知识条目启用/禁用 */
  onToggleItem(e: any) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.items[idx];
    const id = item._id || item.id;
    const nextStatus = item.status === 'active' ? 'disabled' : 'active';
    api.updateKnowledge(id, { status: nextStatus }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  onCreate() { wx.navigateTo({ url: '/pages/admin/admin-knowledge/edit/admin-knowledge-edit' }); },
  onEdit(e: any) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.items[idx];
    wx.navigateTo({ url: '/pages/admin/admin-knowledge/edit/admin-knowledge-edit?id=' + (item._id || item.id) });
  },
  onDelete(e: any) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.items[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除该知识条目吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.deleteKnowledge(item._id || item.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
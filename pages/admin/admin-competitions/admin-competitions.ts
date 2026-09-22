/**
 * 竞赛管理 — 与网页版一致：支持邀请制开关 toggle
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    competitions: [] as any[],
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
    api.getCompetitions().then((res: any) => {
      this.setData({ competitions: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换邀请制开关（与网页版 invitationOnly 一致） */
  onToggleInvite(e: any) {
    const idx = e.currentTarget.dataset.index;
    const c = this.data.competitions[idx];
    const id = c._id || c.id;
    api.updateCompetition(id, { invitationOnly: !c.invitationOnly }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  onCreate() { wx.navigateTo({ url: '/pages/admin/admin-competition-create/admin-competition-create' }); },
  onEdit(e: any) {
    const idx = e.currentTarget.dataset.index;
    const c = this.data.competitions[idx];
    wx.navigateTo({ url: '/pages/admin/admin-competition-edit/admin-competition-edit?id=' + (c._id || c.id) });
  },
  onDelete(e: any) {
    const idx = e.currentTarget.dataset.index;
    const c = this.data.competitions[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除竞赛 "' + (c.title || '') + '" 吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.deleteCompetition(c._id || c.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
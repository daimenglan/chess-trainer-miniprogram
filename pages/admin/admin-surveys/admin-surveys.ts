/**
 * 问卷调查管理 — 与网页版一致：支持 status 启用/关闭切换
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    surveys: [] as any[],
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
    api.getAdminSurveys().then((res: any) => {
      this.setData({ surveys: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  /** 切换问卷启用/关闭（与网页版 status 一致） */
  onToggleSurvey(e: any) {
    const idx = e.currentTarget.dataset.index;
    const s = this.data.surveys[idx];
    const id = s._id || s.id;
    const next = s.status === 'active' ? 'closed' : 'active';
    api.updateSurvey(id, { status: next }).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
  onCreate() { wx.navigateTo({ url: '/pages/admin/admin-surveys/edit/admin-surveys-edit' }); },
  onEdit(e: any) {
    const idx = e.currentTarget.dataset.index;
    const s = this.data.surveys[idx];
    wx.navigateTo({ url: '/pages/admin/admin-surveys/edit/admin-surveys-edit?id=' + (s._id || s.id) });
  },
  onDelete(e: any) {
    const idx = e.currentTarget.dataset.index;
    const s = this.data.surveys[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除该问卷吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.deleteAdminSurvey(s._id || s.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
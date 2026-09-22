/**
 * 佣金规则
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    rules: [] as any[],
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
    api.getCommissionRules().then((res: any) => {
      this.setData({ rules: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onCreate() {
    wx.showModal({
      title: '新建规则', content: '请输入级别、比例(%)、条件',
      editable: true,
      success: (res: any) => {
        if (res.confirm && res.content) {
          // Simple parse: "level:rate:condition"
          const parts = res.content.split(':');
          api.createCommissionRule({
            level: parts[0] || 'default',
            rate: parseFloat(parts[1]) || 0,
            condition: parts[2] || '',
          }).then(() => { wx.showToast({ title: '已创建', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
  onDelete(e: any) {
    const idx = e.currentTarget.dataset.index;
    const r = this.data.rules[idx];
    wx.showModal({
      title: '确认删除', content: '确定删除该佣金规则吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.deleteCommissionRule(r._id || r.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
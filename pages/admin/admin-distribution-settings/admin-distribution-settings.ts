/**
 * 分销设置
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    settings: { enabled: false, defaultCommissionRate: 10, minWithdrawal: 10 } as any,
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
    api.getDistributionSettings().then((res: any) => {
      this.setData({ settings: res?.data || {} });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onEnabledChange(e: any) { this.setData({ 'settings.enabled': e.detail.value }); },
  onRateInput(e: any) { this.setData({ 'settings.defaultCommissionRate': parseInt(e.detail.value) || 0 }); },
  onMinInput(e: any) { this.setData({ 'settings.minWithdrawal': parseInt(e.detail.value) || 0 }); },
  onSave() {
    this.setData({ loading: true });
    api.updateDistributionSettings(this.data.settings).then(() => { wx.showToast({ title: '已保存', icon: 'success' }); }).catch((err: any) => wx.showToast({ title: err?.message || '保存失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
});
export {};
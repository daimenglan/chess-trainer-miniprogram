/**
 * 会员兑换码
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    codes: [] as any[],
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
    api.getMembershipCodes({ page: 1, limit: 50 }).then((res: any) => {
      this.setData({ codes: res?.data?.items || res?.data || [] });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onGenerate() {
    wx.showModal({
      title: '生成兑换码', content: '请输入数量和天数（如: 10,30 表示10个码，30天有效）',
      editable: true,
      success: (res: any) => {
        if (res.confirm && res.content) {
          const parts = res.content.split(',');
          api.generateMembershipCodes({
            count: parseInt(parts[0]) || 10,
            days: parseInt(parts[1]) || 30,
          }).then(() => { wx.showToast({ title: '已生成', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
  onDisable(e: any) {
    const idx = e.currentTarget.dataset.index;
    const c = this.data.codes[idx];
    api.disableMembershipCode(c._id || c.id).then(() => { wx.showToast({ title: '已禁用', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
  },
});
export {};
/**
 * 创建竞赛
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) {}
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    form: { title: '', description: '', status: 'active', maxParticipants: 100 },
    loading: false,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); },
  checkAdmin() {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }); },
  onDescInput(e) { this.setData({ 'form.description': e.detail.value }); },
  onMaxInput(e) { this.setData({ 'form.maxParticipants': parseInt(e.detail.value) || 100 }); },
  onSubmit() {
    if (!this.data.form.title) { wx.showToast({ title: '请输入竞赛标题', icon: 'none' }); return; }
    this.setData({ loading: true });
    api.createCompetition(this.data.form).then(() => { wx.showToast({ title: '已创建', icon: 'success' }); setTimeout(() => wx.navigateBack(), 1500); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
});

/**
 * 编辑竞赛
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    form: { title: '', description: '', status: 'active', maxParticipants: 100 } as any,
    loading: false,
    id: '',
  },
  onLoad(options: any) {
    if (!this.checkAdmin()) return;
    this._syncTheme();
    this.setData({ id: options.id || '' });
    if (this.data.id) this.loadDetail();
  },
  checkAdmin(): boolean {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  loadDetail() {
    this.setData({ loading: true });
    api.getCompetitionDetail(this.data.id).then((res: any) => {
      const d = res?.data || {};
      this.setData({ form: { title: d.title || '', description: d.description || '', status: d.status || 'active', maxParticipants: d.maxParticipants || 100 } });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onTitleInput(e: any) { this.setData({ 'form.title': e.detail.value }); },
  onDescInput(e: any) { this.setData({ 'form.description': e.detail.value }); },
  onMaxInput(e: any) { this.setData({ 'form.maxParticipants': parseInt(e.detail.value) || 100 }); },
  onSubmit() {
    if (!this.data.form.title) { wx.showToast({ title: '请输入竞赛标题', icon: 'none' }); return; }
    this.setData({ loading: true });
    api.updateCompetition(this.data.id, this.data.form).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); setTimeout(() => wx.navigateBack(), 1500); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
});
export {};
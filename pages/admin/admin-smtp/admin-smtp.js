/**
 * SMTP 配置
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) {}
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    config: { host: '', port: '', secure: true, user: '', pass: '', from: '' },
    loading: false,
    testing: false,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); this.load(); },
  onShow() { this._syncTheme(); if (!this.checkAdmin()) return; this.load(); },
  checkAdmin() {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  load() {
    this.setData({ loading: true });
    api.getSmtpConfig().then((res) => {
      this.setData({ config: res?.data || {} });
    }).catch((err) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onHostInput(e) { this.setData({ 'config.host': e.detail.value }); },
  onPortInput(e) { this.setData({ 'config.port': e.detail.value }); },
  onUserInput(e) { this.setData({ 'config.user': e.detail.value }); },
  onPassInput(e) { this.setData({ 'config.pass': e.detail.value }); },
  onFromInput(e) { this.setData({ 'config.from': e.detail.value }); },
  onSecureChange(e) { this.setData({ 'config.secure': e.detail.value }); },
  onSave() {
    this.setData({ loading: true });
    api.saveSmtpConfig(this.data.config).then(() => { wx.showToast({ title: '已保存', icon: 'success' }); }).catch((err) => wx.showToast({ title: err?.message || '保存失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onTest() {
    this.setData({ testing: true });
    api.testSmtpConnection(this.data.config).then(() => { wx.showToast({ title: '连接成功', icon: 'success' }); }).catch((err) => wx.showToast({ title: err?.message || '连接失败', icon: 'none' })).finally(() => this.setData({ testing: false }));
  },
});

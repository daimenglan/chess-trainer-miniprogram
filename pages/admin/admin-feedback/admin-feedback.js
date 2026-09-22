/**
 * 反馈管理
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) {}
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    feedbacks: [],
    loading: false,
  },
  onLoad() { if (!this.checkAdmin()) return; this._syncTheme(); this.load(); },
  onShow() { this._syncTheme(); if (!this.checkAdmin()) return; this.load(); },
  checkAdmin() {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  load() {
    this.setData({ loading: true });
    api.getAdminFeedbackList().then((res) => {
      this.setData({ feedbacks: res?.data?.items || res?.data || [] });
    }).catch((err) => wx.showToast({ title: (err || {}).message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onReply(e) {
    const idx = e.currentTarget.dataset.index;
    const f = this.data.feedbacks[idx];
    wx.showModal({
      title: '回复反馈', content: '请输入回复内容',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          api.replyFeedback(f._id || f.id, res.content).then(() => { wx.showToast({ title: '已回复', icon: 'success' }); this.load(); }).catch((err) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});

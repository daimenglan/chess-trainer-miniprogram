/**
 * 用户详情
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    user: {} as any,
    loading: false,
    id: '',
  },
  onLoad(options: any) {
    if (!this.checkAdmin()) return;
    this._syncTheme();
    this.setData({ id: options.id || '' });
    if (this.data.id) this.load();
  },
  checkAdmin(): boolean {
    if (!util.isAdminUser()) { wx.showToast({ title: '权限不足', icon: 'none' }); setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800); return false; }
    return true;
  },
  load() {
    this.setData({ loading: true });
    api.getAdminUserDetail(this.data.id).then((res: any) => {
      this.setData({ user: res?.data || {} });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
  onRoleChange() {
    const newRole = this.data.user.role === 'admin' ? 'user' : 'admin';
    wx.showModal({
      title: '确认修改角色', content: `确定将 "${this.data.user.nickname}" 的角色改为 "${newRole}" 吗？`,
      success: (res: any) => {
        if (res.confirm) {
          api.updateAdminUserRole(this.data.id, newRole).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
  onTeacherToggle() {
    const newVal = !this.data.user.isTeacher;
    wx.showModal({
      title: '确认修改教师状态', content: `确定${newVal ? '授予' : '撤销'} "${this.data.user.nickname}" 的教师资格吗？`,
      success: (res: any) => {
        if (res.confirm) {
          api.updateAdminUserTeacherStatus(this.data.id, newVal).then(() => { wx.showToast({ title: '已更新', icon: 'success' }); this.load(); }).catch((err: any) => wx.showToast({ title: err?.message || '失败', icon: 'none' }));
        }
      }
    });
  },
});
export {};
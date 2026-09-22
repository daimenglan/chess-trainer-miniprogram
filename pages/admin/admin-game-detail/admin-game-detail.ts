/**
 * 游戏详情
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  _syncTheme() {
    try { const a = getApp(); const t = a?.globalData?.settings?.uiTheme || 'dark'; if (this.data.__theme__ !== t) this.setData({ __theme__: t }); } catch(e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    game: {} as any,
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
    api.getAdminGameDetail(this.data.id).then((res: any) => {
      this.setData({ game: res?.data || {} });
    }).catch((err: any) => wx.showToast({ title: err?.message || '加载失败', icon: 'none' })).finally(() => this.setData({ loading: false }));
  },
});
export {};
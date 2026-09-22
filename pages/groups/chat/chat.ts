/**
 * 群组聊天页
 */
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    groupId: 0,
    groupName: '',
    messages: [] as any[],
    inputText: '',
    loading: true,
  },

  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  onLoad(e: any) {
    this._syncTheme();
    const groupId = parseInt(e.id) || 0;
    this.setData({ groupId, groupName: e.name || '群聊' });
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadMessages();
  },

  async loadMessages() {
    this.setData({ loading: true });
    try {
      const res = await api.getGroupMessages(this.data.groupId, 1, 50);
      const list = res?.data || res || [];
      this.setData({ messages: list, loading: false });
      setTimeout(() => this.scrollToBottom(), 300);
    } catch {
      this.setData({ loading: false });
    }
  },

  onInput(e: any) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    const text = this.data.inputText.trim();
    if (!text) return;
    api.sendGroupMessage(this.data.groupId, text, 'text')
      .then((res: any) => {
        const msg = res?.data || res;
        this.data.messages.push({
          ...msg,
          content: text,
          createdAt: new Date().toISOString(),
        });
        this.setData({ messages: this.data.messages, inputText: '' });
        setTimeout(() => this.scrollToBottom(), 100);
      })
      .catch((err: any) => {
        wx.showToast({ title: err.message || '发送失败', icon: 'none' });
      });
  },

  scrollToBottom() {
    wx.createSelectorQuery().in(this).select('.messages-container').boundingClientRect((rect: any) => {
      if (rect) { wx.pageScrollTo({ scrollTop: rect.height, duration: 100 }); }
    }).exec();
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
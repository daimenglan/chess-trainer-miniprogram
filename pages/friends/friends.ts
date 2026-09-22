/**
 * 好友系统页
 */
const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    friends: [] as any[],
    requests: [] as any[],
    searchQuery: '',
    searchResults: [] as any[],
    loading: true,
    activeTab: 'friends',
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

  onShow() {
    this._syncTheme();
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadFriends();
    this.loadRequests();
  },

  onTabChange(e: any) {
    this.setData({ activeTab: e.detail });
  },

  async loadFriends() {
    this.setData({ loading: true });
    try {
      const res = await api.getFriendList();
      const list = res?.data || res || [];
      this.setData({ friends: list, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  async loadRequests() {
    try {
      const res = await api.getFriendRequests();
      const list = res?.data || res || [];
      this.setData({ requests: list });
    } catch {}
  },

  onSearchInput(e: any) {
    const q = e.detail.value.trim();
    this.setData({ searchQuery: q });
    if (!q) {
      this.setData({ searchResults: [] });
      return;
    }
    api.searchUsers(q)
      .then((res: any) => {
        const list = res?.data || res || [];
        this.setData({ searchResults: list });
      })
      .catch(() => {});
  },

  onAddFriend(e: any) {
    const userId = e.currentTarget.dataset.id;
    api.sendFriendRequest(userId)
      .then(() => {
        wx.showToast({ title: '已发送好友请求', icon: 'success' });
        this.loadRequests();
      })
      .catch((err: any) => {
        wx.showToast({ title: err.message || '发送失败', icon: 'none' });
      });
  },

  onAcceptRequest(e: any) {
    const id = e.currentTarget.dataset.id;
    api.acceptFriendRequest(id)
      .then(() => {
        wx.showToast({ title: '已接受', icon: 'success' });
        this.loadFriends();
        this.loadRequests();
      })
      .catch((err: any) => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      });
  },

  onRejectRequest(e: any) {
    const id = e.currentTarget.dataset.id;
    api.rejectFriendRequest(id)
      .then(() => {
        this.loadRequests();
      })
      .catch((err: any) => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      });
  },

  onRemoveFriend(e: any) {
    const userId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这位好友吗？',
      success: (res: any) => {
        if (res.confirm) {
          api.removeFriend(userId)
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadFriends();
            })
            .catch((err: any) => {
              wx.showToast({ title: err.message || '删除失败', icon: 'none' });
            });
        }
      },
    });
  },

  onChatFriend(e: any) {
    const userId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/messages/chat/chat?userId=${userId}` });
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
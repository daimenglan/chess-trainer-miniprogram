/**
 * Webview 页面 - 用于加载外部 OAuth 授权页面（如 Lichess 登录）
 */
Page({
  data: {
    url: '',
  },

  onLoad(query: any) {
    const url = query?.url || '';
    this.setData({ url });
  },

  onMessage(e: any) {
    // web-view 消息传递（OAuth 回调时可能收到消息）
    console.log('[Webview] message:', e?.detail);
  },

  onError(e: any) {
    console.warn('[Webview] 加载错误:', e?.detail);
    wx.showToast({ title: '页面加载失败', icon: 'none' });
  },

  onShareAppMessage(): any {
    return {
      title: 'mychess AI',
      path: '/pages/choice/choice',
    };
  },
});
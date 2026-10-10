/**
 * web-view 嵌入页
 *
 * 职责：
 * 1. 从 URL 参数读取 token（小程序全局 token 由 app.ts 通过 navigateTo 传入）
 * 2. 将 token 经 postMessage 传给网页版（网页版 localStorage 在 web-view 不可靠）
 * 3. 监听网页版 postMessage 导航请求，转发为小程序原生 navigateTo
 * 4. 处理网页版要求跳转到原生页的请求（支付、Lichess 等）
 */

const app = getApp();

interface WebViewMessage {
  type: 'navigateTo' | 'navigateBack' | 'redirect' | 'setToken' | 'ready';
  url?: string;
  delta?: number;
  token?: string;
}

Page({
data: {
    WebViewUrl: '',
    token: '' as string,
    loading: true,
    error: '' as string,
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
  },

  _buildUrl(): string {
    // 网页版地址：开发时用 Vite dev server (5173)，生产用已备案域名
    // 从 app.ts globalData.baseUrl 读取，与后端地址一致
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || 'https://mychess.com.cn';
    // 开发环境用 localhost，生产环境用 baseUrl
    const webUrl = baseUrl;
    return webUrl;
  },

  _injectTokenIntoUrl(token: string): string {
    const base = this._buildUrl();
    // 把 token 作为 hash 参数传入，网页版 App.tsx 从 location.hash 解析
    // webview_token（放 query 段会解析不到）；这里用 webview_token 作为
    // 小程序 web-view 专用通道
    return `${base}#webview_token=${encodeURIComponent(token)}`;
  },

  onLoad(options: any) {
    // 小程序全局 token（由 app.ts globalData 或 storage 恢复）
    let token = (app && app.globalData && app.globalData.token) || '';
    if (!token) {
      try {
        token = (wx as any).getStorageSync('auth_token') || '';
      } catch {}
    }

    // 也接受 URL 参数传入的 token（由 navigateTo 时显式传入）
    if (options && options.token) {
      token = decodeURIComponent(options.token);
    }

    this.setData({ token });

    if (token) {
      // 把 token 注入 URL，网页版 App.tsx 的 hash 监听会捕获
      this.setData({
        webViewUrl: this._injectTokenIntoUrl(token),
        loading: true,
      });
    } else {
      // 未登录：加载网页版首页，用户可在网页版内登录
      this.setData({
        webViewUrl: this._buildUrl(),
        loading: true,
      });
    }
  },

  onShow() {
    this._syncTheme();
  },

  _syncTheme() {
    try {
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch {}
  },

  /** 网页版 ready 后，把 token 通过 postMessage 传过去 */
  _postTokenToWeb() {
    if (!this.data.token) return;
    const q = wx.createSelectorQuery();
    q.select('.web-view').context((res: any) => {
      if (res && res.postMessage) {
        res.postMessage({
          type: 'setToken',
          token: this.data.token,
        });
      }
    }).exec();
  },

  /** 接收网页版发来的消息 */
  onMessage(e: any) {
    const msg: WebViewMessage = e && e.detail && e.detail.data;
    if (!msg) return;

    switch (msg.type) {
      case 'ready':
        // 网页版已加载，发送 token
        this._postTokenToWeb();
        this.setData({ loading: false });
        break;

      case 'navigateTo':
        if (msg.url) {
          // 网页版请求跳转到小程序原生页
          wx.navigateTo({ url: msg.url });
        }
        break;

      case 'navigateBack':
        wx.navigateBack({ delta: msg.delta || 1 });
        break;

      case 'redirect':
        if (msg.url) {
          wx.redirectTo({ url: msg.url });
        }
        break;

      default:
        break;
    }
  },

  /** web-view 加载失败 */
  onError(e: any) {
    this.setData({
      loading: false,
      error: '网页加载失败，请检查网络连接或稍后重试',
    });
  },

  /** 重试加载 */
  onRetry() {
    this.setData({ loading: true, error: '' });
    // 重新设置 URL 触发 web-view 重载
    const token = this.data.token;
    if (token) {
      this.setData({ WebViewUrl: this._injectTokenIntoUrl(token) });
    } else {
      this.setData({ WebViewUrl: this._buildUrl() });
    }
  },

  /** 触发主题同步 */
  onThemeChange(theme: 'dark' | 'light') {
    this.setData({ __theme__: theme });
  },
});

export {};
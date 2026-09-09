// app.ts
import { store } from './utils/store';

App({
  globalData: {
    // 后端API基础地址（手机真机调试需改为本机局域网 IP，部署到腾讯云后改回生产地址）
    baseUrl: 'http://192.168.3.168:3001',
    // 用户信息
    user: null as any,
    token: null as string | null,
    // 游戏设置
    settings: null as any,
    // 游戏状态
    gameState: null as any,
    // 分析结果
    analysis: [] as any[],
    analysisError: null as string | null,
    // 棋盘渲染触发
    boardUpdateKey: 0,
    // 从模式选择页跳转到对弈页的标志
    pendingStartAI: false,
  },

  onLaunch() {
    // 从storage恢复token和设置
    const token = (wx as any).getStorageSync('auth_token');
    const settings = (wx as any).getStorageSync('app_settings');
    const user = (wx as any).getStorageSync('user_info');

    if (token) {
      this.globalData.token = token;
    }
    if (settings) {
      this.globalData.settings = JSON.parse(settings);
    } else {
      this.globalData.settings = this.getDefaultSettings();
    }
    if (user) {
      this.globalData.user = JSON.parse(user);
    } else if (token) {
      // 从 JWT 中恢复 userId/username（旧版登录未保存 user 信息时的兼容）
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.userId) {
            this.globalData.user = {
              userId: payload.userId,
              username: payload.username || '',
            };
          }
        }
      } catch {}
    }

    // 初始化store
    store.init(this);
  },

  getDefaultSettings() {
    return {
      theme: 'blueWhite',
      boardColorPreset: 'blueWhite',
      pieceStyle3d: false,
      boardFlipped: false,
      soundEnabled: true,
      showHints: false,
      analysisDepth: 10,
      analysisMultiPv: 3,
      aiDifficulty: 5,
    };
  },

  saveSettings() {
    (wx as any).setStorageSync('app_settings', JSON.stringify(this.globalData.settings));
  },

  saveUser(user: any) {
    this.globalData.user = user;
    (wx as any).setStorageSync('user_info', JSON.stringify(user));
  },

  setToken(token: string | null) {
    this.globalData.token = token;
    if (token) {
      (wx as any).setStorageSync('auth_token', token);
    } else {
      (wx as any).removeStorageSync('auth_token');
    }
  },

  // 触发棋盘重绘
  triggerBoardUpdate() {
    this.globalData.boardUpdateKey = (this.globalData.boardUpdateKey || 0) + 1;
  },
});
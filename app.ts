// app.ts
import { store } from './utils/store';

App({
  globalData: {
    // 后端API基础地址（必须为已备案的 HTTPS 域名，小程序服务器域名不接受裸 IP 与非 https 请求）
    baseUrl: 'https://mychess.com.cn',
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
    // 好友页交接给对弈页的「接受挑战」：等对弈页订阅 WS 后再发，避免丢掉随后的开局事件
    pendingInviteAccept: null as { inviteId: string } | null,
    // 好友邀请落地页暂存的 token：未登录时先存这里，登录成功后回跳该页完成兑换
    pendingFriendInvite: null as { token: string } | null,
    // 权限配置（与网页版共享：distributionEnabled / membershipEnabled / menuVisibility）
    permissions: null as any,
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
      // 从 JWT 中恢复 userId/username/role（旧版登录未保存 user 信息时的兼容）
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.userId) {
            this.globalData.user = {
              userId: payload.userId,
              username: payload.username || '',
              role: payload.role || 'user',
            };
          }
        }
      } catch {}
    }

    // 初始化store
    store.init(this);

    // 加载权限配置（与网页版共享：分销/会员开关 + 菜单可见性）
    this.loadPermissions();

    // 行为埋点：启动心跳 + 注入页面级 page_view 自动埋点
    this.setupAnalytics();
  },

  /**
   * 行为埋点接入
   *
   * 用包装全局 Page() 的方式给所有页面自动挂上 page_view（含停留时长结算），
   * 避免在 70+ 个页面里各写一遍；业务关键事件仍由页面按需调用 trackEvent。
   * 页面模块是首次进入时才求值并调用全局 Page()，因此这里的替换对其后加载的页面生效。
   */
  setupAnalytics() {
    const analytics = require('./utils/analytics');
    analytics.initAnalytics();

    const originalPage: any = (Page as any);
    if (!originalPage || originalPage.__mychessAnalyticsPatched) return;

    // 排除管理后台：管理员的操作不应计入用户行为统计
    const isExcluded = (route: string) => typeof route === 'string' && route.indexOf('pages/admin') === 0;

    const PatchedPage: any = function (options: any) {
      if (options && typeof options === 'object') {
        const userOnShow = options.onShow;
        const userOnHide = options.onHide;

        options.onShow = function (...args: any[]) {
          try {
            // this.route 是当前页面路径，由框架注入
            const route = (this as any).route;
            if (route && !isExcluded(route)) {
              // 进入页面：结算上一页停留，并从此刻开始计时本页
              analytics.setCurrentPage(route);
            }
          } catch (e) { /* non-critical */ }
          return typeof userOnShow === 'function' ? userOnShow.apply(this, args) : undefined;
        };

        options.onHide = function (...args: any[]) {
          try {
            const route = (this as any).route;
            if (route && !isExcluded(route)) {
              // 离开页面：结算本页停留并立即上报，
              // 防止小程序切后台被系统回收后缓冲区事件丢失
              analytics.leaveCurrentPage();
              analytics.flushNow();
            }
          } catch (e) { /* non-critical */ }
          return typeof userOnHide === 'function' ? userOnHide.apply(this, args) : undefined;
        };
      }
      return originalPage(options);
    };

    PatchedPage.__mychessAnalyticsPatched = true;
    (Page as any) = PatchedPage;
  },

  /** 加载权限配置：与网页版 AdminSettings 一致的全局开关 */
  loadPermissions() {
    const api = require('./utils/api');
    const user = this.globalData.user;
    const isAdmin = user?.role === 'admin';
    const promises: Promise<any>[] = [
      // 公共接口（所有用户可调用）
      api.isDistributionEnabled().catch(() => ({ enabled: true })),
      api.isMembershipEnabled().catch(() => ({ enabled: true })),
      api.isVideoGenerationEnabled().catch(() => ({ enabled: false })),
      api.isAIAnalysisReportEnabled().catch(() => ({ enabled: false })),
    ];
    // 菜单可见性仅对管理员查询（非管理员调用 /api/admin/menus 会 403）
    if (isAdmin) {
      promises.push(api.getAdminMenuVisibility().catch(() => null));
    } else {
      promises.push(Promise.resolve(null));
    }
    Promise.all(promises).then((results: any[]) => {
      this.globalData.permissions = {
        distributionEnabled: results[0]?.enabled !== false,
        membershipEnabled: results[1]?.enabled !== false,
        videoGenerationEnabled: results[2]?.enabled !== false,
        aiAnalysisReportEnabled: results[3]?.enabled !== false,
        menuVisibility: results[4] || null,
      };
      // 通知所有页面权限已更新
      this.notifyPermissionsChanged();
    }).catch(() => {
      // 全部失败时使用默认值
      this.globalData.permissions = {
        distributionEnabled: true,
        membershipEnabled: true,
        videoGenerationEnabled: true,
        aiAnalysisReportEnabled: true,
        menuVisibility: null,
      };
    });
  },

  /** 通知所有页面权限配置已更新 */
  notifyPermissionsChanged() {
    const pages = getCurrentPages();
    for (const page of pages) {
      try {
        const pageEl = (page as any).$vm || page;
        if (pageEl && pageEl.onPermissionsChanged) {
          pageEl.onPermissionsChanged();
        }
      } catch {}
    }
  },

  getDefaultSettings() {
    return {
      theme: 'blueWhite',
      boardColorPreset: 'blueWhite',
      pieceStyle3d: false,
      boardFlipped: false,
      soundEnabled: true,
      showHints: false,
      // 习题页独立的 AI 教练开关（默认关闭：先自己思考，需要时在习题页顶栏手动打开）
      // 与 AI 陪练的 showHints 解耦，避免用户在陪练里关掉教练后习题页推荐也一并消失
      puzzleHints: false,
      analysisDepth: 10,
      analysisMultiPv: 3,
      aiDifficulty: 5,
      // 系统主题：'dark' | 'light'
      uiTheme: 'dark',
    };
  },

  saveSettings() {
    (wx as any).setStorageSync('app_settings', JSON.stringify(this.globalData.settings));
  },

  /** 切换系统主题（深色/浅色）并应用到所有页面 */
  setTheme(theme: 'dark' | 'light') {
    const settings = { ...this.globalData.settings, uiTheme: theme };
    this.globalData.settings = settings;
    this.saveSettings();
    this.applyTheme(theme);
  },

  /** 将 theme-xxx class 应用到 page 根节点 */
  applyTheme(theme: 'dark' | 'light') {
    const pages = getCurrentPages();
    for (const page of pages) {
      try {
        const pageEl = (page as any).$vm || page;
        if (pageEl && pageEl.setData) {
          pageEl.setData({ '__theme__': theme });
        }
      } catch {}
    }
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
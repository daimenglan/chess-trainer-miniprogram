"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// app.ts
const store_1 = require("./utils/store");
App({
    globalData: {
        // 后端API基础地址（必须为已备案的 HTTPS 域名，小程序服务器域名不接受裸 IP 与非 https 请求）
        baseUrl: 'https://mychess.com.cn',
        // 用户信息
        user: null,
        token: null,
        // 游戏设置
        settings: null,
        // 游戏状态
        gameState: null,
        // 分析结果
        analysis: [],
        analysisError: null,
        // 棋盘渲染触发
        boardUpdateKey: 0,
        // 从模式选择页跳转到对弈页的标志
        pendingStartAI: false,
        // 权限配置（与网页版共享：distributionEnabled / membershipEnabled / menuVisibility）
        permissions: null,
    },
    onLaunch() {
        // 从storage恢复token和设置
        const token = wx.getStorageSync('auth_token');
        const settings = wx.getStorageSync('app_settings');
        const user = wx.getStorageSync('user_info');
        if (token) {
            this.globalData.token = token;
        }
        if (settings) {
            this.globalData.settings = JSON.parse(settings);
        }
        else {
            this.globalData.settings = this.getDefaultSettings();
        }
        if (user) {
            this.globalData.user = JSON.parse(user);
        }
        else if (token) {
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
            }
            catch { }
        }
        // 初始化store
        store_1.store.init(this);
        // 加载权限配置
        this.loadPermissions();
    },

    /** 加载权限配置：与网页版 AdminSettings 一致的全局开关 */
    loadPermissions() {
        const api = require('./utils/api');
        const user = this.globalData.user;
        const isAdmin = user && user.role === 'admin';
        const promises = [
            // 公共接口（所有用户可调用）
            api.isDistributionEnabled().catch(function() { return { enabled: true }; }),
            api.isMembershipEnabled().catch(function() { return { enabled: true }; }),
            api.isVideoGenerationEnabled().catch(function() { return { enabled: false }; }),
            api.isAIAnalysisReportEnabled().catch(function() { return { enabled: false }; }),
        ];
        // 菜单可见性仅对管理员查询（非管理员调用 /api/admin/menus 会 403）
        if (isAdmin) {
            promises.push(api.getAdminMenuVisibility().catch(function() { return null; }));
        } else {
            promises.push(Promise.resolve(null));
        }
        Promise.all(promises).then(function(results) {
            this.globalData.permissions = {
                distributionEnabled: results[0]?.enabled !== false,
                membershipEnabled: results[1]?.enabled !== false,
                videoGenerationEnabled: results[2]?.enabled !== false,
                aiAnalysisReportEnabled: results[3]?.enabled !== false,
                menuVisibility: results[4] || null,
            };
            this.notifyPermissionsChanged();
        }.bind(this)).catch(function() {
            this.globalData.permissions = {
                distributionEnabled: true,
                membershipEnabled: true,
                videoGenerationEnabled: true,
                aiAnalysisReportEnabled: true,
                menuVisibility: null,
            };
        }.bind(this));
    },

    /** 通知所有页面权限配置已更新 */
    notifyPermissionsChanged() {
        const pages = getCurrentPages();
        for (const page of pages) {
            try {
                const pageEl = page.$vm || page;
                if (pageEl && pageEl.onPermissionsChanged) {
                    pageEl.onPermissionsChanged();
                }
            }
            catch { }
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
            analysisDepth: 10,
            analysisMultiPv: 3,
            aiDifficulty: 5,
            // 系统主题：'dark' | 'light'
            uiTheme: 'dark',
        };
    },
    saveSettings() {
        wx.setStorageSync('app_settings', JSON.stringify(this.globalData.settings));
    },
    /** 切换系统主题（深色/浅色）并应用到所有页面 */
    setTheme(theme) {
        const settings = { ...this.globalData.settings, uiTheme: theme };
        this.globalData.settings = settings;
        this.saveSettings();
        this.applyTheme(theme);
    },
    /** 将 theme-xxx class 应用到 page 根节点 */
    applyTheme(theme) {
        const pages = getCurrentPages();
        for (const page of pages) {
            try {
                const pageEl = page.$vm || page;
                if (pageEl && pageEl.setData) {
                    pageEl.setData({ '__theme__': theme });
                }
            }
            catch { }
        }
    },
    saveUser(user) {
        this.globalData.user = user;
        wx.setStorageSync('user_info', JSON.stringify(user));
    },
    setToken(token) {
        this.globalData.token = token;
        if (token) {
            wx.setStorageSync('auth_token', token);
        }
        else {
            wx.removeStorageSync('auth_token');
        }
    },
    // 触发棋盘重绘
    triggerBoardUpdate() {
        this.globalData.boardUpdateKey = (this.globalData.boardUpdateKey || 0) + 1;
    },
});

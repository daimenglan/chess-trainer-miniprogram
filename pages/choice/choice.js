"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 选择对弈模式页（登录后首屏）
 */
const app = getApp();
Page({
    data: {
        username: '',
    },
    onShow() {
        // 未登录 → 重定向到登录页
        if (!app.globalData.token) {
            wx.redirectTo({ url: '/pages/login/login' });
            return;
        }
        this.setData({
            username: app.globalData.user?.username || app.globalData.token?.substring(0, 8) || '棋手',
        });
    },
    onOnlineMatch() {
        wx.navigateTo({ url: '/pages/online/online' });
    },
    onAICoach() {
        app.globalData.pendingStartAI = true;
        wx.switchTab({ url: '/pages/index/index' });
    },
    onLogout() {
        wx.showModal({
            title: '确认退出',
            content: '退出登录后需要重新登录才能使用在线对弈功能',
            success: (res) => {
                if (res.confirm) {
                    app.setToken(null);
                    app.globalData.user = null;
                    wx.redirectTo({ url: '/pages/login/login' });
                }
            },
        });
    },
});

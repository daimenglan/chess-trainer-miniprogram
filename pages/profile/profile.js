"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 个人中心页
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    data: {
        user: null,
        isLoggedIn: false,
        avatarInitial: '?',
        profile: null,
        profileAnalysis: null,
        loadingProfile: false,
        loadingAnalysis: false,
        // 统计
        stats: {
            totalGames: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            winRate: 0,
        },
        analysisTabs: [
            { key: 'style', label: '棋风' },
            { key: 'rating', label: '等级分' },
            { key: 'opening', label: '开局' },
            { key: 'strength', label: '优劣势' },
            { key: 'mistakes', label: '失误' },
            { key: 'improve', label: '提升方案' },
        ],
        activeTab: 'style',
    },
    onShow() {
        this.checkLogin();
    },
    checkLogin() {
        const user = app.globalData.user;
        const token = app.globalData.token;
        if (user && token) {
            // WXML 不支持方法调用/可选链，首字母在 JS 侧预计算
            const displayName = user.username || '棋手';
            this.setData({
                user,
                avatarInitial: displayName.charAt(0).toUpperCase(),
                isLoggedIn: true,
            });
            this.loadProfile();
        }
        else {
            this.setData({ user: null, isLoggedIn: false, profile: null, avatarInitial: '?' });
        }
    },
    loadProfile() {
        this.setData({ loadingProfile: true });
        api.getProfile()
            .then((res) => {
            if (res?.data) {
                // WXML 不能调用 JS 函数，日期在 JS 侧预格式化
                const profile = {
                    ...res.data,
                    createdAtFormatted: res.data.createdAt ? util.formatDate(res.data.createdAt) : '',
                };
                this.setData({ profile });
            }
        })
            .catch(() => { })
            .finally(() => {
            this.setData({ loadingProfile: false });
        });
    },
    onAnalyze() {
        if (!this.data.isLoggedIn) {
            this.goToLogin();
            return;
        }
        this.setData({ loadingAnalysis: true });
        api.analyzeProfile()
            .then((res) => {
            if (res?.data) {
                this.setData({ profileAnalysis: res.data });
            }
        })
            .catch(() => util.showToast('分析失败'))
            .finally(() => {
            this.setData({ loadingAnalysis: false });
        });
    },
    onTabSwitch(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ activeTab: tab });
    },
    goToLogin() {
        wx.navigateTo({ url: '/pages/login/login' });
    },
    onLogout() {
        wx.showModal({
            title: '确认退出',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    app.setToken(null);
                    app.globalData.user = null;
                    wx.removeStorageSync('user_info');
                    this.setData({ user: null, isLoggedIn: false, profile: null, profileAnalysis: null });
                    wx.showToast({ title: '已退出', icon: 'success' });
                }
            },
        });
    },
    onEditProfile() {
        wx.showModal({
            title: '编辑简介',
            editable: true,
            content: this.data.profile?.bio || '',
            success: (res) => {
                if (res.confirm && res.content !== undefined) {
                    api.updateProfile({ bio: res.content })
                        .then(() => {
                        util.showToast('更新成功', 'success');
                        this.loadProfile();
                    })
                        .catch(() => util.showToast('更新失败'));
                }
            },
        });
    },
    onChangePassword() {
        wx.navigateTo({ url: '/pages/settings/settings?tab=password' });
    },
    goToSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },
});

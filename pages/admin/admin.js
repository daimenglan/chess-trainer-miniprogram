"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 数据监控仪表盘（仅管理员）
 * 数据来自共享后端 /api/admin/dashboard 与 /api/admin/dashboard/trend
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
/** 秒 → 可读时长 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0)
        return '0分钟';
    if (seconds < 60)
        return Math.round(seconds) + '秒';
    if (seconds < 3600)
        return Math.round(seconds / 60) + '分钟';
    return (seconds / 3600).toFixed(1) + '小时';
}
Page({
    /** 同步主题 */
    _syncTheme() {
        try {
            const a = getApp();
            const theme = a?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { }
    },
    data: {
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
        loading: false,
        loadError: '',
        today: {
            newUsers: 0,
            loginUsers: 0,
            gameUsers: 0,
            avgDurationText: '0分钟',
        },
        system: {
            totalUsers: 0,
            totalGames: 0,
            totalRecords: 0,
            engineStatus: 'unavailable',
            engineText: '不可用',
        },
        trendLabels: [],
        trendSeries: [],
    },
    onLoad() {
        if (!this.checkAdmin())
            return;
    },
    onShow() {
        this._syncTheme();
        if (!this.checkAdmin())
            return;
        this.loadData();
    },
    onPullDownRefresh() {
        this.loadData().finally(() => wx.stopPullDownRefresh());
    },
    /** 管理员校验，非管理员返回 false */
    checkAdmin() {
        if (!util.isAdminUser()) {
            wx.showToast({ title: '权限不足', icon: 'none' });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800);
            return false;
        }
        return true;
    },
    loadData() {
        this.setData({ loading: true, loadError: '' });
        return Promise.all([
            api.getAdminDashboard(),
            api.getAdminTrend(7),
        ]).then((results) => {
            const dash = results[0]?.data || {};
            const trend = results[1]?.data || [];
            const engineMap = {
                running: '运行中',
                stopped: '已停止',
                unavailable: '不可用',
            };
            this.setData({
                today: {
                    newUsers: dash.todayNewUsers || 0,
                    loginUsers: dash.todayLoginUsers || 0,
                    gameUsers: dash.todayGameUsers || 0,
                    avgDurationText: formatDuration(dash.todayAvgDuration || 0),
                },
                system: {
                    totalUsers: dash.totalUsers || 0,
                    totalGames: dash.totalGames || 0,
                    totalRecords: dash.totalRecords || 0,
                    engineStatus: dash.engineStatus || 'unavailable',
                    engineText: engineMap[dash.engineStatus] || '不可用',
                },
                trendLabels: trend.map((t) => String(t.date || '').slice(5)),
                trendSeries: [
                    { name: '新注册', color: '#60a5fa', values: trend.map((t) => t.newUsers || 0) },
                    { name: '登录用户', color: '#4ade80', values: trend.map((t) => t.loginUsers || 0) },
                    { name: '对局用户', color: '#facc15', values: trend.map((t) => t.gameUsers || 0) },
                ],
            });
        }).catch((err) => {
            console.error('加载管理数据失败', err);
            this.setData({ loadError: err?.message || '加载失败，请下拉重试' });
        }).finally(() => {
            this.setData({ loading: false });
        });
    },
    goStats() {
        wx.navigateTo({ url: '/pages/admin-stats/admin-stats' });
    },
    goLogs() {
        wx.navigateTo({ url: '/pages/admin-logs/admin-logs' });
    },
    goUsers() {
        wx.navigateTo({ url: '/pages/admin-users/admin-users' });
    },
});

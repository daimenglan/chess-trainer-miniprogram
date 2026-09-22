"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 首页 - 模式选择 + AI定级/棋手档案/训练计划概览
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        username: '',
        // AI定级概览
        assessmentInfo: null,
        assessmentLoading: true,
        // 棋手档案概览
        profileInfo: null,
        profileLoading: true,
        // 训练计划概览
        trainingInfo: null,
        trainingLoading: true,
        // 权限控制
        showMembership: true,
        showDistribution: true,
        showClassroom: false,
        showAdmin: false,
        showFeedback: true,
        showVideoGeneration: true,
        showAIAnalysisReport: true,
    },
    onShow() {
        this._syncTheme();
        if (!app.globalData.token) {
            wx.reLaunch({ url: '/pages/login/login' });
            return;
        }
        this.setData({
            username: app.globalData.user?.username || app.globalData.token?.substring(0, 8) || '棋手',
        });
        this.loadOverviewData();
        this.updatePermissionUI();
    },
    /** 权限配置更新回调 */
    onPermissionsChanged() {
        this.updatePermissionUI();
    },
    /** 根据全局权限状态更新菜单可见性（与网页版 AdminSettings 全局开关一致） */
    updatePermissionUI() {
        const user = app.globalData.user;
        const perms = app.globalData.permissions;
        const membershipEnabled = perms ? perms.membershipEnabled !== false : true;
        const distributionEnabled = perms ? perms.distributionEnabled !== false : true;
        const videoGenerationEnabled = perms ? perms.videoGenerationEnabled !== false : true;
        const aiAnalysisReportEnabled = perms ? perms.aiAnalysisReportEnabled !== false : true;
        const isTeacher = util.isTeacher();
        const isAdmin = util.isAdminUser();
        const feedbackVisible = util.isMenuItemVisible('/feedback');
        this.setData({
            showMembership: membershipEnabled,
            showDistribution: distributionEnabled,
            showVideoGeneration: videoGenerationEnabled,
            showAIAnalysisReport: aiAnalysisReportEnabled,
            showClassroom: isTeacher || isAdmin,
            showAdmin: isAdmin,
            showFeedback: feedbackVisible,
        });
    },
    /** 并行加载三个功能的概览数据 */
    async loadOverviewData() {
        const [historyRes, profileRes, statsRes] = await Promise.all([
            api.getAssessmentHistory().catch(() => null),
            api.getSavedProfileAnalysis().catch(() => null),
            api.getTrainingStats().catch(() => null),
        ]);
        const historyList = historyRes?.data || historyRes || [];
        const assessmentInfo = historyList.length > 0 ? Object.assign(Object.assign({}, historyList[0]), { confidencePct: Math.round((historyList[0].confidence || 0) * 100) }) : null;
        const profileData = profileRes?.data || profileRes || null;
        const statsData = statsRes?.data || statsRes || null;
        this.setData({
            assessmentInfo,
            assessmentLoading: false,
            profileInfo: profileData ? {
                estimatedRating: profileData.stats?.estimatedRating,
                style: profileData.style?.split('\n')?.[0] || null,
                winRate: profileData.stats?.winRate,
            } : null,
            profileLoading: false,
            trainingInfo: statsData ? {
                todayCompleted: statsData.todayCompleted || 0,
                todayTarget: statsData.todayTarget || 0,
                currentStreak: statsData.currentStreak || 0,
                level: statsData.level || 1,
            } : null,
            trainingLoading: false,
        });
    },
    // ===== 导航 =====
    onAssessment() { wx.navigateTo({ url: '/pages/assessment/assessment' }); },
    onProfile() { wx.switchTab({ url: '/pages/profile/profile' }); },
    onTrainingPlan() { wx.navigateTo({ url: '/pages/training-plan/training-plan' }); },
    onAICoach() { app.globalData.pendingStartAI = true; wx.switchTab({ url: '/pages/index/index' }); },
    onOnlineMatch() { wx.navigateTo({ url: '/pages/online/online' }); },
    onPuzzles() { wx.navigateTo({ url: '/pages/puzzles/puzzles' }); },
    onReview() { wx.switchTab({ url: '/pages/records/records' }); },
    onStudy() { wx.navigateTo({ url: '/pages/study/study' }); },
    onMembership() { wx.navigateTo({ url: '/pages/membership/membership' }); },
    onCompetitions() { wx.navigateTo({ url: '/pages/competitions/list/list' }); },
    onFriends() { wx.navigateTo({ url: '/pages/friends/friends' }); },
    onGroups() { wx.navigateTo({ url: '/pages/groups/list/list' }); },
    onFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
    onDistribution() { wx.navigateTo({ url: '/pages/distribution/index' }); },
    onDragonCoin() { wx.navigateTo({ url: '/pages/dragon-coin/index' }); },
    onRewardCenter() { wx.navigateTo({ url: '/pages/reward-center/index' }); },
    onMyPuzzles() { wx.navigateTo({ url: '/pages/my-puzzles/index' }); },
    onClassroom() { wx.navigateTo({ url: '/pages/classroom/home/home' }); },
    onAdmin() { wx.navigateTo({ url: '/pages/admin/admin' }); },
    onSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
    onLogout() { wx.showModal({ title: '确认退出', content: '退出登录后需要重新登录才能使用在线对弈功能', success: (res) => { if (res.confirm) { app.setToken(null); app.globalData.user = null; wx.reLaunch({ url: '/pages/login/login' }); } } }); },
});
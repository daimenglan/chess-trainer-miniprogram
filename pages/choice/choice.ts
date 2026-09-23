/**
 * 首页 - 模式选择 + AI定级/棋手档案/训练计划概览 + 训练中心/周计划
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
    } catch(e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    username: '',

    // AI定级概览
    assessmentInfo: null as any,
    assessmentLoading: true,

    // 棋手档案概览
    profileInfo: null as any,
    profileLoading: true,

    // 训练计划概览
    trainingInfo: null as any,
    trainingLoading: true,

    // 训练中心数据
    trainingCenter: null as any,
    trainingCenterLoading: true,

    // 周计划
    weeklyPlan: null as any,
    weeklyPlanLoading: true,

    // 错题本
    mistakeSummary: null as any,
    mistakeLoading: true,

    // 竞赛状态
    activeCompetitions: [] as any[],
    competitionsLoading: true,

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
    this.loadTrainingCenter();
    this.loadWeeklyPlan();
    this.loadMistakeSummary();
    this.loadCompetitions();
    this.updatePermissionUI();
  },

  onPermissionsChanged() {
    this.updatePermissionUI();
  },

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

  /** 并行加载概览数据 */
  async loadOverviewData() {
    const [historyRes, profileRes, statsRes] = await Promise.all([
      api.getAssessmentHistory().catch(() => null),
      api.getSavedProfileAnalysis().catch(() => null),
      api.getTrainingStats().catch(() => null),
    ]);

    const historyList = historyRes?.data || historyRes || [];
    const assessmentInfo = historyList.length > 0 ? {
      ...historyList[0],
      confidencePct: Math.round((historyList[0].confidence || 0) * 100),
    } : null;

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

  /** 加载训练中心数据 */
  async loadTrainingCenter() {
    try {
      const res = await api.getTrainingCenterData();
      const data = res?.data || res;
      if (data) {
        this.setData({
          trainingCenter: {
            upgradePlan: data.upgradePlan || null,
            dashboard: data.dashboard || null,
            level: data.level || 1,
            streak: data.currentStreak || 0,
          },
          trainingCenterLoading: false,
        });
      }
    } catch {
      this.setData({ trainingCenterLoading: false });
    }
  },

  /** 加载周计划 */
  async loadWeeklyPlan() {
    try {
      const res = await api.getWeeklyPlan();
      const data = res?.data || res;
      if (data) {
        this.setData({
          weeklyPlan: {
            weekStart: data.weekStart,
            weekEnd: data.weekEnd,
            items: (data.items || []).map((item: any) => ({
              ...item,
              completedPct: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
            })),
            overallPct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
          },
          weeklyPlanLoading: false,
        });
      }
    } catch {
      this.setData({ weeklyPlanLoading: false });
    }
  },

  /** 加载错题本摘要 */
  async loadMistakeSummary() {
    try {
      const res = await api.getMistakeSummary();
      const data = res?.data || res;
      if (data) {
        this.setData({
          mistakeSummary: {
            total: data.total || 0,
            unresolved: data.unresolved || 0,
            byPhase: data.byPhase || {},
            topWeakness: data.topWeakness || null,
          },
          mistakeLoading: false,
        });
      }
    } catch {
      this.setData({ mistakeLoading: false });
    }
  },

  /** 加载竞赛状态 */
  async loadCompetitions() {
    try {
      const res = await api.getCompetitions({ status: 'registration_open', limit: 3 });
      const data = res?.data || res;
      const comps = data?.competitions || data || [];
      this.setData({
        activeCompetitions: comps,
        competitionsLoading: false,
      });
    } catch {
      this.setData({ competitionsLoading: false });
    }
  },

  /** 刷新周计划 */
  onRefreshWeeklyPlan() {
    this.setData({ weeklyPlanLoading: true });
    api.getWeeklyPlan(true)
      .then((res: any) => {
        const data = res?.data || res;
        if (data) {
          this.setData({
            weeklyPlan: {
              weekStart: data.weekStart,
              weekEnd: data.weekEnd,
              items: (data.items || []).map((item: any) => ({
                ...item,
                completedPct: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
              })),
              overallPct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
            },
            weeklyPlanLoading: false,
          });
        }
      })
      .catch(() => this.setData({ weeklyPlanLoading: false }));
  },

  /** 动态评估 */
  onDynamicAssessment() {
    wx.showModal({
      title: '动态评估',
      content: '将根据你最近的表现重新评估等级分，约需 2-3 分钟',
      confirmText: '开始评估',
      cancelText: '稍后再说',
      success: (res: any) => {
        if (res.confirm) {
          util.showLoading('评估中...');
          api.triggerDynamicAssessment()
            .then(() => {
              util.hideLoading();
              util.showToast('评估已完成，查看个人中心获取结果', 'success');
              this.loadOverviewData();
            })
            .catch((err: any) => {
              util.hideLoading();
              util.showToast(err.message || '评估失败');
            });
        }
      },
    });
  },

  /** 查看错题本 */
  onGoWrongBook() {
    wx.navigateTo({ url: '/pages/puzzles/puzzles?mode=wrong' });
  },

  /** 查看竞赛 */
  onGoCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/list/list' });
  },

  // ===== 导航 =====

  onAssessment() {
    wx.navigateTo({ url: '/pages/assessment/assessment' });
  },

  onProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  onTrainingPlan() {
    wx.navigateTo({ url: '/pages/training-plan/training-plan' });
  },

  onAICoach() {
    app.globalData.pendingStartAI = true;
    wx.switchTab({ url: '/pages/index/index' });
  },

  onOnlineMatch() {
    wx.navigateTo({ url: '/pages/online/online' });
  },

  onPuzzles() {
    wx.navigateTo({ url: '/pages/puzzles/puzzles' });
  },

  onReview() {
    wx.switchTab({ url: '/pages/records/records' });
  },

  onStudy() {
    wx.navigateTo({ url: '/pages/study/study' });
  },

  onMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' });
  },

  onCompetitions() {
    wx.navigateTo({ url: '/pages/competitions/list/list' });
  },

  onFriends() {
    wx.navigateTo({ url: '/pages/friends/friends' });
  },

  onGroups() {
    wx.navigateTo({ url: '/pages/groups/list/list' });
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  onDistribution() {
    wx.navigateTo({ url: '/pages/distribution/index' });
  },

  onDragonCoin() {
    wx.navigateTo({ url: '/pages/dragon-coin/index' });
  },

  onRewardCenter() {
    wx.navigateTo({ url: '/pages/reward-center/index' });
  },

  onMyPuzzles() {
    wx.navigateTo({ url: '/pages/my-puzzles/index' });
  },

  onClassroom() {
    wx.navigateTo({ url: '/pages/classroom/home/home' });
  },

  onAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出登录后需要重新登录才能使用在线对弈功能',
      success: (res: any) => {
        if (res.confirm) {
          app.setToken(null);
          app.globalData.user = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});

export {}
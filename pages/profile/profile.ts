/**
 * 个人中心页 - 棋手档案 + 训练推荐
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
    user: null as any,
    isLoggedIn: false,
    avatarInitial: '?',
    profile: null as any,
    profileAnalysis: null as any,
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
      { key: 'training', label: '训练推荐' },
    ],
    activeTab: 'style',
    // WXML 不支持 Math.*，胜率进度条宽度在此预计算
    winRatePct: 0,

    // 训练推荐数据
    trainingPlan: null as any,
    trainingStats: null as any,
    trainingPlanError: '',
    loadingTraining: false,

    // 管理员入口
    isAdmin: false,
  },

  onShow() {
    this._syncTheme();
    this.checkLogin();
  },

  /** 胜率 → 进度条百分比（夹在 0-100，兼容字符串/小数格式） */
  computeWinRatePct(stats: any) {
    if (!stats) return 0;
    const rate = parseFloat(stats.winRate);
    if (!isFinite(rate)) return 0;
    return Math.max(0, Math.min(100, Math.round(rate)));
  },

  checkLogin() {
    const user = app.globalData.user;
    const token = app.globalData.token;

    if (user && token) {
      const displayName = user.username || '棋手';
      this.setData({
        user,
        avatarInitial: displayName.charAt(0).toUpperCase(),
        isLoggedIn: true,
        isAdmin: util.isAdminUser(),
      });
      this.loadProfile();
      this.loadSavedAnalysis();
    } else {
      this.setData({ user: null, isLoggedIn: false, profile: null, avatarInitial: '?', isAdmin: false });
    }
  },

  /** 进入管理后台（仅管理员可见入口） */
  goToAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  loadProfile() {
    this.setData({ loadingProfile: true });
    api.getProfile()
      .then((res: any) => {
        if (res?.data) {
          const profile = {
            ...res.data,
            createdAtFormatted: res.data.createdAt ? util.formatDate(res.data.createdAt) : '',
          };
          this.setData({ profile });
        }
      })
      .catch(() => {})
      .finally(() => {
        this.setData({ loadingProfile: false });
      });
  },

  /** 加载已保存的分析结果 */
  loadSavedAnalysis() {
    api.getSavedProfileAnalysis()
      .then((res: any) => {
        const data = res?.data || res;
        if (data && data.stats) {
          this.setData({ profileAnalysis: data, winRatePct: this.computeWinRatePct(data.stats) });
          // 更新统计数据
          this.setData({
            'stats.totalGames': data.stats.totalGames || 0,
            'stats.wins': data.stats.wins || 0,
            'stats.losses': (data.stats.totalGames || 0) - (data.stats.wins || 0) - (data.stats.draws || 0),
            'stats.draws': data.stats.draws || 0,
            'stats.winRate': data.stats.winRate || 0,
          });
        }
      })
      .catch(() => {});
  },

  onAnalyze() {
    if (!this.data.isLoggedIn) {
      this.goToLogin();
      return;
    }
    this.setData({ loadingAnalysis: true });
    api.analyzeProfile()
      .then((res: any) => {
        const data = res?.data || res;
        if (data) {
          this.setData({ profileAnalysis: data, winRatePct: data.stats ? this.computeWinRatePct(data.stats) : 0 });
          if (data.stats) {
            this.setData({
              'stats.totalGames': data.stats.totalGames || 0,
              'stats.wins': data.stats.wins || 0,
              'stats.losses': (data.stats.totalGames || 0) - (data.stats.wins || 0) - (data.stats.draws || 0),
              'stats.draws': data.stats.draws || 0,
              'stats.winRate': data.stats.winRate || 0,
            });
          }
          // 分析完成后自动拉取训练推荐
          this.loadTrainingData();
        }
      })
      .catch(() => util.showToast('分析失败'))
      .finally(() => {
        this.setData({ loadingAnalysis: false });
      });
  },

  /** 加载训练推荐数据 */
  loadTrainingData() {
    this.setData({ loadingTraining: true, trainingPlanError: '' });
    Promise.all([
      api.getTrainingPlan().catch(() => null),
      api.getTrainingStats().catch(() => null),
    ]).then(([planRes, statsRes]) => {
      const rawStats = statsRes?.data || statsRes || null;
      // WXML 不支持 .filter()，预计算成就解锁数
      if (rawStats && rawStats.achievements) {
        rawStats.unlockedCount = rawStats.achievements.filter((a: any) => a.unlocked).length;
        rawStats.totalCount = rawStats.achievements.length;
      }
      this.setData({
        trainingPlan: planRes?.data || planRes || null,
        trainingStats: rawStats,
        loadingTraining: false,
      });
    }).catch((err: any) => {
      this.setData({
        trainingPlanError: err.message || '获取训练推荐失败',
        loadingTraining: false,
      });
    });
  },

  onTabSwitch(e: any) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    // 如果切换到训练推荐tab且数据未加载
    if (tab === 'training' && !this.data.trainingPlan && !this.data.loadingTraining) {
      this.loadTrainingData();
    }
  },

  // ===== 内容渲染辅助 =====

  /** 渲染分析文本（纯文本转格式） */
  renderAnalysisText(text: string): string {
    return text || '暂无数据';
  },

  getTabContent(tabKey: string): string {
    const analysis = this.data.profileAnalysis;
    if (!analysis) return '';
    const keyMap: Record<string, string> = {
      style: 'style',
      rating: 'rating',
      opening: 'openingStats',
      strength: 'strengths',
      mistakes: 'mistakes',
      improve: 'improvement',
    };
    return analysis[keyMap[tabKey] || tabKey] || '暂无数据';
  },

  getSourceTag(source: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      weakness: { label: '劣势', cls: 'tag-orange' },
      mistake: { label: '失误', cls: 'tag-amber' },
      improvement: { label: '提升', cls: 'tag-indigo' },
    };
    return map[source] || { label: '提升', cls: 'tag-indigo' };
  },

  getPhaseLabel(phase: string): string {
    const map: Record<string, string> = { opening: '开局', middlegame: '中局', endgame: '残局' };
    return map[phase] || phase;
  },

  getTotalDaily(puzzlePlan: any[]): number {
    return (puzzlePlan || []).reduce((s: number, p: any) => s + (p.dailyCount || 0), 0);
  },

  // ===== 导航 =====

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res: any) => {
        if (res.confirm) {
          app.setToken(null);
          app.globalData.user = null;
          (wx as any).removeStorageSync('user_info');
          this.setData({ user: null, isLoggedIn: false, profile: null, profileAnalysis: null, trainingPlan: null, trainingStats: null });
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
      success: (res: any) => {
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

  goToMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' });
  },

  goToTraining() {
    wx.navigateTo({ url: '/pages/training-plan/training-plan' });
  },

  onJumpPuzzles(e: any) {
    const { phase, themes, min, max } = e.currentTarget.dataset;
    const params = [];
    if (phase) params.push(`phase=${phase}`);
    if (themes) params.push(`themes=${(themes || []).join(',')}`);
    if (min) params.push(`min=${min}`);
    if (max) params.push(`max=${max}`);
    params.push('auto=1');
    wx.navigateTo({ url: `/pages/puzzles/puzzles?${params.join('&')}` });
  },

  onGoGame() {
    app.globalData.pendingStartAI = true;
    wx.switchTab({ url: '/pages/index/index' });
  },

  onGoAssessment() {
    wx.navigateTo({ url: '/pages/assessment/assessment' });
  },
});
export {}
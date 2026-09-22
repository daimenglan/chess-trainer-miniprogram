/**
 * 训练计划页 - 个性化推荐 + 训练统计 + 棋手档案 + 成就墙
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
    plan: null as any,
    stats: null as any,
    xpPct: 0,
    todayPct: 0,
    profile: null as any,
    profileStyle: '',
    mistakeSummary: null as any,
    loadingPlan: false,
    profileError: '',
    motivationBanner: { icon: '', text: '', color: '' },
    strengthsShort: '',
    weaknessesShort: '',
    unlockedCount: 0,
    achievementsHint: '',
    achievementsPreview: [] as any[],
    recentMistakesPreview: [] as any[],
  },

  onShow() {
    this._syncTheme();
    if (!app.globalData.token) {
      this.setData({ profileError: '请先登录' });
      return;
    }
    this.loadData();
  },

  async loadData() {
    this.setData({ loadingPlan: true, profileError: '' });
    try {
      const [planRes, statsRes, profileRes, mistakeRes] = await Promise.all([
        api.getTrainingPlan().catch(() => null),
        api.getTrainingStats().catch(() => null),
        api.getSavedProfileAnalysis().catch(() => null),
        // 弱点追踪 API - 尝试获取
        new Promise((resolve) => {
          api.request('GET', '/api/profile/mistakes/active')
            .then((r: any) => resolve(r?.data || r || null))
            .catch(() => resolve(null));
        }),
      ]);

      const plan = planRes?.data || planRes || null;
      const stats = statsRes?.data || statsRes || null;
      const profile = profileRes?.data || profileRes || null;
      const mistakeSummary: any = mistakeRes || null;

      // 计算激励横幅
      const banner = this.computeMotivationBanner(stats, plan);

      // 预计算 WXML 显示值（避免方法调用）
      const strengthsShort = profile?.strengths ? profile.strengths.split('\n').slice(0,2).join(' · ') : '';
      const weaknessesShort = profile?.weaknesses ? profile.weaknesses.split('\n').slice(0,2).join(' · ') : '';

      let unlockedCount = 0;
      let achievementsHint = '暂无已解锁成就';
      let achievementsWithDate: any[] = [];
      if (stats?.achievements) {
        const unlocked = stats.achievements.filter((a: any) => a.unlocked);
        unlockedCount = unlocked.length;
        if (unlockedCount > 0) {
          const lastUnlocked = unlocked[unlocked.length - 1];
          achievementsHint = '最近解锁：' + (lastUnlocked?.name || '');
        }
        // 为每个 achievement 预计算 shortened unlockedAt
        achievementsWithDate = stats.achievements.map((a: any) => ({
          ...a,
          unlockedAtShort: a.unlocked && a.unlockedAt ? a.unlockedAt.slice(0,10) : '',
        }));
      }

      let mistakeSummaryFixed = null;
      let recentMistakesPreview: any[] = [];
      if (mistakeSummary?.recentMistakes) {
        recentMistakesPreview = mistakeSummary.recentMistakes.slice(0,5).map((m: any) => ({
          ...m,
          lossFixed: typeof m.loss === 'number' ? m.loss.toFixed(1) : '0.0',
        }));
        mistakeSummaryFixed = {
          ...mistakeSummary,
          recentMistakes: mistakeSummary.recentMistakes.map((m: any) => ({
            ...m,
            lossFixed: typeof m.loss === 'number' ? m.loss.toFixed(1) : '0.0',
          })),
        };
      }

      // 预计算前5个成就预览（WXML 不允许 .slice()）
      const achievementsPreview = stats?.achievements ? stats.achievements.slice(0,5) : [];

      this.setData({
        plan,
        stats: stats ? { ...stats, achievements: achievementsWithDate } : stats,
        // WXML 不支持 Math.*，进度条宽度必须在这里算好
        xpPct: stats ? Math.min(100, Math.round((stats.xp / Math.max(1, stats.xp + stats.xpToNextLevel)) * 100)) : 0,
        todayPct: stats && stats.todayTarget > 0
          ? Math.min(100, Math.round((stats.todayCompleted / stats.todayTarget) * 100))
          : 0,
        profile,
        profileStyle: profile ? (profile.style?.split('\n')?.[0] || null) : null,
        mistakeSummary: mistakeSummaryFixed,
        loadingPlan: false,
        motivationBanner: banner,
        strengthsShort,
        weaknessesShort,
        unlockedCount,
        achievementsHint,
        achievementsPreview,
        recentMistakesPreview,
      });
    } catch (err: any) {
      this.setData({ loadingPlan: false, profileError: err.message || '加载失败' });
    }
  },

  computeMotivationBanner(stats: any, plan: any) {
    if (!stats || !plan) return { icon: '🎯', text: '开始训练吧！', color: 'mb-blue' };
    const todayDone = stats.todayCompleted >= stats.todayTarget && stats.todayTarget > 0;
    const streakHigh = stats.currentStreak >= 7;
    const levelHigh = stats.level >= 5;
    const allAchievements = stats.achievements && stats.achievements.filter((a: any) => a.unlocked).length === stats.achievements.length;

    if (allAchievements) return { icon: '👑', text: '成就全收集！您已是不折不扣的国际象棋大师！', color: 'mb-amber' };
    if (streakHigh) return { icon: '🔥', text: `连续 ${stats.currentStreak} 天坚持训练！您的毅力令人敬佩！`, color: 'mb-orange' };
    if (todayDone) return { icon: '🎉', text: '今日训练目标已完成！明天继续挑战自己！', color: 'mb-green' };
    if (levelHigh) return { icon: '⭐', text: `已达到 Lv.${stats.level}！每一级提升都见证着您的成长！`, color: 'mb-blue' };
    if (stats.currentStreak > 0) return { icon: '💪', text: `已连续打卡 ${stats.currentStreak} 天！再接再厉！`, color: 'mb-purple' };
    if (plan.basedOnGames === 0) return { icon: '🌱', text: '新手起步阶段！完成几局人机对弈，系统将为您生成专属训练计划', color: 'mb-green' };
    return { icon: '🎯', text: `今日还需完成 ${Math.max(0, stats.todayTarget - stats.todayCompleted)} 题，坚持就是胜利！`, color: 'mb-blue' };
  },

  getSourceTag(source: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      weakness: { label: '劣势', cls: 'tag-red' },
      mistake: { label: '易犯失误', cls: 'tag-amber' },
      improvement: { label: '提升方案', cls: 'tag-blue' },
    };
    return map[source] || { label: '提升方案', cls: 'tag-blue' };
  },

  getPhaseLabel(phase: string): string {
    const map: Record<string, string> = {
      opening: '开局',
      middlegame: '中局',
      endgame: '残局',
    };
    return map[phase] || phase;
  },

  getTotalDaily(puzzlePlan: any[]): number {
    return puzzlePlan.reduce((s: number, p: any) => s + (p.dailyCount || 0), 0);
  },

  onJumpPuzzles(e: any) {
    const { phase, themes, min, max } = e.currentTarget.dataset;
    const params: string[] = [];
    if (phase) params.push(`phase=${phase}`);
    if (themes) params.push(`themes=${(themes || []).join(',')}`);
    if (min) params.push(`min=${min}`);
    if (max) params.push(`max=${max}`);
    params.push('auto=1');
    wx.navigateTo({ url: `/pages/puzzles/puzzles?${params.join('&')}` });
  },

  onGoPuzzles() {
    wx.navigateTo({ url: '/pages/puzzles/puzzles' });
  },

  onGoGame() {
    app.globalData.pendingStartAI = true;
    wx.switchTab({ url: '/pages/index/index' });
  },

  onGoProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },
});
export {}
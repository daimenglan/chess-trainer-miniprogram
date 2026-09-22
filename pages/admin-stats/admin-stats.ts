/**
 * 统计分析（仅管理员）
 * 数据来自共享后端 /api/admin/stats
 */
const api = require('../../utils/api');
const util = require('../../utils/util');

/** 与网页版 AdminStats 保持一致的模块中文名 */
const moduleLabels: Record<string, string> = {
  page_view: '页面浏览',
  game_start: '对局',
  analysis: '局面分析',
  coach: 'AI教练',
  settings: '设置',
  profile: '个人信息',
  records: '棋谱库',
  replay: '复盘',
};

/** 与网页版保持一致的对局结果颜色 */
const resultMeta: Record<string, { label: string; color: string }> = {
  '1-0': { label: '白胜', color: '#4ade80' },
  '0-1': { label: '黑胜', color: '#f87171' },
  '1/2-1/2': { label: '和棋', color: '#facc15' },
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0秒';
  if (seconds < 60) return Math.round(seconds) + '秒';
  if (seconds < 3600) return Math.round(seconds / 60) + '分钟';
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
    } catch (e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
    loading: false,
    loadError: '',
    resultPie: [] as any[],
    difficultyBars: [] as any[],
    gameTrendLabels: [] as string[],
    gameTrendSeries: [] as any[],
    userGrowthLabels: [] as string[],
    userGrowthSeries: [] as any[],
    moduleBars: [] as any[],
  },

  onLoad() {
    if (!this.checkAdmin()) return;
  },

  onShow() {
    this._syncTheme();
    if (!this.checkAdmin()) return;
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  /** 管理员校验，非管理员返回 false */
  checkAdmin(): boolean {
    if (!util.isAdminUser()) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800);
      return false;
    }
    return true;
  },

  loadData(): Promise<void> {
    this.setData({ loading: true, loadError: '' });
    return api.getAdminStats().then((res: any) => {
      const stats = res?.data || {};

      // 对局结果分布 → 饼图数据
      const resultPie = (stats.resultDistribution || []).map((r: any) => {
        const meta = resultMeta[r.result] || { label: '未结束', color: '#9ca3af' };
        return { label: meta.label, value: r.count, color: meta.color };
      });

      // 难度分布 → CSS 条形
      const diffList = stats.difficultyDistribution || [];
      const diffMax = Math.max(1, ...diffList.map((d: any) => d.count || 0));
      const difficultyBars = diffList.map((d: any) => ({
        label: 'Lv.' + d.difficulty,
        value: d.count || 0,
        percent: Math.round(((d.count || 0) / diffMax) * 100),
      }));

      // 近30日对局趋势 / 用户增长 → 折线图
      const dailyGames = stats.dailyGames || [];
      const userGrowth = stats.userGrowth || [];

      // 今日模块使用时长 → 渐变横条
      const moduleStats = stats.moduleStats || [];
      const moduleMax = Math.max(1, ...moduleStats.map((m: any) => m.avgDuration || 0));
      const moduleBars = moduleStats.map((m: any) => ({
        activityType: m.activityType,
        name: moduleLabels[m.activityType] || m.activityType,
        durationText: formatDuration(m.avgDuration || 0),
        userCount: m.userCount || 0,
        percent: Math.round(((m.avgDuration || 0) / moduleMax) * 100),
      }));

      this.setData({
        resultPie,
        difficultyBars,
        gameTrendLabels: dailyGames.map((g: any) => String(g.date || '').slice(5)),
        gameTrendSeries: [{ name: '对局数', color: '#6c63ff', values: dailyGames.map((g: any) => g.count || 0) }],
        userGrowthLabels: userGrowth.map((u: any) => String(u.date || '').slice(5)),
        userGrowthSeries: [{ name: '新增用户', color: '#4ade80', values: userGrowth.map((u: any) => u.count || 0) }],
        moduleBars,
      });
    }).catch((err: any) => {
      console.error('加载统计数据失败', err);
      this.setData({ loadError: err?.message || '加载失败，请下拉重试' });
    }).finally(() => {
      this.setData({ loading: false });
    });
  },
});

export {};

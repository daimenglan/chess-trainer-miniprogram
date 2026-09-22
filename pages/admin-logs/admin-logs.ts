/**
 * 数据监控明细：用户行为日志（仅管理员）
 * 数据来自共享后端 /api/admin/logs，分页加载，支持类型与日期筛选
 */
const api = require('../../utils/api');
const util = require('../../utils/util');

const PAGE_LIMIT = 50;

/** 与网页版 AdminLogs 一致的操作类型选项 */
const activityTypes: string[] = [
  'login', 'logout', 'page_view', 'game_start', 'game_end',
  'analysis', 'coach', 'settings', 'profile', 'records',
  'replay', 'heartbeat', 'register',
];

const typeLabels: Record<string, string> = {
  login: '登录',
  logout: '登出',
  page_view: '页面浏览',
  game_start: '开始对局',
  game_end: '结束对局',
  analysis: '局面分析',
  coach: 'AI教练',
  settings: '设置',
  profile: '个人信息',
  records: '棋谱库',
  replay: '复盘',
  heartbeat: '心跳',
  register: '注册',
};

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function formatLogTime(createdAt: string): string {
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return createdAt || '';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
    typeOptions: ['全部'].concat(activityTypes.map((t: string) => typeLabels[t] || t)),
    typeIndex: 0,
    dateFrom: '',
    dateTo: '',
    logs: [] as any[],
    page: 1,
    total: 0,
    loading: false,
    finished: false,
  },

  onLoad() {
    if (!this.checkAdmin()) return;
  },

  onShow() {
    this._syncTheme();
    if (!this.checkAdmin()) return;
    // 每次进入重置加载
    this.resetAndLoad();
  },

  onPullDownRefresh() {
    this.resetAndLoad().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.finished) return;
    this.loadPage(this.data.page + 1);
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

  currentActivityType(): string {
    const idx = this.data.typeIndex;
    return idx > 0 ? activityTypes[idx - 1] : '';
  },

  buildQuery(page: number) {
    return {
      page,
      limit: PAGE_LIMIT,
      activityType: this.currentActivityType() || undefined,
      dateFrom: this.data.dateFrom || undefined,
      dateTo: this.data.dateTo || undefined,
    };
  },

  resetAndLoad(): Promise<void> {
    return this.loadPage(1);
  },

  loadPage(page: number): Promise<void> {
    this.setData({ loading: true });
    return api.getAdminLogs(this.buildQuery(page)).then((res: any) => {
      const body = res?.data || {};
      const list: any[] = body.logs || [];
      // WXML 不调用函数，显示字段在 JS 侧预计算
      const items = list.map((log: any) => ({
        logId: log.logId,
        username: log.username,
        activityType: log.activityType,
        typeLabel: typeLabels[log.activityType] || log.activityType,
        pagePath: log.pagePath,
        timeText: formatLogTime(log.createdAt),
        durationText: log.durationSeconds ? Math.round(log.durationSeconds) + '秒' : '',
      }));

      const merged = page === 1 ? items : this.data.logs.concat(items);
      this.setData({
        logs: merged,
        page,
        total: body.total || merged.length,
        finished: items.length < PAGE_LIMIT,
      });
    }).catch((err: any) => {
      console.error('加载日志失败', err);
      util.showToast(err?.message || '加载失败');
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  onTypeChange(e: any) {
    this.setData({ typeIndex: Number(e.detail.value) || 0 });
    this.resetAndLoad();
  },

  onDateFromChange(e: any) {
    this.setData({ dateFrom: e.detail.value || '' });
    this.resetAndLoad();
  },

  onDateToChange(e: any) {
    this.setData({ dateTo: e.detail.value || '' });
    this.resetAndLoad();
  },

  onResetFilter() {
    this.setData({ typeIndex: 0, dateFrom: '', dateTo: '' });
    this.resetAndLoad();
  },
});

export {};

/**
 * 用户明细（仅管理员）
 * 数据来自共享后端 /api/admin/users/detail
 * 支持日期范围（注册时间/登录时间）、用户名模糊查询、列排序
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

/** 功能模块中文名（与后端 adminStats 保持一致） */
const MODULE_LABELS: Record<string, string> = {
  page_view: '页面浏览',
  game_start: '对局',
  analysis: '局面分析',
  coach: 'AI教练',
  settings: '设置',
  profile: '个人信息',
  records: '棋谱库',
  replay: '复盘',
};

/** 日期字段选项 */
const DATE_FIELD_OPTIONS = ['注册时间', '登录时间'];

/** 排序字段 → 中文列名 */
const SORT_FIELDS: Record<string, string> = {
  username: '用户名',
  createdAt: '注册时间',
  latestLogin: '最新登录',
  totalDuration: '总在线时长',
  avgDuration: '平均在线时长',
  longestModule: '停留最长模块',
};

const PAGE_LIMIT = 20;

/** 秒 → 可读时长 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0分钟';
  if (seconds < 60) return Math.round(seconds) + '秒';
  if (seconds < 3600) return Math.round(seconds / 60) + '分钟';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + '小时';
  return (seconds / 86400).toFixed(1) + '天';
}

/** 日期时间 → MM-DD HH:mm */
function formatDateTime(dt: string): string {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const mi = d.getMinutes();
  return `${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day} ${h < 10 ? '0' + h : h}:${mi < 10 ? '0' + mi : mi}`;
}

/** 日期 → MM-DD */
function formatDateShort(dt: string): string {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
}

/** 今天日期字符串 YYYY-MM-DD */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : d.getMonth() + 1}-${d.getDate() < 10 ? '0' + d.getDate() : d.getDate()}`;
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

    // 筛选
    dateFieldOptions: DATE_FIELD_OPTIONS,
    dateFieldIndex: 0,       // 0=注册时间 1=登录时间
    dateFrom: '',
    dateTo: '',
    search: '',

    // 表格
    users: [] as any[],
    total: 0,
    page: 1,
    limit: PAGE_LIMIT,
    loading: false,
    finished: false,

    // 排序
    sortField: '',
    sortOrder: 'desc' as 'asc' | 'desc',
    sortArrows: {
      username: '↕',
      createdAt: '↕',
      latestLogin: '↕',
      totalDuration: '↕',
      avgDuration: '↕',
      longestModule: '↕',
    } as Record<string, string>,
  },

  onLoad() {
    if (!this.checkAdmin()) return;
    this._syncTheme();
  },

  onShow() {
    this._syncTheme();
    if (!this.checkAdmin()) return;
    // 默认注册时间当天
    if (!this.data.dateFrom && !this.data.dateTo) {
      const today = todayStr();
      this.setData({ dateFrom: today, dateTo: today });
    }
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

  currentDateField(): 'register' | 'login' {
    return this.data.dateFieldIndex === 1 ? 'login' : 'register';
  },

  resetAndLoad(): Promise<void> {
    this.setData({ page: 1, finished: false });
    return this.loadPage(1);
  },

  loadPage(page: number): Promise<void> {
    this.setData({ loading: true });
    return api.getAdminUsersDetail({
      page,
      limit: this.data.limit,
      search: this.data.search || undefined,
      dateFrom: this.data.dateFrom || undefined,
      dateTo: this.data.dateTo || undefined,
      dateField: this.currentDateField(),
      sortField: this.data.sortField || undefined,
      sortOrder: this.data.sortOrder,
    }).then((res: any) => {
      const body = res?.data || {};
      const list: any[] = body.users || [];
      // WXML 不支持方法调用，预计算显示字段
      const users = list.map((u: any) => ({
        ...u,
        createdAtShort: formatDateShort(u.createdAt),
        latestLoginShort: u.latestLogin ? formatDateTime(u.latestLogin) : '',
        totalDurationText: formatDuration(u.totalDuration || 0),
        avgDurationText: formatDuration(u.avgDuration || 0),
        longestModuleLabel: MODULE_LABELS[u.longestModule] || u.longestModule || '—',
      }));

      const merged = page === 1 ? users : this.data.users.concat(users);
      this.setData({
        users: merged,
        page,
        total: body.total || merged.length,
        finished: users.length < this.data.limit,
      });
    }).catch((err: any) => {
      console.error('加载用户明细失败', err);
      util.showToast(err?.message || '加载失败');
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  // ===== 筛选事件 =====

  onDateFieldChange(e: any) {
    this.setData({ dateFieldIndex: Number(e.detail.value) || 0 });
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

  onSearchInput(e: any) {
    this.setData({ search: e.detail.value });
  },

  onSearchConfirm() {
    this.resetAndLoad();
  },

  onResetFilter() {
    const today = todayStr();
    this.setData({
      dateFieldIndex: 0,
      dateFrom: today,
      dateTo: today,
      search: '',
      sortField: '',
      sortOrder: 'desc',
      sortArrows: this.buildSortArrows(''),
    });
    this.resetAndLoad();
  },

  // ===== 排序 =====

  sortToggle(e: any) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    let sortOrder: 'asc' | 'desc' = 'desc';
    if (this.data.sortField === field) {
      sortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      // 默认排序方向：字符串字段升序，数值字段降序
      sortOrder = (field === 'username' || field === 'longestModule') ? 'asc' : 'desc';
    }
    this.setData({
      sortField: field,
      sortOrder,
      sortArrows: this.buildSortArrows(field),
    });
    this.resetAndLoad();
  },

  buildSortArrows(activeField: string): Record<string, string> {
    const arrows: Record<string, string> = {};
    for (const f of Object.keys(SORT_FIELDS)) {
      if (f === activeField) {
        arrows[f] = this.data.sortOrder === 'asc' ? '↑' : '↓';
      } else {
        arrows[f] = '↕';
      }
    }
    return arrows;
  },
});

export {};
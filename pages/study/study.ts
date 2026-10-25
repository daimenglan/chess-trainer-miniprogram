/**
 * 棋谱学习页 - 棋谱库浏览 + 分析状态
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({

  /** 同步主题 */
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
    records: [] as any[],
    loading: false,
    error: '',
    page: 1,
    limit: 30,
    totalPages: 1,
    searchQuery: '',
    ecoFilter: '',
    analysisStatus: {} as Record<number, string>,
  },

  onShow() {
    this._syncTheme();
    this.loadRecords();
  },

  async loadRecords() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.listChessRecords({
        page: this.data.page,
        limit: this.data.limit,
        search: this.data.searchQuery,
        eco: this.data.ecoFilter,
        // 与网页版「打谱」一致：scope=all 列出系统棋谱库全部棋谱（不限录入者）
        scope: 'all',
      });
      if (res?.data) {
        const records = (res.data.records || []).map((r: any) => ({
          ...r,
          dateFormatted: r.date ? util.formatDate(r.date) : (r.importedAt ? util.formatDate(r.importedAt) : ''),
        }));
        this.setData({
          records,
          totalPages: Math.max(1, Math.ceil((res.data.total || 0) / this.data.limit)),
          loading: false,
        });
      }
    } catch (err: any) {
      this.setData({ loading: false, error: err?.message || '加载棋谱失败' });
    }
  },

  async loadAnalysisStatus(records: any[]) {
    const ids = records.filter((r: any) => r.recordId).map((r: any) => r.recordId);
    if (ids.length === 0) return;
    // 后端 GET /api/records/analysis/batch 批量查询分析状态
    try {
      const res = await api.request('POST', '/api/records/analysis/batch', { ids });
      if (res?.data) {
        const status: Record<number, string> = {};
        for (const item of res.data) {
          if (item.status) status[item.recordId] = item.status;
        }
        this.setData({ analysisStatus: status });
      }
    } catch {}
  },

  onSearchInput(e: any) { this.setData({ searchQuery: e.detail.value }); },
  onEcoInput(e: any) { this.setData({ ecoFilter: e.detail.value }); },

  onSearch() {
    this.setData({ page: 1 });
    this.loadRecords();
  },

  onPrevPage() {
    if (this.data.page > 1) {
      this.setData({ page: this.data.page - 1 });
      this.loadRecords();
    }
  },

  onNextPage() {
    if (this.data.page < this.data.totalPages) {
      this.setData({ page: this.data.page + 1 });
      this.loadRecords();
    }
  },

  onReplay(e: any) {
    // 原生棋谱详情页已移除，回退到 H5 壳由网页版处理
  },

  onStudyAnalysis(e: any) {
    // 原生分析页已移除，回退到 H5 壳由网页版处理
  },
});
export {}
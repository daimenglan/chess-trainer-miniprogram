"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        }
        catch (e) { }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        records: [],
        loading: false,
        page: 1,
        limit: 30,
        totalPages: 1,
        searchQuery: '',
        ecoFilter: '',
        analysisStatus: {},
    },
    onShow() {
        this._syncTheme();
        this.loadRecords();
    },
    async loadRecords() {
        this.setData({ loading: true });
        try {
            const res = await api.listChessRecords({
                page: this.data.page,
                limit: this.data.limit,
                search: this.data.searchQuery,
                eco: this.data.ecoFilter,
            });
            if (res?.data) {
                const records = (res.data.records || []).map((r) => ({
                    ...r,
                    dateFormatted: r.date ? util.formatDate(r.date) : (r.importedAt ? util.formatDate(r.importedAt) : ''),
                }));
                this.setData({
                    records,
                    totalPages: Math.max(1, Math.ceil((res.data.total || 0) / this.data.limit)),
                    loading: false,
                });
            }
        }
        catch {
            this.setData({ loading: false });
        }
    },
    async loadAnalysisStatus(records) {
        const ids = records.filter((r) => r.recordId).map((r) => r.recordId);
        if (ids.length === 0)
            return;
        // 后端 GET /api/records/analysis/batch 批量查询分析状态
        try {
            const res = await api.request('POST', '/api/records/analysis/batch', { ids });
            if (res?.data) {
                const status = {};
                for (const item of res.data) {
                    if (item.status)
                        status[item.recordId] = item.status;
                }
                this.setData({ analysisStatus: status });
            }
        }
        catch { }
    },
    onSearchInput(e) { this.setData({ searchQuery: e.detail.value }); },
    onEcoInput(e) { this.setData({ ecoFilter: e.detail.value }); },
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
    onReplay(e) {
        const idx = e.currentTarget.dataset.idx;
        const record = this.data.records[idx];
        if (record) {
            const app = getApp();
            app.globalData._analysisGame = record;
            wx.navigateTo({
                url: `/pages/record-detail/record-detail`,
            });
        }
    },
    onStudyAnalysis(e) {
        const idx = e.currentTarget.dataset.idx;
        const record = this.data.records[idx];
        if (record) {
            const app = getApp();
            app.globalData._analysisGame = record;
            wx.navigateTo({
                url: `/pages/analysis/analysis`,
            });
        }
    },
});

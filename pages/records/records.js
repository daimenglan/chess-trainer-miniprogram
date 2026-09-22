"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 棋谱记录页
 * 两个Tab：棋谱库（公共）、我的对局
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
        activeTab: 'records', // 'records' | 'mygames'
        // 棋谱库
        records: [],
        recordsTotal: 0,
        recordsPage: 1,
        recordsLimit: 20,
        recordsTotalPages: 1,
        searchQuery: '',
        ecoFilter: '',
        loadingRecords: false,
        // 我的对局
        games: [],
        loadingGames: false,
        // 导入
        showImportModal: false,
        importPgnText: '',
        importResult: null,
        errorsText: '',
        importing: false,
    },
    onLoad() {
        this.loadRecords();
        this.loadMyGames();
    },
    onShow() {
        this._syncTheme();
        // 切换tab时刷新
        if (this.data.activeTab === 'records') {
            this.loadRecords();
        }
        else {
            this.loadMyGames();
        }
    },
    // ===== Tab切换 =====
    onTabSwitch(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ activeTab: tab });
        if (tab === 'records')
            this.loadRecords();
        else
            this.loadMyGames();
    },
    // ===== 棋谱库 =====
    loadRecords() {
        this.setData({ loadingRecords: true });
        api.listChessRecords({
            page: this.data.recordsPage,
            limit: this.data.recordsLimit,
            search: this.data.searchQuery,
            eco: this.data.ecoFilter,
        })
            .then((res) => {
            if (res?.data) {
                // WXML 不能调用 JS 函数，日期在 JS 侧预格式化
                const records = (res.data.records || []).map((r) => ({
                    ...r,
                    dateFormatted: r.date || (r.importedAt ? util.formatDate(r.importedAt) : ''),
                }));
                this.setData({
                    records,
                    recordsTotal: res.data.total || 0,
                    recordsTotalPages: Math.max(1, Math.ceil((res.data.total || 0) / this.data.recordsLimit)),
                });
            }
        })
            .catch(() => {
            util.showToast('加载棋谱失败');
        })
            .finally(() => {
            this.setData({ loadingRecords: false });
        });
    },
    onSearchInput(e) {
        this.setData({ searchQuery: e.detail.value });
    },
    onEcoInput(e) {
        this.setData({ ecoFilter: e.detail.value });
    },
    onSearch() {
        this.setData({ recordsPage: 1 });
        this.loadRecords();
    },
    onRecordsPagePrev() {
        if (this.data.recordsPage > 1) {
            this.setData({ recordsPage: this.data.recordsPage - 1 });
            this.loadRecords();
        }
    },
    onRecordsPageNext() {
        const maxPage = Math.ceil(this.data.recordsTotal / this.data.recordsLimit);
        if (this.data.recordsPage < maxPage) {
            this.setData({ recordsPage: this.data.recordsPage + 1 });
            this.loadRecords();
        }
    },
    onReplayRecord(e) {
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
    onDeleteRecord(e) {
        const idx = e.currentTarget.dataset.idx;
        const record = this.data.records[idx];
        if (!record)
            return;
        wx.showModal({
            title: '确认删除',
            content: '确定要删除此棋谱吗？',
            success: (res) => {
                if (res.confirm) {
                    api.deleteRecord(record.recordId)
                        .then(() => {
                        util.showToast('(success)', 'success');
                        this.loadRecords();
                    })
                        .catch(() => util.showToast('删除失败'));
                }
            },
        });
    },
    // ===== 我的对局 =====
    loadMyGames() {
        this.setData({ loadingGames: true });
        api.loadGames()
            .then((res) => {
            if (res?.data) {
                const raw = res.data.games || res.data;
                // 预格式化：日期 + "我方/AI" 显示名（WXML 不支持方法调用）
                const games = (Array.isArray(raw) ? raw : []).map((g) => ({
                    ...g,
                    dateFormatted: g.date ? util.formatDate(g.date) : '',
                    whiteName: this.isPlayer(g.white) ? '你' : (g.white === 'AI' || g.white === 'ai' ? 'AI' : (g.white || '白方')),
                    blackName: this.isPlayer(g.black) ? '你' : (g.black === 'AI' || g.black === 'ai' ? 'AI' : (g.black || '黑方')),
                }));
                this.setData({ games });
            }
        })
            .catch(() => {
            // 未登录不显示错误
        })
            .finally(() => {
            this.setData({ loadingGames: false });
        });
    },
    // 后端 white/black 字段为 'player'/'human'/'ai' 等，判断是否代表玩家
    isPlayer(type) {
        return type === 'player' || type === 'human' || type === '我';
    },
    onAnalyzeGame(e) {
        const idx = e.currentTarget.dataset.idx;
        const game = this.data.games[idx];
        if (game) {
            const app = getApp();
            app.globalData._analysisGame = game;
            wx.navigateTo({
                url: `/pages/analysis/analysis`,
            });
        }
    },
    goToGame() {
        wx.switchTab({ url: '/pages/index/index' });
    },
    // 阻止事件冒泡（导入弹窗内层卡片 catchtap 配套的空处理器）
    stopPropagation() { },
    // ===== 导入PGN =====
    onShowImport() {
        this.setData({ showImportModal: true, importPgnText: '', importResult: null });
    },
    onHideImport() {
        this.setData({ showImportModal: false });
    },
    onImportPgnInput(e) {
        this.setData({ importPgnText: e.detail.value });
    },
    onImport() {
        if (!this.data.importPgnText.trim()) {
            util.showToast('请输入PGN文本');
            return;
        }
        this.setData({ importing: true });
        api.importChessRecords(this.data.importPgnText)
            .then((res) => {
            if (res?.data) {
                this.setData({ importResult: res.data, errorsText: (res.data.errors && res.data.errors.length > 0) ? res.data.errors.join('\n') : '' });
                util.showToast(`导入成功 ${res.data.count} 局`, 'success');
                this.loadRecords();
            }
        })
            .catch((err) => {
            this.setData({ importResult: { count: 0, errors: [err.message] }, errorsText: err.message });
        })
            .finally(() => {
            this.setData({ importing: false });
        });
    },
});

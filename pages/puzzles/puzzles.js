"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 习题训练页 - 多维分类筛选 + 做题交互
 *
 * 核心设计：
 * - 棋盘根据 `orientation` 翻转：执白时白方在下，执黑时黑方在下
 * - `orientation` 决定玩家执哪方：'white'=执白，'black'=执黑
 * - FEN 已包含对手刚走完的局面，用户直接走己方颜色
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const Chess = require('../../utils/chessjs');
const DIFFICULTY_RANGES = {
    '800': [0, 800], '1200': [800, 1200], '1600': [1200, 1600],
    '2000': [1600, 2000], '3000': [2000, 3000],
};
Page({
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme)
                this.setData({ __theme__: theme });
        }
        catch (e) { /* non-critical */ }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        token: null,
        phase: '', difficulty: '', mode: 'new',
        selectedThemes: [], showThemes: false,
        themeGroups: [],
        // 搜索
        showSearch: false,
        searchQuery: '',
        searchResults: [],
        searching: false,
        // 做题
        attemptState: null,
        puzzleInfo: null,
        puzzleFen: '',
        puzzleOrientation: 'white',
        puzzleFlipped: false,
        selectedSquare: '',
        legalMoves: [],
        lastMoveFrom: '',
        lastMoveTo: '',
        stepIndex: 0, totalSteps: 0, attemptsLeft: 3,
        loading: false, message: '', msgType: 'info',
        moveResult: null, resultTitle: '', resultClass: '', solutionText: '',
        puzzleCompleted: false,
        favorited: false, hintUsed: false,
        showExplain: false, explainText: '', explaining: false,
        stats: null,
        // 目标进度追踪
        trainingTarget: 0,
        puzzleDone: 0,
        puzzleCorrect: 0,
        puzzleWrong: 0,
        dailyDate: '',
        motivationBanner: { icon: '', text: '', color: '' },
        progressPct: 0,
        goalHint: '',
        showDiagnosis: false, diagnosing: false, diagResult: null,
        showFilters: true,
        _attemptId: '', _explainAbort: null, _puzzleChess: null, _puzzleId: 0,
        _processingCompletion: false,
    },
    onLoad() {
        this._syncTheme();
        const token = app.globalData.token;
        this.setData({ token });
        this.loadThemes();
        if (token) {
            this.loadStats();
            this.loadDailyCounts();
            this.loadTrainingStats();
        }
    },
    onUnload() {
        if (this.data._explainAbort)
            this.data._explainAbort.abort();
    },
    async loadThemes() {
        try {
            const res = await api.getPuzzleThemes();
            if (res?.data) {
                const grouped = res.data.grouped || {};
                this.setData({
                    themeGroups: Object.keys(grouped).map(category => ({
                        category,
                        items: (grouped[category] || []).map((item) => ({ ...item, selected: false }))
                    }))
                });
            }
        }
        catch { }
    },
    async loadStats() {
        try {
            const res = await api.getPuzzleStats();
            const stats = res?.data;
            if (stats) {
                // WXML 不支持 Math.round，正确率在此算好
                const solvedRatePct = stats.totalAttempts ? Math.round((stats.solvedRate || 0) * 100) : 0;
                this.setData({ stats: { ...stats, solvedRatePct } });
            }
        }
        catch { }
    },
    /** 从训练计划 API 获取今日目标 */
    async loadTrainingStats() {
        try {
            const res = await api.getTrainingStats();
            const stats = res?.data || res || null;
            if (stats && typeof stats.todayTarget === 'number') {
                this.setData({ trainingTarget: stats.todayTarget });
                this.updateGoalDisplay();
            }
        }
        catch { }
    },
    /** 从本地存储加载今日计数，跨日自动重置 */
    loadDailyCounts() {
        try {
            const today = this._todayStr();
            const saved = wx.getStorageSync('puzzle_daily_counts');
            if (saved && saved.date === today) {
                this.setData({
                    puzzleDone: saved.done || 0,
                    puzzleCorrect: saved.correct || 0,
                    puzzleWrong: saved.wrong || 0,
                    dailyDate: today,
                });
            }
            else {
                // 跨日重置
                const resetData = { date: today, done: 0, correct: 0, wrong: 0 };
                wx.setStorageSync('puzzle_daily_counts', resetData);
                this.setData({
                    puzzleDone: 0, puzzleCorrect: 0, puzzleWrong: 0, dailyDate: today,
                });
            }
        }
        catch { }
        this.updateGoalDisplay();
    },
    /** 将今日计数存入本地存储 */
    saveDailyCounts() {
        try {
            wx.setStorageSync('puzzle_daily_counts', {
                date: this.data.dailyDate || this._todayStr(),
                done: this.data.puzzleDone,
                correct: this.data.puzzleCorrect,
                wrong: this.data.puzzleWrong,
            });
        }
        catch { }
    },
    /** 更新进度百分比和激励横幅 */
    updateGoalDisplay() {
        const target = this.data.trainingTarget;
        const done = this.data.puzzleDone;
        const correct = this.data.puzzleCorrect;
        const wrong = this.data.puzzleWrong;
        if (target <= 0) {
            this.setData({ progressPct: 0, motivationBanner: { icon: '', text: '', color: '' }, goalHint: '' });
            return;
        }
        const pct = Math.min(100, Math.round((done / target) * 100));
        const banner = this.computeMotivationBanner(done, target);
        const hint = this.computeGoalHint(done, target);
        this.setData({ progressPct: pct, motivationBanner: banner, goalHint: hint });
    },
    /** 根据进度计算激励横幅 */
    computeMotivationBanner(done, target) {
        if (target <= 0)
            return { icon: '', text: '', color: '' };
        if (done === 0)
            return { icon: '🌱', text: '开始做题吧，每一题都是进步！', color: 'mb-green' };
        const pct = Math.round((done / target) * 100);
        if (pct >= 100) {
            return { icon: '🎉', text: '恭喜达成今日目标！太棒了！', color: 'mb-green' };
        }
        if (pct >= 76)
            return { icon: '⭐', text: `已完成 ${pct}%，就差最后几题！冲刺！`, color: 'mb-amber' };
        if (pct >= 51)
            return { icon: '🎯', text: `已完成 ${pct}%，离目标越来越近了！`, color: 'mb-blue' };
        if (pct >= 26)
            return { icon: '🔥', text: `已完成 ${pct}%，半程已过，火力全开！`, color: 'mb-orange' };
        if (pct >= 1)
            return { icon: '💪', text: `已完成 ${pct}%，继续加油，保持节奏！`, color: 'mb-purple' };
        return { icon: '🌱', text: '开始做题吧，每一题都是进步！', color: 'mb-green' };
    },
    /** 计算目标提示语 */
    computeGoalHint(done, target) {
        if (target <= 0)
            return '今日暂无训练目标，去「训练计划」页设置';
        if (done >= target)
            return `🎉 已超越目标 ${done - target} 题！`;
        return `还需 ${target - done} 题达成今日目标`;
    },
    _todayStr() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },
    // ===== 筛选操作 =====
    onPhaseSelect(e) { this.setData({ phase: e.currentTarget.dataset.value }); },
    onDifficultySelect(e) { this.setData({ difficulty: e.currentTarget.dataset.value }); },
    onModeSelect(e) { this.setData({ mode: e.currentTarget.dataset.value }); },
    onToggleThemes() { this.setData({ showThemes: !this.data.showThemes }); },
    onToggleTheme(e) {
        const theme = e.currentTarget.dataset.theme;
        const selected = [...this.data.selectedThemes];
        const idx = selected.indexOf(theme);
        if (idx >= 0)
            selected.splice(idx, 1);
        else
            selected.push(theme);
        // 更新 themeGroups 中每个 item 的 selected 标志
        const themeGroups = this.data.themeGroups.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item, selected: selected.indexOf(item.name) >= 0 }))
        }));
        this.setData({ selectedThemes: selected, themeGroups });
    },
    onRemoveTheme(e) {
        const theme = e.currentTarget.dataset.theme;
        const selected = this.data.selectedThemes.filter((t) => t !== theme);
        const themeGroups = this.data.themeGroups.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item, selected: selected.indexOf(item.name) >= 0 }))
        }));
        this.setData({ selectedThemes: selected, themeGroups });
    },
    onResetFilters() {
        const themeGroups = this.data.themeGroups.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item, selected: false }))
        }));
        this.setData({ phase: '', difficulty: '', mode: 'new', selectedThemes: [], showThemes: false, themeGroups });
    },
    onToggleFilters() { this.setData({ showFilters: !this.data.showFilters }); },
    // ===== 搜索 =====
    onToggleSearch() {
        this.setData({ showSearch: !this.data.showSearch, searchQuery: '', searchResults: [] });
    },
    onSearchInput(e) {
        this.setData({ searchQuery: e.detail.value });
    },
    onSearchPuzzles() {
        const query = this.data.searchQuery.trim();
        if (!query) {
            this.showMessage('请输入搜索关键词', 'error');
            return;
        }
        this.setData({ searching: true });
        api.searchChessGames(query, 'lichess', 5)
            .then((res) => {
            const results = res?.data?.results || res?.data || [];
            this.setData({ searchResults: results, searching: false });
            if (results.length === 0) {
                this.showMessage('未找到相关棋谱', 'info');
            }
        })
            .catch((err) => {
            this.showMessage(err.message || '搜索失败', 'error');
            this.setData({ searching: false });
        });
    },
    onImportSearchResult(e) {
        const idx = e.currentTarget.dataset.idx;
        const result = this.data.searchResults[idx];
        if (!result)
            return;
        const pgn = result.pgn || result.fen;
        if (!pgn) {
            this.showMessage('该结果没有可导入的棋谱数据', 'error');
            return;
        }
        this.setData({ loading: true });
        api.importChessRecords(pgn)
            .then((res) => {
            if (res?.data) {
                this.showMessage(`导入成功 ${res.data.count} 局`, 'success');
                this.setData({ searchResults: [], searchQuery: '', showSearch: false });
            }
        })
            .catch((err) => this.showMessage(err.message || '导入失败', 'error'))
            .finally(() => this.setData({ loading: false }));
    },
    // ===== 做题 =====
    async onStartPuzzle() {
        this.setData({ loading: true, moveResult: null, message: '' });
        try {
            const range = DIFFICULTY_RANGES[this.data.difficulty] || undefined;
            const res = await api.startPuzzle({
                phase: this.data.phase || undefined,
                themes: this.data.selectedThemes.length > 0 ? this.data.selectedThemes : undefined,
                minDifficulty: range?.[0], maxDifficulty: range?.[1],
                fromWrongBook: this.data.mode === 'wrong',
                excludeSolved: this.data.mode === 'new',
            });
            if (res?.data) {
                const state = res.data;
                const chess = new Chess.Chess(state.fen);
                // orientation='white': 用户执白，白方在下方
                // orientation='black': 用户执黑，黑方在下方（棋盘翻转）
                // FEN 已包含对手刚走完的局面
                this.setData({
                    attemptState: state,
                    puzzleInfo: state.puzzle,
                    puzzleFen: state.fen,
                    puzzleOrientation: state.orientation,
                    puzzleFlipped: state.orientation === 'black',
                    stepIndex: state.stepIndex,
                    totalSteps: state.totalSteps,
                    attemptsLeft: state.attemptsLeft,
                    _attemptId: state.attemptId,
                    _puzzleId: state.puzzle?.id,
                    _puzzleChess: chess,
                    selectedSquare: '', legalMoves: [],
                    lastMoveFrom: '', lastMoveTo: '',
                    favorited: false, hintUsed: false,
                    puzzleCompleted: false,
                    showExplain: false, explainText: '',
                    showFilters: false,
                });
                this.showMessage(state.orientation === 'white' ? '请走白方！' : '请走黑方！', 'info');
                // 通过逆向分析找到对手刚走的一步，显示箭头
                this.detectOpponentLastMove(state.fen, state.orientation, chess);
            }
        }
        catch (err) {
            this.showMessage(err.message || '没有符合条件的题目', 'error');
        }
        finally {
            this.setData({ loading: false });
        }
    },
    /**
     * 逆向分析：从当前 FEN 推断对手刚走的最后一步，并用箭头展示
     * 原理：翻转轮到的一方，尝试所有合法走法，看哪步走完后回到当前 FEN
     */
    detectOpponentLastMove(fen, orientation, chess) {
        try {
            const opponentColor = orientation === 'white' ? 'b' : 'w';
            // 翻转 FEN 中的轮到标志，让对手"走一步"回到之前的局面
            const parts = fen.split(' ');
            if (parts.length < 2)
                return;
            parts[1] = opponentColor;
            const prevFen = parts.join(' ');
            const prevChess = new Chess.Chess(prevFen);
            const moves = prevChess.moves({ verbose: true });
            for (const m of moves) {
                prevChess.move(m);
                if (prevChess.fen() === chess.fen()) {
                    this.setData({ lastMoveFrom: m.from, lastMoveTo: m.to });
                    return;
                }
                prevChess.undo();
            }
        }
        catch (e) {
            // 逆向分析失败不影响主流程
        }
    },
    /** 棋盘点击 */
    onPuzzleSquareTap(e) {
        if (this.data.puzzleCompleted || this.data._processingCompletion)
            return;
        const square = e.detail.square;
        const chess = this.data._puzzleChess;
        if (!chess)
            return;
        // 取消选中
        if (this.data.selectedSquare === square) {
            this.setData({ selectedSquare: '', legalMoves: [] });
            return;
        }
        // 走子
        if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
            this.submitPuzzleMove(this.data.selectedSquare, square);
            return;
        }
        // 选中己方棋子（根据 orientation 决定）
        const playerColor = this.data.puzzleOrientation === 'black' ? 'b' : 'w';
        const piece = chess.get(square);
        if (piece && piece.color === playerColor) {
            const moves = chess.moves({ square, verbose: true });
            this.setData({
                selectedSquare: square,
                legalMoves: moves.map((m) => m.to),
            });
        }
    },
    /** 提交走法到 API */
    async submitPuzzleMove(from, to) {
        const uci = from + to;
        this.setData({ selectedSquare: '', legalMoves: [] });
        try {
            const res = await api.submitPuzzleMove(this.data._attemptId, uci);
            const result = res?.data;
            if (!result)
                return;
            if (result.completed) {
                // 最后一步：先在棋盘上应用走法，再延迟展示结果
                const chess = this.data._puzzleChess;
                let lastFrom = '', lastTo = '';
                try {
                    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
                    lastFrom = uci.slice(0, 2);
                    lastTo = uci.slice(2, 4);
                    if (result.opponentMoveUci) {
                        chess.move({
                            from: result.opponentMoveUci.slice(0, 2),
                            to: result.opponentMoveUci.slice(2, 4),
                            promotion: result.opponentMoveUci.length > 4 ? result.opponentMoveUci.slice(4) : 'q',
                        });
                    }
                }
                catch { }
                this.setData({
                    puzzleFen: result.nextFen || chess.fen(),
                    _puzzleChess: chess,
                    lastMoveFrom: lastFrom,
                    lastMoveTo: lastTo,
                    _processingCompletion: true,
                });
                this.showMessage(result.message || '正确！', 'success');
                // 延迟展示结果卡片，让用户先看到走子效果
                setTimeout(() => {
                    this.handlePuzzleComplete(result);
                }, 700);
                return;
            }
            // 最后一步走错：无论正确与否都完成习题
            const isLastStep = this.data.stepIndex + 1 >= this.data.totalSteps;
            if (isLastStep && result.legal) {
                this.handlePuzzleComplete({
                    ...result,
                    result: result.correct ? result.result : 0,
                    completed: true,
                });
                return;
            }
            if (result.legal && result.correct) {
                const chess = this.data._puzzleChess;
                let lastFrom = '', lastTo = '';
                try {
                    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
                    lastFrom = uci.slice(0, 2);
                    lastTo = uci.slice(2, 4);
                    if (result.opponentMoveUci) {
                        chess.move({
                            from: result.opponentMoveUci.slice(0, 2),
                            to: result.opponentMoveUci.slice(2, 4),
                            promotion: result.opponentMoveUci.length > 4 ? result.opponentMoveUci.slice(4) : 'q',
                        });
                    }
                }
                catch { }
                this.setData({
                    puzzleFen: result.nextFen || chess.fen(),
                    stepIndex: this.data.stepIndex + 1,
                    _puzzleChess: chess,
                    attemptsLeft: result.attemptsLeft,
                    lastMoveFrom: lastFrom,
                    lastMoveTo: lastTo,
                });
                this.showMessage(result.message || '正确！', 'success');
            }
            else if (result.legal) {
                this.showMessage(result.message || '不正确，再想想', 'error');
                this.setData({ attemptsLeft: result.attemptsLeft });
            }
            else {
                this.showMessage('非法走法', 'error');
            }
        }
        catch (err) {
            this.showMessage(err.message || '提交失败', 'error');
        }
    },
    handlePuzzleComplete(result) {
        this.setData({ puzzleCompleted: true, _processingCompletion: false, moveResult: result, stepIndex: this.data.stepIndex + 1 });
        let title = '未通过', cls = 'result-fail';
        if (result.result === 2) {
            title = '🎉 完全正确';
            cls = 'result-win';
        }
        else if (result.result === 1) {
            title = '👍 部分正确';
            cls = 'result-draw';
        }
        // 预计算解法文本
        const solutionText = result.solutionMoves ? result.solutionMoves.join(' ') : '';
        this.setData({ resultTitle: title, resultClass: cls, solutionText });
        this.loadStats();
        // 更新今日计数（result: 2=完全正确, 1=部分正确, 0=未通过）
        // 部分正确算作「对」，鼓励进步
        const done = this.data.puzzleDone + 1;
        let correct = this.data.puzzleCorrect;
        let wrong = this.data.puzzleWrong;
        if (result.result === 2 || result.result === 1) {
            correct += 1;
        }
        else {
            wrong += 1;
        }
        this.setData({ puzzleDone: done, puzzleCorrect: correct, puzzleWrong: wrong });
        this.saveDailyCounts();
        this.updateGoalDisplay();
        // 自动跳转下一题（延迟展示结果后）
        if (this.data.showFilters)
            return; // 筛选面板展开时不自动跳转
        setTimeout(() => {
            if (this.data.puzzleCompleted) {
                this.onNextPuzzle();
            }
        }, 2000);
    },
    async onHint() {
        if (this.data.hintUsed || !this.data._attemptId)
            return;
        try {
            const res = await api.requestPuzzleHint(this.data._attemptId);
            if (res?.data) {
                const hint = res.data;
                this.setData({
                    hintUsed: true,
                    lastMoveFrom: hint.from,
                    lastMoveTo: hint.to,
                });
                this.showMessage(`💡 提示：${hint.san}（走这步算失败）`, 'info');
            }
        }
        catch (err) {
            this.showMessage(err.message || '获取提示失败', 'error');
        }
    },
    async onGiveUp() {
        if (!this.data._attemptId)
            return;
        try {
            const res = await api.giveUpPuzzle(this.data._attemptId);
            if (res?.data) {
                this.handlePuzzleComplete(res.data);
                this.showMessage('已放弃', 'info');
            }
        }
        catch (err) {
            this.showMessage(err.message || '操作失败', 'error');
        }
    },
    async onToggleFav() {
        try {
            if (this.data.favorited) {
                await api.removePuzzleFavorite(this.data._puzzleId);
                this.setData({ favorited: false });
                this.showMessage('已取消收藏', 'info');
            }
            else {
                await api.addPuzzleFavorite(this.data._puzzleId);
                this.setData({ favorited: true });
                this.showMessage('已收藏', 'success');
            }
        }
        catch { }
    },
    onExplain() {
        if (this.data.showExplain) {
            this.setData({ showExplain: false, explainText: '' });
            if (this.data._explainAbort)
                this.data._explainAbort.abort();
            return;
        }
        this.setData({ showExplain: true, explaining: true, explainText: '' });
        const controller = api.explainPuzzleStream(this.data._attemptId, {
            onChunk: (chunk) => { this.setData({ explainText: this.data.explainText + chunk }); },
            onDone: () => { this.setData({ explaining: false }); },
            onError: (err) => { this.setData({ explainText: this.data.explainText + (err.message || '讲解失败'), explaining: false }); },
        });
        this.setData({ _explainAbort: controller });
    },
    onCloseExplain() { this.setData({ showExplain: false, explainText: '' }); if (this.data._explainAbort)
        this.data._explainAbort.abort(); },
    onCloseDiag() { this.setData({ showDiagnosis: false }); },
    onNextPuzzle() { this.setData({ moveResult: null, showFilters: true, solutionText: '' }); this.onStartPuzzle(); },
    // ===== 工具方法 =====
    phaseLabel(p) {
        return p === 'opening' ? '开局' : p === 'middlegame' ? '中局' : p === 'endgame' ? '残局' : '综合';
    },
    showMessage(msg, type) {
        this.setData({ message: msg, msgType: type });
        if (type !== 'error')
            setTimeout(() => this.setData({ message: '' }), 3000);
    },
});

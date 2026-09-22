"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 对局分析/复盘页 — 完整版
 * 功能：棋盘回放、SSE流式复盘、优劣势走势图（canvas）、走法详情面板、
 *       AI 局面分析弹窗、AI教练、手动推演
 */
const Chess = require('../../utils/chessjs');
const api = require('../../utils/api');
const util = require('../../utils/util');
const localAI = require('../../utils/localAI');
const notation = require('../../utils/chessNotation');
const CLASSIFICATION_META = {
    best: { icon: '⭐', color: 'text-green', label: '最佳' },
    good: { icon: '👍', color: 'text-blue', label: '良好' },
    inaccuracy: { icon: '⚠️', color: 'text-yellow', label: '不精确' },
    mistake: { icon: '❌', color: 'text-orange', label: '失误' },
    blunder: { icon: '💥', color: 'text-red', label: '大错' },
};
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
        game: null,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        displayFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        moveReviews: {},
        currentMoveIndex: -1,
        totalMoves: 0,
        lastMoveFrom: '',
        lastMoveTo: '',
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        flipped: false,
        playerSide: 'w',
        // 复盘分析
        reviewLoading: false,
        reviewProgress: 0,
        reviewDone: false,
        reviewError: false,
        summary: null,
        moveReviewCount: 0,
        moveReviewList: [],
        reviewDetailIndex: null,
        reviewDetail: null,
        // 走势图
        chartData: [],
        chartReady: false,
        // 局面分析
        analysisCandidates: [],
        openingName: '',
        openingNameCN: '',
        ecoCode: '',
        // 推演
        explorationMode: '',
        exploreSteps: [],
        exploreStepIndex: -1,
        exploreAutoRunning: false,
        exploreAutoPaused: false,
        selectedSquare: '',
        legalMoves: [],
        // AI 分析弹窗
        showAiAnalysis: false,
        aiAnalysisLoading: false,
        aiAnalysisText: '',
        recordId: null,
        gameId: null,
        // 视频生成
        showVideoModal: false,
        videoGenerating: false,
        videoStatus: '',
        showVideoGeneration: true,
        // 分享
        showShareModal: false,
        shareLink: '',
        // 右侧 Tab
        rightTab: 'history',
        showMoreMenu: false,
        // 走势图点击命中区域 [{moveNumber, san, score, rect: {x, y, w, h}}]
        chartHitRects: [],
        // 分阶段高亮信息（开局/中局/残局各阶段最佳/最差/转折点）
        chartPhaseInfo: [],
        // 内容折叠状态（分析线 / 每阶段推荐走法 / 局面分析面板）
        chartLineExpanded: true,
        phaseMovesExpanded: true,
        panelExpanded: true,
    },
    _chess: null,
    _exploreChess: null,
    _reviewAbort: null,
    _analysisAbort: null,
    _analysisTimer: null,
    _exploreAutoTimer: null,
    onLoad(options) {
        this._syncTheme();
        // 加载权限设置（视频生成等）
        this.updatePermissionUI();
        // 优先使用 app.globalData 传递的完整对局数据（避免 URL 参数截断）
        let game = null;
        try {
            const app = getApp();
            if (app.globalData._analysisGame) {
                game = app.globalData._analysisGame;
                app.globalData._analysisGame = null;
            }
        }
        catch { }
        // 其次尝试 URL 参数
        if (!game && options.game) {
            try {
                game = JSON.parse(decodeURIComponent(options.game));
            }
            catch (e) { }
        }
        if (game) {
            try {
                // 预计算玩家名显示
                // 确定玩家执棋方（复盘时所有分析从该方视角展示）
                const isPlayer = (name) => name === 'player' || name === 'human' || name === '我';
                const playerSide = isPlayer(game.white) ? 'w' : (isPlayer(game.black) ? 'b' : 'w');
                const whiteName = isPlayer(game.white) ? '你' : (game.white === 'AI' ? 'AI' : (game.white || '白方'));
                const blackName = isPlayer(game.black) ? '你' : (game.black === 'AI' ? 'AI' : (game.black || '黑方'));
                game.whiteName = whiteName;
                game.blackName = blackName;
                if (game.gameId)
                    this.data.gameId = game.gameId;
                if (game.recordId)
                    this.data.recordId = game.recordId;
                this.setData({ game, playerSide });
                this.loadPGN(game.pgn);
            }
            catch (e) {
                util.showToast('加载对局失败');
            }
        }
    },
    onUnload() {
        if (this._reviewAbort) {
            this._reviewAbort.abort();
        }
        if (this._analysisAbort) {
            this._analysisAbort.abort();
        }
        this.clearExploreAutoTimer();
    },
    loadPGN(pgn) {
        if (!pgn) {
            console.warn('[Analysis] empty PGN');
            util.showToast('没有棋谱数据，无法复盘');
            return;
        }
        const cleanPgn = notation.normalizePgn(pgn);
        if (!cleanPgn) {
            console.warn('[Analysis] empty PGN after normalize');
            util.showToast('没有棋谱数据，无法复盘');
            return;
        }
        // 解析失败时用「仅走法文本」兜底重试（兼容头部标签异常的非标准 PGN）
        const attempts = [cleanPgn, notation.stripPgnHeaders(cleanPgn)];
        let parseError = null;
        for (const candidate of attempts) {
            if (!candidate)
                continue;
            try {
                this._chess = new Chess.Chess();
                this._chess.loadPgn(candidate);
                parseError = null;
                break;
            }
            catch (e) {
                parseError = e;
            }
        }
        if (parseError) {
            console.error('[Analysis] PGN parse error:', parseError, 'PGN length:', pgn.length, 'PGN first 200:', pgn.substring(0, 200));
            this._chess = new Chess.Chess();
            this.setData({
                moves: [],
                totalMoves: 0,
                currentMoveIndex: -1,
                fen: this._chess.fen(),
                displayFen: this._chess.fen(),
            });
            util.showToast('PGN解析失败');
            return;
        }
        const moves = this._chess.history({ verbose: true });
        this._chess.reset();
        this.setData({
            moves,
            totalMoves: moves.length,
            currentMoveIndex: -1,
            fen: this._chess.fen(),
            displayFen: this._chess.fen(),
        });
        // 自动分析首局面
        this.triggerAnalysis();
    },
    // ===== 导航 =====
    goToStart() {
        this._chess.reset();
        this.updateBoardState(-1);
        this.triggerAnalysis();
    },
    goToPrevious() {
        if (this.data.currentMoveIndex < 0)
            return;
        this._chess.undo();
        const idx = this.data.currentMoveIndex - 1;
        this.updateBoardState(idx);
        this.triggerAnalysis();
    },
    goToNext() {
        const idx = this.data.currentMoveIndex + 1;
        if (idx >= this.data.moves.length)
            return;
        const move = this.data.moves[idx];
        try {
            this._chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
            this.updateBoardState(idx);
            this.triggerAnalysis();
        }
        catch (e) { }
    },
    goToEnd() {
        if (this.data.moves.length === 0)
            return;
        this.goToMove(this.data.moves.length - 1);
    },
    goToMove(index) {
        this._chess.reset();
        for (let i = 0; i <= index && i < this.data.moves.length; i++) {
            const move = this.data.moves[i];
            try {
                this._chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
            }
            catch (e) {
                break;
            }
        }
        this.updateBoardState(index);
        this.triggerAnalysis();
    },
    onGoToMove(e) {
        const index = e.detail?.index;
        if (index !== undefined)
            this.goToMove(index);
    },
    onReviewItemTap(e) {
        const index = parseInt(e.currentTarget.dataset.index);
        if (!isNaN(index)) {
            this.goToMove(index);
            this.showReviewDetail(index);
        }
    },
    updateBoardState(index) {
        const lastMove = index >= 0 && this.data.moves[index] ? this.data.moves[index] : null;
        this.setData({
            currentMoveIndex: index,
            fen: this._chess.fen(),
            displayFen: this._chess.fen(),
            isCheck: this._chess.isCheck(),
            isCheckmate: this._chess.isCheckmate(),
            isStalemate: this._chess.isStalemate(),
            lastMoveFrom: lastMove?.from || '',
            lastMoveTo: lastMove?.to || '',
        });
    },
    onFlip() {
        this.closeMoreMenu();
        this.setData({ flipped: !this.data.flipped });
    },
    goBack() {
        util.navigateBackSafe('/pages/records/records');
    },
    /**
     * 将引擎分数归一化到玩家视角
     * API返回的分数始终是白方视角（正数=白方有利）
     * 如果玩家执黑，分数取反使正数始终代表对玩家有利
     */
    normalizeScore(score) {
        if (score === undefined || score === null)
            return score;
        const playerSide = this.data.playerSide;
        if (!playerSide)
            return score;
        return playerSide === 'w' ? score : -score;
    },
    // ===== 局面分析 =====
    triggerAnalysis() {
        const fen = this._chess?.fen();
        if (!fen)
            return;
        // 延迟触发，避免频繁请求
        clearTimeout(this._analysisTimer);
        this._analysisTimer = setTimeout(() => {
            api.analyzePosition({ fen, depth: 10, multiPv: 3 })
                .then((res) => {
                if (res?.data) {
                    const candidates = (res.data.candidates || []).map((c, i) => ({
                        ...c,
                        rank: i + 1,
                        // 分数归一化到玩家视角
                        score: typeof c.score === 'number' ? this.normalizeScore(c.score) : 0,
                        scoreFormatted: '', // 下面重新计算
                        scoreColor: '',
                        pros: util.keyedList(c.pros, 'p' + (i + 1)),
                        cons: util.keyedList(c.cons, 'c' + (i + 1)),
                        tactics: util.keyedList(c.tactics, 't' + (i + 1)),
                        line: util.keyedList(c.line, 'l' + (i + 1)),
                    }));
                    // 用归一化后的分数重新格式化
                    candidates.forEach((c) => {
                        c.scoreFormatted = util.formatScore(c.score);
                        c.scoreColor = util.getScoreColor(c.score);
                    });
                    this.setData({
                        analysisCandidates: candidates,
                        openingName: res.data.openingName || '',
                        openingNameCN: res.data.openingNameCN || '',
                        ecoCode: res.data.ecoCode || '',
                    });
                }
            })
                .catch(() => { });
        }, 300);
    },
    // ===== 复盘分析（SSE流式）=====
    onToggleReview() {
        if (this.data.reviewLoading)
            return;
        // 走势图在棋盘上方，菜单打开时会隐藏，点击后先收起菜单
        this.closeMoreMenu();
        if (this.data.moveReviewCount > 0) {
            // 已有复盘数据：直接重绘走势图（closeMoreMenu 已设 showMoreMenu=false 并会按需调 drawChart，
            // 但为了防止定时器未触达的情况，再显式刷新一次）
            if (this.data.reviewDone && this.data.chartData.length >= 2) {
                this.drawChart();
            }
            return;
        }
        if (this.data.moves.length === 0) {
            util.showToast('没有走法可供分析');
            return;
        }
        this.startReview();
    },
    startReview() {
        this.setData({
            reviewLoading: true,
            reviewProgress: 0,
            reviewDone: false,
            reviewError: false,
            moveReviews: {},
            moveReviewList: [],
            moveReviewCount: 0,
            summary: null,
            reviewDetailIndex: null,
            reviewDetail: null,
            rightTab: 'review',
            chartData: [],
        });
        // 构建走法输入
        const moveInputs = [];
        const replay = new Chess.Chess();
        for (const m of this.data.moves) {
            moveInputs.push({
                uci: m.from + m.to + (m.promotion || ''),
                fenBefore: replay.fen(),
            });
            try {
                replay.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
            }
            catch (e) {
                break;
            }
        }
        const reviews = {};
        this._reviewAbort = api.reviewGameStream(moveInputs, {
            onReview: (review) => {
                // 归一化分数到玩家视角（引擎评分从「轮到走棋方」视角，每步交替）
                // 偶数下标=轮到白方走棋（评分从白方视角），奇数下标=轮到黑方走棋（评分从黑方视角）
                // 当引擎视角与玩家不一致时翻转分数
                const playerSide = this.data.playerSide;
                const needFlip = (review.index % 2 === 0 && playerSide === 'b') ||
                    (review.index % 2 === 1 && playerSide === 'w');
                if (needFlip) {
                    if (review.playedScore !== undefined)
                        review.playedScore = -review.playedScore;
                    if (review.bestScore !== undefined)
                        review.bestScore = -review.bestScore;
                }
                // 只保留玩家自己的走法结果（不分析对方走法）
                const isPlayerMove = playerSide === 'w' ? review.index % 2 === 0 : review.index % 2 === 1;
                if (!isPlayerMove)
                    return;
                reviews[review.index] = review;
                const did = this.data;
                // 更新列表
                const move = did.moves[review.index];
                const meta = CLASSIFICATION_META[review.classification] || CLASSIFICATION_META.good;
                const listItem = {
                    index: review.index,
                    san: move?.san || '',
                    ...review,
                    classIcon: meta.icon,
                    classColor: meta.color,
                    playedScoreFormatted: util.formatScore(review.playedScore),
                    bestScoreFormatted: util.formatScore(review.bestScore),
                    pros: review.pros || [],
                    cons: review.cons || [],
                    tactics: review.tactics || [],
                };
                this.setData({
                    moveReviews: { ...reviews },
                    moveReviewCount: Object.keys(reviews).length,
                    reviewProgress: review.progress || 0,
                });
                // 累加 chartData
                if (review.playedScore !== undefined) {
                    const chartData = [...did.chartData];
                    chartData.push({
                        moveNumber: review.index + 1,
                        score: review.playedScore,
                        san: move?.san || '',
                    });
                    this.setData({ chartData });
                }
            },
            onError: () => {
                this.setData({ reviewLoading: false, reviewError: true });
                util.showToast('复盘分析中断');
            },
            onDone: () => {
                const summary = this.computeSummary(reviews);
                const reviewList = this.buildReviewList(reviews);
                const phaseInfo = this.analyzePhaseHighlights();
                this.setData({
                    reviewLoading: false,
                    reviewDone: Object.keys(reviews).length > 0,
                    reviewProgress: 100,
                    summary,
                    moveReviewList: reviewList,
                    moveReviewCount: reviewList.length,
                    chartPhaseInfo: phaseInfo,
                });
                // 绘制走势图（含分阶段高亮）
                this.drawChart();
            },
        }, 10, 300);
    },
    computeSummary(reviews) {
        let best = 0, good = 0, inaccuracy = 0, mistake = 0, blunder = 0;
        Object.values(reviews).forEach((r) => {
            if (r.classification === 'best')
                best++;
            else if (r.classification === 'good')
                good++;
            else if (r.classification === 'inaccuracy')
                inaccuracy++;
            else if (r.classification === 'mistake')
                mistake++;
            else if (r.classification === 'blunder')
                blunder++;
        });
        return { best, good, inaccuracy, mistake, blunder, total: Object.keys(reviews).length };
    },
    /**
     * 检测各阶段边界（开局/中局/残局）
     * 基于走法序号 + 棋盘上非兵棋子数量综合判断
     */
    detectPhases() {
        const moves = this.data.moves;
        const total = moves.length;
        if (total === 0)
            return [];
        // 按走法遍历 FEN，统计总棋子数（不含兵）
        const replay = new Chess.Chess();
        const pieceCounts = [];
        pieceCounts.push(this._countNonPawnPieces(replay.fen()));
        for (const m of moves) {
            try {
                replay.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
                pieceCounts.push(this._countNonPawnPieces(replay.fen()));
            }
            catch {
                break;
            }
        }
        // 用最后的 pieceCounts 长度对齐 moves.length
        while (pieceCounts.length <= total)
            pieceCounts.push(pieceCounts[pieceCounts.length - 1] || 22);
        // 找残局起点：非兵棋子 ≤ 6（且与后续一致不再回升）
        let egStart = total;
        for (let i = Math.max(20, Math.floor(total * 0.3)); i < total; i++) {
            if (pieceCounts[i] <= 6) {
                egStart = i;
                break;
            }
        }
        // 找中局起点：走法序号 >= 8 且棋子消耗 >= 2，或者直接走法序号 >= 12
        let mgStart = Math.min(12, Math.max(8, Math.floor(total * 0.15)));
        for (let i = 6; i < Math.min(20, total); i++) {
            if (pieceCounts[0] - pieceCounts[i] >= 2) {
                mgStart = i;
                break;
            }
        }
        // 确保 mgStart < egStart
        if (mgStart >= egStart)
            mgStart = Math.max(6, Math.floor(egStart * 0.4));
        // 确保至少有一段区间
        const phases = [];
        if (mgStart > 0) {
            phases.push({ start: 0, end: mgStart - 1, label: 'opening', labelCN: '开局' });
        }
        if (egStart > mgStart) {
            phases.push({ start: mgStart, end: egStart - 1, label: 'middlegame', labelCN: '中局' });
        }
        if (egStart < total) {
            phases.push({ start: egStart, end: total - 1, label: 'endgame', labelCN: '残局' });
        }
        else {
            // 如果没进入残局，归入中局
            if (phases.length > 1) {
                phases[phases.length - 1].end = total - 1;
            }
        }
        return phases;
    },
    /** 统计棋盘上非兵棋子总数 */
    _countNonPawnPieces(fen) {
        try {
            const chess = new Chess.Chess(fen);
            const board = chess.board();
            let count = 0;
            for (const row of board) {
                for (const p of row) {
                    if (p && p.type !== 'p' && p.type !== 'k')
                        count++;
                }
            }
            return count;
        }
        catch {
            return 22;
        }
    },
    /**
     * 对每个阶段分析最佳/最差/转折点
     */
    analyzePhaseHighlights() {
        const chartData = this.data.chartData;
        const reviews = this.data.moveReviews;
        if (chartData.length < 2)
            return [];
        const phases = this.detectPhases();
        const result = [];
        for (const phase of phases) {
            const phaseData = chartData.filter(d => d.moveNumber - 1 >= phase.start && d.moveNumber - 1 <= phase.end);
            if (phaseData.length === 0)
                continue;
            // 最好的一步（最高分，若平局看分类）
            let bestMove = phaseData[0];
            let worstMove = phaseData[0];
            let bestIdx = phaseData[0].moveNumber - 1;
            let worstIdx = phaseData[0].moveNumber - 1;
            for (const d of phaseData) {
                const idx = d.moveNumber - 1;
                if (d.score > bestMove.score) {
                    bestMove = d;
                    bestIdx = idx;
                }
                if (d.score < worstMove.score) {
                    worstMove = d;
                    worstIdx = idx;
                }
                // 如果分数相同，看分类
                if (d.score === bestMove.score && reviews[idx]) {
                    const cls = reviews[idx].classification;
                    if (cls === 'best' && reviews[bestIdx]?.classification !== 'best') {
                        bestMove = d;
                        bestIdx = idx;
                    }
                }
                if (d.score === worstMove.score && reviews[idx]) {
                    const cls = reviews[idx].classification;
                    if ((cls === 'blunder' || cls === 'mistake') && reviews[worstIdx]?.classification !== 'blunder' && reviews[worstIdx]?.classification !== 'mistake') {
                        worstMove = d;
                        worstIdx = idx;
                    }
                }
            }
            // 转折点：只考虑用户方走的棋（避免把对方走的棋标为转折）
            // 用户方走棋的索引：playerSide='w'时偶数索引，playerSide='b'时奇数索引
            const playerSide = this.data.playerSide;
            const isPlayerMove = (idx) => (playerSide === 'w' && idx % 2 === 0) || (playerSide === 'b' && idx % 2 === 1);
            let turningPoint = chartData[0];
            let turningIdx = phase.start;
            let maxDelta = 0;
            for (let i = 1; i < chartData.length; i++) {
                const idx = chartData[i].moveNumber - 1;
                if (idx < phase.start || idx > phase.end)
                    continue;
                // 只考虑用户方走的棋
                if (!isPlayerMove(idx))
                    continue;
                const d = chartData[i];
                const prev = chartData[i - 1];
                const delta = Math.abs(d.score - prev.score);
                if (delta > maxDelta) {
                    maxDelta = delta;
                    turningPoint = d;
                    turningIdx = idx;
                }
            }
            // 构建分类标签
            const bestReview = reviews[bestIdx];
            const worstReview = reviews[worstIdx];
            result.push({
                phaseLabel: phase.labelCN,
                phaseColor: phase.label === 'opening' ? '#4ade80' : phase.label === 'middlegame' ? '#facc15' : '#f87171',
                start: phase.start,
                end: phase.end,
                best: {
                    index: bestIdx,
                    moveNumber: bestMove.moveNumber,
                    san: bestMove.san,
                    score: bestMove.score,
                    scoreFormatted: util.formatScore(bestMove.score),
                    classification: bestReview?.classification || '',
                    classIcon: CLASSIFICATION_META[bestReview?.classification]?.icon || '',
                },
                worst: {
                    index: worstIdx,
                    moveNumber: worstMove.moveNumber,
                    san: worstMove.san,
                    score: worstMove.score,
                    scoreFormatted: util.formatScore(worstMove.score),
                    classification: worstReview?.classification || '',
                    classIcon: CLASSIFICATION_META[worstReview?.classification]?.icon || '',
                },
                turningPoint: {
                    index: turningIdx,
                    moveNumber: turningPoint.moveNumber,
                    san: turningPoint.san,
                    score: turningPoint.score,
                    scoreFormatted: util.formatScore(turningPoint.score),
                    delta: maxDelta,
                },
            });
        }
        return result;
    },
    buildReviewList(reviews) {
        const list = [];
        const keys = Object.keys(reviews).map(Number).sort((a, b) => a - b);
        const playerSide = this.data.playerSide;
        let playerMoveNo = 0;
        for (const key of keys) {
            const r = reviews[key];
            const move = this.data.moves[key];
            const meta = CLASSIFICATION_META[r.classification] || CLASSIFICATION_META.good;
            playerMoveNo++;
            const bestUci = r.bestUci || '';
            list.push({
                index: r.index ?? key,
                playerMoveNumber: playerMoveNo,
                san: move?.san || '',
                ...r,
                classIcon: meta.icon,
                classColor: meta.color,
                playedScoreFormatted: util.formatScore(r.playedScore),
                bestScoreFormatted: util.formatScore(r.bestScore),
                bestUciShort: bestUci ? { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4) } : null,
                pros: r.pros || [],
                cons: r.cons || [],
                tactics: r.tactics || [],
            });
        }
        return list;
    },
    showReviewDetail(index) {
        const reviews = this.data.moveReviews;
        const review = reviews[index];
        if (!review)
            return;
        const meta = CLASSIFICATION_META[review.classification] || CLASSIFICATION_META.good;
        const bestUci = review.bestUci || '';
        this.setData({
            reviewDetailIndex: index,
            rightTab: 'review',
            reviewDetail: {
                index,
                ...review,
                meta,
                playedScoreFormatted: util.formatScore(review.playedScore),
                bestScoreFormatted: util.formatScore(review.bestScore),
                bestUciShort: bestUci ? { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4) } : null,
                pros: review.pros || [],
                cons: review.cons || [],
                tactics: review.tactics || [],
            },
        });
    },
    onCloseDetail() {
        this.setData({ reviewDetailIndex: null, reviewDetail: null });
    },
    // ===== 内容折叠 / 展开 =====
    /** 分析线收起时 canvas 不渲染，重新展开后必须重绘 */
    onToggleChartLine() {
        const expanded = !this.data.chartLineExpanded;
        this.setData({ chartLineExpanded: expanded });
        if (expanded && this.data.reviewDone && this.data.chartData.length >= 2) {
            setTimeout(() => this.drawChart(), 100);
        }
    },
    onTogglePhaseMoves() {
        this.setData({ phaseMovesExpanded: !this.data.phaseMovesExpanded });
    },
    onToggleAnalysisPanel() {
        this.setData({ panelExpanded: !this.data.panelExpanded });
    },
    // ===== 评估走势图（canvas）含分阶段高亮 =====
    drawChart(retry = 0) {
        const data = this.data.chartData;
        if (data.length < 2)
            return;
        if (this.data.chartLineExpanded === false)
            return;
        wx.createSelectorQuery()
            .select('#evalChart')
            .fields({ node: true, size: true })
            .exec((res) => {
            // 节点未就绪或尺寸为 0（刚关闭菜单/刚渲染完成）时重试几次
            if (!res || !res[0] || !res[0].node || !res[0].width || !res[0].height) {
                if (retry < 8) {
                    setTimeout(() => this.drawChart(retry + 1), 150);
                }
                return;
            }
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = (wx.getWindowInfo?.()?.pixelRatio) || (wx.getSystemInfoSync().pixelRatio) || 2;
            const width = res[0].width;
            const height = res[0].height;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            const pad = { top: 16, bottom: 20, left: 36, right: 16 };
            const chartW = width - pad.left - pad.right;
            const chartH = height - pad.top - pad.bottom;
            // 计算数据范围
            const scores = data.map(d => d.score);
            const maxScore = Math.max(3, ...scores.map(Math.abs));
            const yMax = maxScore;
            const yRange = yMax * 2;
            // 清空
            ctx.clearRect(0, 0, width, height);
            const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;
            const zeroY = pad.top + chartH * (yMax / yRange);
            // ---- 1. 分阶段背景色块 ----
            const phaseInfo = this.data.chartPhaseInfo || [];
            const phaseColors = {
                '开局': 'rgba(74, 222, 128, 0.06)',
                '中局': 'rgba(250, 204, 21, 0.06)',
                '残局': 'rgba(248, 113, 113, 0.06)',
            };
            const phaseBorderColors = {
                '开局': 'rgba(74, 222, 128, 0.2)',
                '中局': 'rgba(250, 204, 21, 0.2)',
                '残局': 'rgba(248, 113, 113, 0.2)',
            };
            for (const phase of phaseInfo) {
                const x1 = pad.left + phase.start * stepX;
                const x2 = pad.left + (phase.end + 1) * stepX;
                ctx.fillStyle = phaseColors[phase.phaseLabel] || 'rgba(255,255,255,0.03)';
                ctx.fillRect(x1, pad.top, x2 - x1, chartH);
                // 阶段分割线
                if (phase.start > 0) {
                    ctx.strokeStyle = phaseBorderColors[phase.phaseLabel] || 'rgba(255,255,255,0.1)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(x1, pad.top);
                    ctx.lineTo(x1, pad.top + chartH);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                // 阶段标签
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                const labelX = (x1 + x2) / 2;
                ctx.fillText(phase.phaseLabel, labelX, pad.top + chartH - 4);
            }
            // ---- 2. 零线 ----
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(pad.left, zeroY);
            ctx.lineTo(width - pad.right, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);
            // ---- 3. 网格线 ----
            ctx.font = '10px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.textAlign = 'right';
            for (let v = -Math.floor(maxScore); v <= Math.floor(maxScore); v++) {
                if (v === 0)
                    continue;
                const y = pad.top + chartH * ((yMax - v) / yRange);
                if (y < pad.top || y > height - pad.bottom)
                    continue;
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.moveTo(pad.left, y);
                ctx.lineTo(width - pad.right, y);
                ctx.stroke();
                ctx.fillText(v.toFixed(1), pad.left - 4, y + 3);
            }
            // ---- 4. 填充区域 ----
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = pad.left + i * stepX;
                const y = pad.top + chartH * ((yMax - d.score) / yRange);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.lineTo(pad.left + (data.length - 1) * stepX, zeroY);
            ctx.lineTo(pad.left, zeroY);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, pad.top, 0, zeroY);
            grad.addColorStop(0, 'rgba(76, 175, 80, 0.12)');
            grad.addColorStop(1, 'rgba(244, 67, 54, 0.06)');
            ctx.fillStyle = grad;
            ctx.fill();
            // ---- 5. 折线 ----
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = pad.left + i * stepX;
                const y = pad.top + chartH * ((yMax - d.score) / yRange);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.strokeStyle = '#6c63ff';
            ctx.lineWidth = 2;
            ctx.stroke();
            // ---- 6. 数据点 + 命中区域 + 高亮标记 ----
            const hitRects = [];
            const hitRadius = Math.max(12, stepX * 0.4);
            // 收集高亮索引
            const highlightIndices = new Set();
            const highlightTypes = {};
            for (const phase of phaseInfo) {
                if (phase.best && phase.best.index >= 0) {
                    highlightIndices.add(phase.best.index);
                    highlightTypes[phase.best.index] = 'best';
                }
                if (phase.worst && phase.worst.index >= 0 && phase.worst.index !== phase.best?.index) {
                    highlightIndices.add(phase.worst.index);
                    highlightTypes[phase.worst.index] = 'worst';
                }
                if (phase.turningPoint && phase.turningPoint.index >= 0) {
                    // 转折点如果与最好/最差点不同也标记
                    if (phase.turningPoint.index !== phase.best?.index && phase.turningPoint.index !== phase.worst?.index) {
                        highlightIndices.add(phase.turningPoint.index);
                        highlightTypes[phase.turningPoint.index] = 'turning';
                    }
                }
            }
            data.forEach((d, i) => {
                const x = pad.left + i * stepX;
                const y = pad.top + chartH * ((yMax - d.score) / yRange);
                const isHighlight = highlightIndices.has(i);
                const hType = highlightTypes[i];
                if (isHighlight) {
                    // 高亮点：大圆 + 外发光
                    const colorMap = {
                        best: '#4ade80',
                        worst: '#f87171',
                        turning: '#facc15',
                    };
                    const glowColor = colorMap[hType] || '#6c63ff';
                    // 外发光
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = glowColor + '33';
                    ctx.fill();
                    // 外圈
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = glowColor;
                    ctx.fill();
                    // 内点（白色小圆）
                    ctx.beginPath();
                    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                }
                else {
                    // 普通数据点
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = d.score > 0.3 ? '#4ade80' : d.score < -0.3 ? '#f87171' : '#facc15';
                    ctx.fill();
                }
                hitRects.push({
                    index: i,
                    moveNumber: d.moveNumber,
                    san: d.san,
                    score: d.score,
                    x: x - hitRadius,
                    y: y - hitRadius,
                    w: hitRadius * 2,
                    h: hitRadius * 2,
                });
            });
            // ---- 7. X 轴标签 + 在高亮数据点下标注文字 ----
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.textAlign = 'center';
            ctx.font = '10px sans-serif';
            const labelStep = Math.max(1, Math.floor(data.length / 6));
            data.forEach((d, i) => {
                const x = pad.left + i * stepX;
                if (i % labelStep !== 0 && i !== data.length - 1 && !highlightIndices.has(i))
                    return;
                ctx.fillText('#' + d.moveNumber, x, height - 2);
            });
            // 高亮点标注文字（⭐好/❌差/⚡转折）
            const hLabels = { best: '⭐佳', worst: '❌差', turning: '⚡转' };
            for (const [idx, hType] of Object.entries(highlightTypes)) {
                const i = parseInt(idx);
                const d = data[i];
                if (!d)
                    continue;
                const x = pad.left + i * stepX;
                const y = pad.top + chartH * ((yMax - d.score) / yRange);
                ctx.fillStyle = hType === 'best' ? '#4ade80' : hType === 'worst' ? '#f87171' : '#facc15';
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                const labelY = y > pad.top + chartH / 2 ? y - 12 : y + 14;
                ctx.fillText(hLabels[hType] || '', x, labelY);
            }
            // 存储命中区域供点击检索
            this.setData({ chartHitRects: hitRects });
        });
    },
    /** 点击走势图 → 定位到对应步 */
    onChartTap(e) {
        const hitRects = this.data.chartHitRects || [];
        if (hitRects.length === 0)
            return;
        // 获取点击坐标（相对于 canvas 元素）
        const detail = e.detail;
        let tapX, tapY;
        if (detail && typeof detail.x === 'number') {
            tapX = detail.x;
            tapY = detail.y;
        }
        else {
            const touches = e.touches;
            if (!touches || !touches[0])
                return;
            tapX = touches[0].x;
            tapY = touches[0].y;
        }
        // 找最近的数据点
        let bestIdx = -1;
        let bestDist = Infinity;
        for (const r of hitRects) {
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const dist = Math.hypot(tapX - cx, tapY - cy);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = r.index;
            }
        }
        if (bestIdx >= 0) {
            const moveIndex = bestIdx;
            // 计算原始走法索引：moveNumber 是 1-based，-1 得到 0-based index
            // 但要注意 chartData 是按顺序推入的，index=bestIdx 对应走法序号 bestIdx
            this.goToMove(moveIndex);
        }
    },
    /** 点击分阶段高亮摘要中的走法 → 定位到对应步 */
    onPhaseMoveTap(e) {
        const index = parseInt(e.currentTarget.dataset.index);
        if (!isNaN(index) && index >= 0) {
            this.goToMove(index);
        }
    },
    // ===== 推演模式 =====
    onToggleExploration() {
        this.closeMoreMenu();
        if (this.data.explorationMode) {
            this.onExitExploration();
            return;
        }
        // 从当前局面开始手动推演
        const chess = new Chess.Chess(this._chess.fen());
        this._exploreChess = chess;
        this.setData({
            explorationMode: 'manual',
            exploreSteps: [],
            exploreStepIndex: -1,
            selectedSquare: '',
            legalMoves: [],
        });
        util.showToast('请在棋盘上自由走子推演（可操作黑白双方）');
    },
    /** 开启自动推演（AI交替走黑白双方） */
    onStartAutoExploration() {
        this.closeMoreMenu();
        if (this.data.explorationMode === 'auto') {
            // 已处于自动推演模式，暂停/继续
            if (this.data.exploreAutoRunning) {
                this.setData({ exploreAutoPaused: true, exploreAutoRunning: false });
                this.clearExploreAutoTimer();
                util.showToast('推演已暂停');
            }
            else {
                this.setData({ exploreAutoPaused: false, exploreAutoRunning: true });
                this.autoExploreNext();
            }
            return;
        }
        if (this.data.explorationMode) {
            this.onExitExploration();
        }
        const fen = this._chess.fen();
        const chess = new Chess.Chess(fen);
        this._exploreChess = chess;
        this.setData({
            explorationMode: 'auto',
            exploreSteps: [],
            exploreStepIndex: -1,
            exploreAutoRunning: true,
            exploreAutoPaused: false,
            displayFen: fen,
            selectedSquare: '',
            legalMoves: [],
            isCheck: false,
            isCheckmate: false,
            isStalemate: false,
        });
        // 开始自动走子
        setTimeout(() => this.autoExploreNext(), 500);
    },
    /** 自动推演下一步 */
    autoExploreNext() {
        if (this.data.exploreAutoPaused || !this.data.exploreAutoRunning)
            return;
        const chess = this._exploreChess;
        if (!chess || chess.isGameOver()) {
            this.autoExplorationComplete();
            return;
        }
        const fen = chess.fen();
        const uci = localAI.getLocalAIMove(fen, 8);
        if (!uci) {
            this.autoExplorationComplete();
            return;
        }
        try {
            const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : 'q' });
            if (move) {
                const steps = [...this.data.exploreSteps, {
                        fen: chess.fen(),
                        san: move.san,
                        uci: move.from + move.to,
                    }];
                this.setData({
                    exploreSteps: steps,
                    exploreStepIndex: steps.length - 1,
                    displayFen: chess.fen(),
                    isCheck: chess.isCheck(),
                    isCheckmate: chess.isCheckmate(),
                    isStalemate: chess.isStalemate(),
                });
                if (chess.isGameOver()) {
                    this.autoExplorationComplete();
                    return;
                }
                // 继续下一步
                this._exploreAutoTimer = setTimeout(() => this.autoExploreNext(), 500);
            }
            else {
                this.autoExplorationComplete();
            }
        }
        catch (e) {
            this.autoExplorationComplete();
        }
    },
    autoExplorationComplete() {
        this.clearExploreAutoTimer();
        this.setData({ exploreAutoRunning: false });
        const chess = this._exploreChess;
        if (chess && chess.isCheckmate()) {
            util.showToast(`将杀！${chess.turn() === 'w' ? '黑方' : '白方'}胜`);
        }
        else if (chess && (chess.isStalemate() || chess.isDraw())) {
            util.showToast('和棋');
        }
        else {
            util.showToast('自动推演结束');
        }
    },
    clearExploreAutoTimer() {
        if (this._exploreAutoTimer) {
            clearTimeout(this._exploreAutoTimer);
            this._exploreAutoTimer = null;
        }
    },
    onExplorationStart(e) {
        const uci = e.detail?.uci || e.currentTarget?.dataset?.uci;
        if (uci)
            this.startExploration(uci);
    },
    onPlayContinuation(e) {
        const uci = e.detail?.uci || e.currentTarget?.dataset?.uci;
        if (uci)
            this.startExploration(uci);
    },
    /** 从候选走法开始自动续着（AI继续走完变化） */
    onAutoContinuation(e) {
        const uci = e.detail?.uci;
        if (!uci)
            return;
        if (this.data.explorationMode)
            this.onExitExploration();
        const fen = this._chess.fen();
        const chess = new Chess.Chess(fen);
        this._exploreChess = chess;
        const steps = [];
        try {
            const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : 'q' });
            if (move) {
                steps.push({ fen: chess.fen(), san: move.san, uci: move.from + move.to });
            }
        }
        catch (e) { }
        this.setData({
            explorationMode: 'auto',
            exploreSteps: steps,
            exploreStepIndex: steps.length > 0 ? 0 : -1,
            exploreAutoRunning: true,
            exploreAutoPaused: false,
            displayFen: steps.length > 0 ? steps[steps.length - 1].fen : fen,
        });
        if (steps.length > 0) {
            setTimeout(() => this.autoExploreNext(), 500);
        }
        else {
            this.autoExploreNext();
        }
    },
    startExploration(uci) {
        const fen = this._chess.fen();
        const chess = new Chess.Chess(fen);
        this._exploreChess = chess;
        const steps = [];
        if (uci) {
            try {
                const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : 'q' });
                if (move) {
                    steps.push({ fen: chess.fen(), san: move.san, uci: move.from + move.to });
                }
            }
            catch (e) { }
        }
        this.setData({
            explorationMode: 'manual',
            exploreSteps: steps,
            exploreStepIndex: steps.length > 0 ? 0 : -1,
            displayFen: steps.length > 0 ? steps[0].fen : fen,
            selectedSquare: '',
            legalMoves: [],
        });
    },
    /** 手动推演时点击棋盘格子 */
    onExploreSquareTap(e) {
        if (!this.data.explorationMode || this.data.exploreAutoRunning)
            return;
        const square = e.detail?.square;
        if (!square)
            return;
        this.handleExplorationMove(square);
    },
    handleExplorationMove(square) {
        const chess = this._exploreChess || new Chess.Chess(this._chess.fen());
        const from = this.data.selectedSquare;
        if (!from) {
            // 没有选中棋子时，点击任意棋子选中它（允许选择黑白双方）
            const piece = chess.get(square);
            if (piece) {
                const moves = chess.moves({ square, verbose: true });
                this.setData({
                    selectedSquare: square,
                    legalMoves: moves.map((m) => m.to),
                });
            }
            return;
        }
        // 已选中棋子
        if (this.data.legalMoves.includes(square)) {
            try {
                const move = chess.move({ from, to: square, promotion: 'q' });
                if (move) {
                    const steps = [...this.data.exploreSteps, {
                            fen: chess.fen(),
                            san: move.san,
                            uci: move.from + move.to,
                        }];
                    this._exploreChess = chess;
                    this.setData({
                        exploreSteps: steps,
                        exploreStepIndex: steps.length - 1,
                        displayFen: chess.fen(),
                        selectedSquare: '',
                        legalMoves: [],
                        isCheck: chess.isCheck(),
                        isCheckmate: chess.isCheckmate(),
                        isStalemate: chess.isStalemate(),
                    });
                }
            }
            catch (e) { }
        }
        else {
            // 点击其他棋子切换选中
            const piece = chess.get(square);
            if (piece) {
                const moves = chess.moves({ square, verbose: true });
                this.setData({
                    selectedSquare: square,
                    legalMoves: moves.map((m) => m.to),
                });
            }
            else {
                this.setData({ selectedSquare: '', legalMoves: [] });
            }
        }
    },
    onExplorePrev() {
        const idx = this.data.exploreStepIndex;
        if (idx <= 0)
            return;
        this.exploreGoTo(idx - 1);
    },
    onExploreNext() {
        const steps = this.data.exploreSteps;
        const idx = this.data.exploreStepIndex;
        if (idx >= steps.length - 1)
            return;
        this.exploreGoTo(idx + 1);
    },
    exploreGoTo(index) {
        const steps = this.data.exploreSteps;
        if (index < 0 || index >= steps.length)
            return;
        // 从steps[index]获取fen时，需要重新创建chess实例来获取isCheck等信息
        const fen = steps[index].fen;
        try {
            const chess = new Chess.Chess(fen);
            this.setData({
                exploreStepIndex: index,
                displayFen: fen,
                isCheck: chess.isCheck(),
                isCheckmate: chess.isCheckmate(),
                isStalemate: chess.isStalemate(),
                selectedSquare: '',
                legalMoves: [],
            });
        }
        catch (e) {
            this.setData({ exploreStepIndex: index, displayFen: fen });
        }
    },
    onExitExploration() {
        this.clearExploreAutoTimer();
        this._exploreChess = null;
        this.setData({
            explorationMode: '',
            exploreSteps: [],
            exploreStepIndex: -1,
            exploreAutoRunning: false,
            exploreAutoPaused: false,
            displayFen: this.data.fen,
            selectedSquare: '',
            legalMoves: [],
        });
    },
    // ===== AI 局面分析弹窗 =====
    onShowAiAnalysis() {
        this.closeMoreMenu();
        this.setData({ showAiAnalysis: true, aiAnalysisLoading: true, aiAnalysisText: '' });
        const fen = this._chess.fen();
        api.getDetailedAnalysis(fen, 12, 3)
            .then((res) => {
            const text = res?.data?.detailedAnalysis || res?.data || '暂无分析';
            this.setData({ aiAnalysisText: text, aiAnalysisLoading: false });
        })
            .catch((err) => {
            this.setData({
                aiAnalysisText: '分析失败: ' + (err.message || ''),
                aiAnalysisLoading: false,
            });
        });
    },
    onHideAiAnalysis() {
        this.setData({ showAiAnalysis: false });
    },
    // ===== 右侧 Tab =====
    onRightTabSwitch(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ rightTab: tab });
    },
    onMoreTap() {
        if (this.data.showMoreMenu) {
            this.closeMoreMenu();
            return;
        }
        this.setData({ showMoreMenu: true });
    },
    /**
     * 收起右上角下拉菜单
     * 走势图 canvas 在菜单打开时不渲染（wx:if），菜单关闭后需要重绘
     */
    closeMoreMenu(redrawDelay = 300) {
        if (!this.data.showMoreMenu)
            return;
        this.setData({ showMoreMenu: false });
        if (this.data.reviewDone && this.data.chartData.length >= 2) {
            setTimeout(() => this.drawChart(), redrawDelay);
        }
    },
    stopPropagation() { },
    /** 根据全局权限状态更新功能可见性 */
    updatePermissionUI() {
        const app = getApp();
        const perms = app.globalData.permissions;
        const videoGenerationEnabled = perms ? perms.videoGenerationEnabled !== false : true;
        this.setData({ showVideoGeneration: videoGenerationEnabled });
    },
    /** 打开视频生成弹窗 */
    onShowVideoModal() {
        this.closeMoreMenu();
        this.setData({ showVideoModal: true, videoGenerating: false, videoStatus: '' });
    },
    /** 关闭视频生成弹窗 */
    onHideVideoModal() {
        this.setData({ showVideoModal: false });
    },
    /** 开始生成讲解视频 */
    onGenerateVideo() {
        const recordId = this.data.recordId;
        const gameId = this.data.gameId;
        if (!recordId && !gameId) {
            wx.showToast({ title: '该对局不支持生成视频', icon: 'none' });
            return;
        }
        this.setData({ videoGenerating: true, videoStatus: '正在准备素材...' });
        api.generateGameVideo({ recordId, gameId }).then((res) => {
            const taskId = res?.data?.taskId || res?.taskId;
            if (taskId) {
                this.setData({ videoStatus: '任务已提交，视频生成可能需要 2-5 分钟' });
                wx.showToast({ title: '视频生成任务已提交', icon: 'success' });
                setTimeout(() => this.setData({ showVideoModal: false }), 2000);
            }
            else {
                this.setData({ videoGenerating: false, videoStatus: '生成失败，请重试' });
            }
        }).catch((err) => {
            this.setData({ videoGenerating: false, videoStatus: err?.message || '生成失败' });
        });
    },
    /** 打开分享弹窗 */
    onShowShare() {
        this.closeMoreMenu();
        const gameId = this.data.gameId;
        const recordId = this.data.recordId;
        let link = '';
        if (gameId) {
            link = (api.getBaseUrl?.() || '') + '/analysis?gameId=' + gameId;
        }
        else if (recordId) {
            link = (api.getBaseUrl?.() || '') + '/analysis?recordId=' + recordId;
        }
        else {
            link = '当前对局（仅本地可查看）';
        }
        this.setData({ showShareModal: true, shareLink: link });
    },
    /** 关闭分享弹窗 */
    onHideShare() {
        this.setData({ showShareModal: false });
    },
    /** 复制分享链接 */
    onCopyShareLink() {
        const link = this.data.shareLink;
        if (link && link.startsWith('http')) {
            wx.setClipboardData({
                data: link,
                success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
            });
        }
        else {
            wx.showToast({ title: '无法复制该链接', icon: 'none' });
        }
    },
});

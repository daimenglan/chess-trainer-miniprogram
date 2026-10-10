"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 分析面板组件
 * 显示：评估条、开局名称、候选走法列表、详细分析、推演模式
 */
const util = require('../../utils/util');
const api = require('../../utils/api');
const chessNotation = require('../../utils/chessNotation');
Component({
    properties: {
        gameStarted: {
            type: Boolean,
            value: false,
        },
        gameOver: {
            type: Boolean,
            value: false,
        },
        fen: {
            type: String,
            value: '',
        },
        analysis: {
            type: Array,
            value: [],
        },
        analysisError: {
            type: String,
            value: '',
        },
        openingName: {
            type: String,
            value: '',
        },
        openingNameCN: {
            type: String,
            value: '',
        },
        ecoCode: {
            type: String,
            value: '',
        },
        commentary: {
            type: String,
            value: '',
        },
        commentaryLoading: {
            type: Boolean,
            value: false,
        },
        exploration: {
            type: String,
            value: '',
        },
        isAIThinking: {
            type: Boolean,
            value: false,
        },
        showHints: {
            type: Boolean,
            value: false,
        },
        analysisDepth: {
            type: Number,
            value: 10,
        },
        playerSide: {
            type: String,
            value: 'w',
        },
        turn: {
            type: String,
            value: 'w',
        },
        /** 手动推演的基准评分（白方视角），用于计算「比推演前」赚亏 */
        baselineEval: {
            type: Number,
            value: 0,
        },
        /** 候选卡片上的「推演 / 自动」按钮：页面没有推演能力时传 false 隐藏 */
        showActions: {
            type: Boolean,
            value: true,
        },
    },
    data: {
        evaluation: 0,
        evaluationFormatted: '0.00',
        evaluationBarLeftWidth: 0,
        evaluationBarRightWidth: 0,
        evaluationSubText: '',
        candidates: [],
        selectedRank: 1,
        selectedCandidate: null,
        openingEntry: null,
        openingLoading: false,
        openingError: '',
        showOpeningModal: false,
        baselineDelta: 0,
    },
    observers: {
        'analysis, turn, playerSide, fen': function (analysis) {
            if (analysis && analysis.length > 0) {
                // 父页面已把候选分数归一化到玩家视角，这里直接使用
                const ev = analysis[0].score;
                // WXML 不能调用 JS 函数，评分/颜色全部在 JS 侧预格式化。
                // 注意：pros/cons/tactics/line 已在父页面（index）通过 keyedList 格式化
                // 为 [{key, text}] 结构，这里不再重复处理。
                const candidates = analysis.map((c, i) => {
                    const { pieceName, san } = chessNotation.describeMove(this.properties.fen, c.uci);
                    const sanNote = san.includes('-') ? '' : `（${san}）`;
                    // 续着 line 需要从 continuation 实时转换（父页面可能只传了第一条）
                    const line = c.line && c.line.length > 0
                        ? c.line
                        : util.keyedList(chessNotation.uciToSanLine(this.properties.fen, [c.uci, ...(c.continuation || [])]), 'l' + (i + 1));
                    return {
                        ...c,
                        rank: i + 1,
                        scoreFormatted: c.scoreFormatted || util.formatScore(c.score),
                        scoreColor: c.scoreColor || util.getScoreColor(c.score),
                        label: `${pieceName} ${c.uci.slice(0, 2)}→${c.uci.slice(2, 4)}${sanNote}`,
                        pros: c.pros || [],
                        cons: c.cons || [],
                        tactics: c.tactics || [],
                        line,
                    };
                });
                // 双向评估条：左半「对方优势」红色、右半「己方优势」绿色，±10 兵为满格（同网页版 AnalysisPanel）
                const leftWidth = Math.min(Math.abs(Math.min(ev, 0)) / 10 * 100, 100);
                const rightWidth = Math.min(Math.max(ev, 0) / 10 * 100, 100);
                const sideToMove = (this.properties.fen || '').split(' ')[1] === 'b' ? '黑方' : '白方';
                // 手动推演：计算比推演前赚亏（当前评分 − 基准评分，己方视角）
                let baselineDelta = 0;
                if (this.properties.exploration === 'manual' && this.properties.baselineEval != null && this.properties.baselineEval !== 0) {
                    const playerSide = this.properties.playerSide === 'b' ? 'b' : 'w';
                    const toPlayer = (v) => playerSide === 'b' ? -v : v;
                    baselineDelta = toPlayer(ev) - toPlayer(this.properties.baselineEval);
                }
                // 新局面分析到达：默认选中首选走法（1/2/3 切换查看详情）
                this.setData({
                    evaluation: ev,
                    evaluationFormatted: util.formatScore(ev),
                    evaluationBarLeftWidth: leftWidth,
                    evaluationBarRightWidth: rightWidth,
                    evaluationSubText: `${sideToMove}走棋 · ${util.getPlayerEvalText(ev)}`,
                    candidates,
                    selectedRank: 1,
                    selectedCandidate: candidates[0] || null,
                    baselineDelta,
                });
            }
            else {
                // 分析结果已清空（走子后）：评估条同步归零，避免残留上一步的评分
                const sideToMove = (this.properties.fen || '').split(' ')[1] === 'b' ? '黑方' : '白方';
                this.setData({
                    candidates: [],
                    selectedRank: 1,
                    selectedCandidate: null,
                    evaluation: 0,
                    evaluationFormatted: '0.00',
                    evaluationBarLeftWidth: 0,
                    evaluationBarRightWidth: 0,
                    evaluationSubText: `${sideToMove}走棋 · 均势`,
                    baselineDelta: 0,
                });
            }
        },
    },
    methods: {
        /**
         * 选中指定编号的候选走法（1/2/3），面板显示其分析内容
         */
        selectCandidate(rank) {
            const candidates = this.data.candidates || [];
            const target = candidates.find((c) => c.rank === rank) || candidates[0] || null;
            this.setData({
                selectedRank: target ? target.rank : 1,
                selectedCandidate: target,
            });
        },
        /**
         * 兼容旧调用（棋盘候选标记点击）：现在等价于选中该编号
         */
        scrollToCandidate(rank) {
            this.selectCandidate(rank);
        },
        /**
         * 点击 1/2/3 编号切换显示对应走法的分析内容
         */
        onSelectCandidateTab(e) {
            const rank = parseInt(e.currentTarget.dataset.rank, 10);
            if (!isNaN(rank))
                this.selectCandidate(rank);
        },
        /**
         * 触发推演
         */
        onExplorationStart(e) {
            const uci = e.currentTarget.dataset.uci;
            this.triggerEvent('startexploration', { uci });
        },
        /**
         * 触发自动续着推演（AI自动走完变化）
         */
        onAutoContinuation(e) {
            const uci = e.currentTarget.dataset.uci;
            this.triggerEvent('autocontinuation', { uci });
        },
        /**
         * 触发续着推演
         */
        onPlayContinuation(e) {
            const uci = e.currentTarget.dataset.uci;
            this.triggerEvent('playcontinuation', { uci });
        },
        onShowOpening() {
            this.setData({ showOpeningModal: true, openingLoading: true, openingError: '', openingEntry: null });
            const ecoCode = this.properties.ecoCode;
            const openingName = this.properties.openingName;
            if (ecoCode && openingName) {
                api.getOpeningEncyclopedia({ ecoCode, openingName }).then((res) => {
                    this.setData({ openingEntry: res?.data || res || null, openingLoading: false });
                }).catch((err) => {
                    this.setData({ openingError: err?.message || '加载失败', openingLoading: false });
                });
            }
            else {
                this.setData({ openingLoading: false });
            }
        },
        onCloseOpening() {
            this.setData({ showOpeningModal: false });
        },
        stopPropagation() { },
        /**
         * 格式化评分
         */
        formatScore(score) {
            return util.formatScore(score);
        },
        getScoreColor(score) {
            return util.getScoreColor(score);
        },
    },
});

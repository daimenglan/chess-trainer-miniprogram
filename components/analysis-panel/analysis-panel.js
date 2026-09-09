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
    },
    data: {
        evaluation: 0,
        evaluationFormatted: '0.00',
        evaluationBarWidth: 50,
        evaluationText: '均势',
        candidates: [],
        showOpeningModal: false,
        scrollTarget: '',
    },
    observers: {
        'analysis': function (analysis) {
            if (analysis && analysis.length > 0) {
                const ev = analysis[0].score;
                // 归一化到 -5..5 范围
                const clamped = Math.max(-5, Math.min(5, ev));
                const barWidth = 50 + (clamped / 5) * 50;
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
                this.setData({
                    evaluation: ev,
                    evaluationFormatted: util.formatScore(ev),
                    evaluationBarWidth: Math.max(5, Math.min(95, barWidth)),
                    evaluationText: util.getScoreLabel(ev),
                    candidates,
                });
            }
            else {
                this.setData({ candidates: [] });
            }
        },
    },
    methods: {
        /**
         * 滚动到指定候选走法
         */
        scrollToCandidate(rank) {
            this.setData({ scrollTarget: 'candidate-' + rank });
            setTimeout(() => {
                this.setData({ scrollTarget: '' });
            }, 500);
        },
        /**
         * 触发推演
         */
        onExplorationStart(e) {
            const uci = e.currentTarget.dataset.uci;
            this.triggerEvent('startexploration', { uci });
        },
        /**
         * 触发续着推演
         */
        onPlayContinuation(e) {
            const uci = e.currentTarget.dataset.uci;
            this.triggerEvent('playcontinuation', { uci });
        },
        /**
         * 切换提示开关（转发到父页面）
         */
        onToggleHints() {
            this.triggerEvent('togglehints', {});
        },
        onShowOpening() {
            this.setData({ showOpeningModal: true });
        },
        onCloseOpening() {
            this.setData({ showOpeningModal: false });
        },
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

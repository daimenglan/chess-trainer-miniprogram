"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 对局分析/复盘页
 */
const Chess = require('../utils/chessjs');
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    data: {
        game: null,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        moveReviews: {},
        currentMoveIndex: -1,
        totalMoves: 0,
        isAnalyzing: false,
        analysisProgress: 0,
        analysisDone: false,
        // 分析结果汇总
        summary: null,
        // 棋盘
        flipped: false,
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
    },
    _chess: null,
    _reviewAbort: null,
    onLoad(options) {
        if (options.game) {
            try {
                const game = JSON.parse(decodeURIComponent(options.game));
                this.setData({ game });
                this.loadPGN(game.pgn);
            }
            catch (e) {
                wx.showToast({ title: '加载对局失败', icon: 'none' });
            }
        }
    },
    loadPGN(pgn) {
        if (!pgn)
            return;
        try {
            this._chess = new Chess.Chess();
            this._chess.loadPgn(pgn);
            const moves = this._chess.history({ verbose: true });
            this._chess.reset();
            this.setData({
                moves,
                totalMoves: moves.length,
                currentMoveIndex: -1,
                fen: this._chess.fen(),
            });
        }
        catch (e) {
            wx.showToast({ title: 'PGN解析失败', icon: 'none' });
        }
    },
    startReview() {
        if (this.data.isAnalyzing || this.data.moves.length === 0)
            return;
        this.setData({
            isAnalyzing: true,
            analysisProgress: 0,
            analysisDone: false,
            moveReviews: {},
        });
        // 构建走法输入：每步的 UCI 和走子前 FEN
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
        // SSE 流式复盘：逐条接收每步分析结果
        const sse = require('../../utils/sse');
        const reviews = {};
        this._reviewAbort = sse.createSSERequest('/api/analyze/review', {
            moveHistory: moveInputs, depth: 10, movetime: 300,
        }, {
            onEvent: (evt) => {
                if (evt.type === 'review' && evt.data) {
                    reviews[evt.data.index] = evt.data;
                    this.setData({
                        moveReviews: { ...reviews },
                        analysisProgress: evt.progress || 0,
                    });
                }
            },
            onError: () => {
                util.showToast('复盘分析中断');
                this.setData({ isAnalyzing: false });
            },
            onDone: () => {
                this.setData({
                    isAnalyzing: false,
                    analysisDone: Object.keys(reviews).length > 0,
                    analysisProgress: 100,
                    summary: this.computeSummary(reviews),
                });
            },
        });
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
        this.setData({
            currentMoveIndex: index,
            fen: this._chess.fen(),
            isCheck: this._chess.isCheck(),
            isCheckmate: this._chess.isCheckmate(),
            isStalemate: this._chess.isStalemate(),
        });
    },
    onGoToMove(e) {
        const index = e.detail?.index;
        if (index !== undefined)
            this.goToMove(index);
    },
    goToPrevious() {
        if (this.data.currentMoveIndex >= 0) {
            this.goToMove(this.data.currentMoveIndex - 1);
        }
    },
    goToNext() {
        if (this.data.currentMoveIndex < this.data.moves.length - 1) {
            this.goToMove(this.data.currentMoveIndex + 1);
        }
    },
    onFlip() {
        this.setData({ flipped: !this.data.flipped });
    },
    goBack() {
        wx.navigateBack();
    },
});

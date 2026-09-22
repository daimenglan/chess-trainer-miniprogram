"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 棋谱回放页
 */
const Chess = require('../../utils/chessjs');
const notation = require('../../utils/chessNotation');
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
        record: null,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        currentMoveIndex: -1,
        totalMoves: 0,
        flipped: false,
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        lastMoveFrom: '',
        lastMoveTo: '',
        recordId: null,
    },
    _chess: null,
    onLoad(options) {
        this._syncTheme();
        // 优先使用 globalData 传递的完整数据
        let record = null;
        try {
            const app = getApp();
            if (app.globalData._analysisGame) {
                record = app.globalData._analysisGame;
                app.globalData._analysisGame = null;
            }
        }
        catch { }
        if (!record && options.record) {
            try {
                record = JSON.parse(decodeURIComponent(options.record));
            }
            catch (e) { }
        }
        if (record) {
            this.setData({ record });
            if (record.recordId)
                this.data.recordId = record.recordId;
            this.loadPGN(record.pgn);
        }
    },
    loadPGN(pgn) {
        if (!pgn)
            return;
        const cleanPgn = notation.normalizePgn(pgn);
        if (!cleanPgn)
            return;
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
            console.error('[RecordDetail] PGN parse error:', parseError, 'PGN first 200:', pgn.substring(0, 200));
            this._chess = new Chess.Chess();
            this.setData({
                moves: [],
                totalMoves: 0,
                currentMoveIndex: -1,
                fen: this._chess.fen(),
            });
            wx.showToast({ title: 'PGN解析失败', icon: 'none' });
            return;
        }
        const moves = this._chess.history({ verbose: true });
        // 重置到初始位置
        this._chess.reset();
        this.setData({
            moves,
            totalMoves: moves.length,
            currentMoveIndex: -1,
            fen: this._chess.fen(),
        });
    },
    goToStart() {
        this._chess.reset();
        this.setData({
            currentMoveIndex: -1,
            fen: this._chess.fen(),
            isCheck: false,
            isCheckmate: false,
            isStalemate: false,
            lastMoveFrom: '',
            lastMoveTo: '',
        });
    },
    goBack() {
        if (this.data.currentMoveIndex < 0)
            return;
        this._chess.undo();
        this.setData({
            currentMoveIndex: this.data.currentMoveIndex - 1,
            fen: this._chess.fen(),
            isCheck: this._chess.isCheck(),
            isCheckmate: this._chess.isCheckmate(),
            isStalemate: this._chess.isStalemate(),
        });
        this.updateLastMove();
    },
    goForward() {
        const idx = this.data.currentMoveIndex + 1;
        if (idx >= this.data.moves.length)
            return;
        const move = this.data.moves[idx];
        try {
            this._chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
            this.setData({
                currentMoveIndex: idx,
                fen: this._chess.fen(),
                isCheck: this._chess.isCheck(),
                isCheckmate: this._chess.isCheckmate(),
                isStalemate: this._chess.isStalemate(),
                lastMoveFrom: move.from,
                lastMoveTo: move.to,
            });
        }
        catch (e) { }
    },
    goToEnd() {
        const moves = this.data.moves;
        if (moves.length === 0)
            return;
        this.goToMove(moves.length - 1);
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
        const lastMove = this.data.moves[index];
        this.setData({
            currentMoveIndex: index,
            fen: this._chess.fen(),
            isCheck: this._chess.isCheck(),
            isCheckmate: this._chess.isCheckmate(),
            isStalemate: this._chess.isStalemate(),
            lastMoveFrom: lastMove?.from || '',
            lastMoveTo: lastMove?.to || '',
        });
    },
    onGoToMove(e) {
        const index = e.detail?.index;
        if (index !== undefined) {
            this.goToMove(index);
        }
    },
    updateLastMove() {
        const history = this._chess.history({ verbose: true });
        if (history.length > 0) {
            const last = history[history.length - 1];
            this.setData({ lastMoveFrom: last.from, lastMoveTo: last.to });
        }
        else {
            this.setData({ lastMoveFrom: '', lastMoveTo: '' });
        }
    },
    onFlip() {
        this.setData({ flipped: !this.data.flipped });
    },
    goBackToRecords() {
        util.navigateBackSafe('/pages/records/records');
    },
    /**
     * 跳转到完整分析/复盘页
     */
    onAnalysis() {
        const record = this.data.record;
        if (record) {
            // 通过 globalData 传递完整数据避免 URL 截断
            const app = getApp();
            app.globalData._analysisGame = record;
            wx.navigateTo({
                url: `/pages/analysis/analysis`,
            });
        }
    },
    stopPropagation() { },
});

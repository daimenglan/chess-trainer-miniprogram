"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 棋谱回放页
 */
const Chess = require('../utils/chessjs');
Page({
    data: {
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
    },
    _chess: null,
    onLoad(options) {
        if (options.record) {
            try {
                const record = JSON.parse(decodeURIComponent(options.record));
                this.setData({ record });
                this.loadPGN(record.pgn);
            }
            catch (e) {
                wx.showToast({ title: '加载棋谱失败', icon: 'none' });
            }
        }
    },
    loadPGN(pgn) {
        if (!pgn)
            return;
        try {
            const Chess = require('../utils/chessjs');
            this._chess = new Chess.Chess();
            // 加载PGN
            this._chess.loadPgn(pgn);
            const moves = this._chess.history({ verbose: true });
            // 重置到初始位置
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
        wx.navigateBack();
    },
});

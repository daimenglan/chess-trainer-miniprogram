"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 竞赛对弈页 - 使用真实 chess-board 组件
 *
 * 功能：
 * - 加载竞赛对局详情
 * - 真实棋盘走子（复用 chess-board 组件）
 * - 提交走子到服务端
 * - 显示对手信息、时间控制、当前轮次
 * - 跳转到排行榜/轮次视图
 */
const Chess = require('../../../utils/chessjs');
const app = getApp();
const api = require('../../../utils/api');
const util = require('../../../utils/util');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        matchId: '',
        match: null,
        competition: null,
        loading: true,
        // 棋盘状态
        fen: '',
        turn: 'w',
        playerSide: 'w',
        selectedSquare: '',
        legalMoves: [],
        lastMoveFrom: '',
        lastMoveTo: '',
        isCheck: false,
        gameOver: false,
        resultLabel: '',
        // 棋子走法历史（用于提交）
        moveHistory: [],
        _chess: null,
        // 视图切换
        viewMode: 'board', // board | standings | rounds
        standings: [],
        rounds: [],
    },
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    onLoad(e) {
        this._syncTheme();
        const matchId = e.matchId || e.id || '';
        this.setData({ matchId });
        if (!util.requireLogin('赛事对局')) {
            return;
        }
        this.loadMatch();
    },
    async loadMatch() {
        this.setData({ loading: true });
        try {
            const res = await api.getCompetitionMatch(this.data.matchId);
            const data = res?.data || res;
            if (!data) {
                this.setData({ loading: false });
                return;
            }
            // 用 chess.js 解析 FEN
            const fen = data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            let chess;
            try {
                chess = new Chess.Chess(fen);
            }
            catch {
                chess = new Chess.Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            }
            const playerSide = data.myColor || (data.whiteUserId === app.globalData.user?.userId ? 'w' : 'b');
            const isPlayerTurn = chess.turn() === playerSide;
            this.setData({
                match: data,
                fen,
                turn: chess.turn(),
                playerSide,
                isCheck: chess.isCheck(),
                gameOver: data.status === 'finished',
                resultLabel: this._resultLabel(data),
                moveHistory: data.moveHistory || [],
                _chess: chess,
                loading: false,
            });
        }
        catch {
            this.setData({ loading: false });
        }
    },
    _resultLabel(match) {
        if (match.status === 'finished') {
            if (match.result === '1-0')
                return '白方胜';
            if (match.result === '0-1')
                return '黑方胜';
            if (match.result === '1/2-1/2')
                return '和棋';
            return '已结束';
        }
        return '进行中';
    },
    /** 棋盘点击 */
    onSquareTap(e) {
        if (this.data.gameOver)
            return;
        const square = e.detail.square;
        const chess = this.data._chess;
        if (!chess)
            return;
        // 取消选中
        if (this.data.selectedSquare === square) {
            this.setData({ selectedSquare: '', legalMoves: [] });
            return;
        }
        // 走子
        if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
            this.submitMove(this.data.selectedSquare, square);
            return;
        }
        // 选中己方棋子
        const piece = chess.get(square);
        const playerColor = this.data.playerSide;
        if (piece && piece.color === playerColor) {
            const moves = chess.moves({ square, verbose: true });
            this.setData({
                selectedSquare: square,
                legalMoves: moves.map((m) => m.to),
            });
        }
    },
    /** 提交走子 */
    async submitMove(from, to) {
        const uci = from + to;
        this.setData({ selectedSquare: '', legalMoves: [] });
        try {
            // 本地乐观更新
            const chess = this.data._chess;
            let promotion = '';
            const piece = chess.get(from);
            if (piece && piece.type === 'p' && (to[1] === '1' || to[1] === '8')) {
                promotion = 'q';
            }
            const move = chess.move({ from, to, promotion });
            if (!move) {
                util.showToast('非法走法', 'none');
                return;
            }
            this.setData({
                fen: chess.fen(),
                turn: chess.turn(),
                isCheck: chess.isCheck(),
                lastMoveFrom: from,
                lastMoveTo: to,
                moveHistory: [...this.data.moveHistory, move],
            });
            // 提交到服务端
            const fullUci = uci + promotion;
            await api.submitCompetitionMove(this.data.matchId, fullUci);
        }
        catch (err) {
            util.showToast(err.message || '走子失败', 'none');
            // 回滚
            this.loadMatch();
        }
    },
    /** 切换到排行榜视图 */
    async onShowStandings() {
        if (this.data.standings.length > 0) {
            this.setData({ viewMode: 'standings' });
            return;
        }
        try {
            const res = await api.getCompetitionStandings(this.data.match?.competitionId);
            const data = res?.data || res;
            this.setData({ standings: data?.standings || data || [], viewMode: 'standings' });
        }
        catch {
            util.showToast('加载排行榜失败', 'none');
        }
    },
    /** 切换到轮次视图 */
    async onShowRounds() {
        if (this.data.rounds.length > 0) {
            this.setData({ viewMode: 'rounds' });
            return;
        }
        try {
            const res = await api.getCompetitionRounds(this.data.match?.competitionId);
            const data = res?.data || res;
            this.setData({ rounds: data?.rounds || data || [], viewMode: 'rounds' });
        }
        catch {
            util.showToast('加载轮次失败', 'none');
        }
    },
    /** 返回棋盘 */
    onBackToBoard() {
        this.setData({ viewMode: 'board' });
    },
    onBack() {
        if (this.data.viewMode !== 'board') {
            this.setData({ viewMode: 'board' });
            return;
        }
        wx.navigateBack();
    },
    stopPropagation() { },
});

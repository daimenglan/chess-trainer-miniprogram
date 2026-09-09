"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 在线对弈页（PvP 人人对弈）
 * 四态：idle → matching → playing → finished
 * 通过 WebSocket 与服务端通信，走子由服务端权威验证后广播同步。
 */
const app = getApp();
const Chess = require('../../utils/chessjs');
const wsClient = require('../../utils/ws').default;
const FILES = 'abcdefgh';
const RANKS = '87654321';
Page({
    data: {
        status: 'idle', // idle | matching | playing | finished
        waitingSeconds: 0,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        isCheck: false,
        isMyTurn: false,
        gameOver: false,
        flipped: false,
        selectedSquare: '',
        legalMoves: [],
        showPromotion: false,
        myColor: 'w',
        opponentColor: 'b',
        myName: '',
        opponentName: '',
        myTime: 600,
        opponentTime: 600,
        canOfferDraw: false,
        canTakeback: false,
        showConfirm: false,
        confirmTitle: '',
        confirmDesc: '',
        confirmAction: '',
        confirmMatchId: '',
        showGameOver: false,
        gameOverIcon: '',
        gameOverTitle: '',
        gameOverDesc: '',
        statusMessage: '',
        statusToastType: 'info',
    },
    // 内部状态
    _matchId: '',
    _chess: null,
    _pendingTimer: null,
    _unsubs: [],
    _promotionFrom: '',
    _promotionTo: '',
    onLoad() {
        if (!app.globalData.token) {
            wx.redirectTo({ url: '/pages/login/login' });
            return;
        }
        this.setData({
            myName: app.globalData.user?.username || '我',
        });
    },
    onShow() {
        this._setupWs();
    },
    onHide() {
        this._cleanupWs();
    },
    onUnload() {
        this._cleanupWs();
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
    },
    _setupWs() {
        this._cleanupWs();
        const unsubs = [];
        const ws = wsClient;
        // 自动连接
        if (ws.status === 'idle' || ws.status === 'disconnected') {
            ws.connect();
        }
        unsubs.push(ws.on('match:found', (p) => this._onMatchFound(p)));
        unsubs.push(ws.on('match:cancelled', () => this._onMatchCancelled()));
        unsubs.push(ws.on('match:waiting', () => this._onMatchWaiting()));
        unsubs.push(ws.on('game:move', (p) => this._onGameMove(p)));
        unsubs.push(ws.on('game:over', (p) => this._onGameOver(p)));
        unsubs.push(ws.on('game:timer', (p) => this._onGameTimer(p)));
        unsubs.push(ws.on('game:draw_offered', (p) => this._onDrawOffered(p)));
        unsubs.push(ws.on('game:draw_declined', () => this._onDrawDeclined()));
        unsubs.push(ws.on('game:takeback_requested', (p) => this._onTakebackRequested(p)));
        unsubs.push(ws.on('game:takeback_declined', () => this._onTakebackDeclined()));
        unsubs.push(ws.on('game:sync', (p) => this._onGameSync(p)));
        unsubs.push(ws.on('game:opponent_disconnected', () => this._onOpponentDisconnected()));
        unsubs.push(ws.on('game:opponent_reconnected', () => this._onOpponentReconnected()));
        unsubs.push(ws.on('game:error', (p) => this._showToast(p.message || '操作失败', 'warn')));
        this._unsubs = unsubs;
    },
    _cleanupWs() {
        for (const fn of this._unsubs)
            fn();
        this._unsubs = [];
    },
    // ===== 匹配 =====
    onJoinMatch() {
        this.setData({
            status: 'matching',
            waitingSeconds: 0,
        });
        if (this._pendingTimer)
            clearInterval(this._pendingTimer);
        this._pendingTimer = setInterval(() => {
            this.setData({ waitingSeconds: this.data.waitingSeconds + 1 });
        }, 1000);
        wsClient.send('match:join');
    },
    onCancelMatch() {
        wsClient.send('match:cancel');
        this.setData({ status: 'idle' });
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
    },
    _onMatchWaiting() {
        // 继续等待（已有等待动画）
    },
    _onMatchCancelled() {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        this.setData({ status: 'idle' });
    },
    _onMatchFound(payload) {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        const match = payload.match;
        if (!match)
            return;
        this._matchId = match.matchId;
        // userId 优先使用 wsClient 中从 JWT 解码的值，再 fallback 到 app.globalData.user
        const userId = wsClient.userId || app.globalData.user?.userId;
        const isWhite = match.whitePlayer?.userId === userId;
        const myColor = isWhite ? 'w' : 'b';
        const opponentName = isWhite ? match.blackPlayer?.username : match.whitePlayer?.username;
        this._chess = new Chess.Chess(match.currentFen || undefined);
        this.setData({
            status: 'playing',
            matchId: match.matchId,
            myColor,
            opponentColor: myColor === 'w' ? 'b' : 'w',
            opponentName: opponentName || '对手',
            fen: this._chess.fen(),
            isMyTurn: myColor === 'w',
            myTime: match.timerState?.whiteTime ?? 600,
            opponentTime: match.timerState?.blackTime ?? 600,
            canOfferDraw: true,
            canTakeback: true,
            gameOver: false,
            selectedSquare: '',
            legalMoves: [],
            flipped: myColor === 'b',
        });
    },
    // ===== 走子 =====
    onSquareTap(e) {
        if (!this.data.isMyTurn || this.data.gameOver)
            return;
        const square = e.detail.square;
        const chess = this._chess;
        if (!chess)
            return;
        // 取消选中
        if (this.data.selectedSquare === square) {
            this.setData({ selectedSquare: '', legalMoves: [] });
            return;
        }
        // 走子
        if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
            this._tryMove(this.data.selectedSquare, square);
            return;
        }
        // 选中己方棋子
        const piece = chess.get(square);
        if (piece && piece.color === this.data.myColor) {
            const moves = chess.moves({ square, verbose: true });
            this.setData({
                selectedSquare: square,
                legalMoves: moves.map((m) => m.to),
            });
        }
    },
    _tryMove(from, to, promotion = 'q') {
        const chess = this._chess;
        const piece = chess.get(from);
        // 检查升变
        if (piece && piece.type === 'p') {
            const targetRank = to[1];
            if ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1')) {
                this._promotionFrom = from;
                this._promotionTo = to;
                this.setData({ showPromotion: true });
                return;
            }
        }
        this._doMove(from, to, promotion);
    },
    onPromotionSelect(e) {
        const piece = e.detail.piece;
        this.setData({ showPromotion: false });
        this._doMove(this._promotionFrom, this._promotionTo, piece);
    },
    onPromotionCancel() {
        this.setData({ showPromotion: false });
    },
    _doMove(from, to, promotion) {
        const chess = this._chess;
        // 本地预演（只用于清除选中状态，不走回包）
        try {
            chess.move({ from, to, promotion });
        }
        catch { /* 服务端验证 */ }
        this.setData({ selectedSquare: '', legalMoves: [] });
        const uci = from + to + (promotion !== 'q' ? promotion : '');
        wsClient.send('game:move', { matchId: this._matchId, uci });
    },
    _onGameMove(payload) {
        const chess = this._chess;
        if (!chess)
            return;
        try {
            const uci = payload.uci;
            chess.move({
                from: uci.substring(0, 2),
                to: uci.substring(2, 4),
                promotion: uci.length > 4 ? uci.substring(4) : undefined,
            });
        }
        catch { /* 忽略，服务端已验证 */ }
        this.setData({
            fen: payload.fen || chess.fen(),
            isMyTurn: chess.turn() === this.data.myColor,
            isCheck: chess.isCheck(),
            // 走子后清除选中
            selectedSquare: '',
            legalMoves: [],
        });
    },
    _onGameSync(payload) {
        const match = payload.match;
        if (!match)
            return;
        this._chess = new Chess.Chess(match.currentFen || undefined);
        this.setData({
            fen: match.currentFen || '',
            isMyTurn: (this._chess.turn() === this.data.myColor),
            isCheck: this._chess?.isCheck() || false,
            myTime: match.timerState?.whiteTime ?? this.data.myTime,
            opponentTime: match.timerState?.blackTime ?? this.data.opponentTime,
            selectedSquare: '',
            legalMoves: [],
        });
    },
    // ===== 计时器 =====
    _onGameTimer(payload) {
        if (payload.matchId !== this._matchId)
            return;
        const ts = payload.timerState;
        if (!ts)
            return;
        if (this.data.myColor === 'w') {
            this.setData({ myTime: ts.whiteTime, opponentTime: ts.blackTime });
        }
        else {
            this.setData({ myTime: ts.blackTime, opponentTime: ts.whiteTime });
        }
    },
    // ===== 操作按钮 =====
    onFlipBoard() {
        this.setData({ flipped: !this.data.flipped });
    },
    onDrawOffer() {
        if (!this.data.canOfferDraw)
            return;
        wsClient.send('game:draw_offer', { matchId: this._matchId });
        this.setData({ canOfferDraw: false, canTakeback: false });
        this._showToast('已发送和棋请求，等待对方回复', 'info');
    },
    _onDrawOffered(payload) {
        this.setData({
            showConfirm: true,
            confirmTitle: '和棋提议',
            confirmDesc: `${payload.offeredByUsername || '对手'} 提议和棋，是否同意？`,
            confirmAction: 'draw_accept',
            confirmMatchId: this._matchId,
        });
    },
    _onDrawDeclined() {
        this.setData({ canOfferDraw: true, canTakeback: true });
        this._showToast('对方拒绝了和棋', 'warn');
    },
    onTakebackRequest() {
        if (!this.data.canTakeback)
            return;
        wsClient.send('game:takeback_request', { matchId: this._matchId });
        this.setData({ canTakeback: false, canOfferDraw: false });
        this._showToast('已发送悔棋请求，等待对方回复', 'info');
    },
    _onTakebackRequested(payload) {
        this.setData({
            showConfirm: true,
            confirmTitle: '悔棋请求',
            confirmDesc: `${payload.byUsername || '对手'} 请求悔棋，是否同意？`,
            confirmAction: 'takeback_accept',
            confirmMatchId: this._matchId,
        });
    },
    _onTakebackDeclined() {
        this.setData({ canTakeback: true, canOfferDraw: true });
        this._showToast('对方拒绝了悔棋', 'warn');
    },
    onResign() {
        wx.showModal({
            title: '确认认输？',
            content: '确定要认输吗？',
            success: (res) => {
                if (res.confirm) {
                    wsClient.send('game:resign', { matchId: this._matchId });
                }
            },
        });
    },
    // ===== 确认弹窗 =====
    onConfirmYes() {
        const action = this.data.confirmAction;
        this.setData({ showConfirm: false });
        if (action === 'draw_accept') {
            wsClient.send('game:draw_accept', { matchId: this._matchId });
        }
        else if (action === 'takeback_accept') {
            wsClient.send('game:takeback_accept', { matchId: this._matchId });
        }
    },
    onConfirmCancel() {
        const action = this.data.confirmAction;
        this.setData({ showConfirm: false });
        if (action === 'draw_accept') {
            wsClient.send('game:draw_decline', { matchId: this._matchId });
        }
        else if (action === 'takeback_accept') {
            wsClient.send('game:takeback_decline', { matchId: this._matchId });
        }
    },
    // ===== 对局结束 =====
    _onGameOver(payload) {
        this.setData({ gameOver: true, selectedSquare: '', legalMoves: [] });
        const result = payload.result;
        let icon = '🤝', title = '和棋', desc = '';
        if (result === 'white') {
            const iWin = this.data.myColor === 'w';
            icon = iWin ? '🎉' : '😞';
            title = iWin ? '你赢了！' : '你输了';
            desc = this._formatGameOverReason(payload);
        }
        else if (result === 'black') {
            const iWin = this.data.myColor === 'b';
            icon = iWin ? '🎉' : '😞';
            title = iWin ? '你赢了！' : '你输了';
            desc = this._formatGameOverReason(payload);
        }
        else {
            icon = '🤝';
            title = '和棋';
            desc = this._formatGameOverReason(payload);
        }
        this.setData({
            showGameOver: true,
            gameOverIcon: icon,
            gameOverTitle: title,
            gameOverDesc: desc,
        });
    },
    _formatGameOverReason(payload) {
        const reason = payload.reason || '';
        switch (reason) {
            case 'resign': return '对方认输';
            case 'timeout': return '对方超时';
            case 'disconnected': return '对方掉线';
            case 'draw_agreed': return '双方同意和棋';
            default: return '对局结束';
        }
    },
    _onOpponentDisconnected() {
        this._showToast('对手已掉线，30 秒内未重连将判负', 'warn');
    },
    _onOpponentReconnected() {
        this._showToast('对手已重连', 'info');
    },
    // ===== 结束操作 =====
    onRematch() {
        this.setData({
            showGameOver: false,
            status: 'idle',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        });
        this._chess = null;
        this._matchId = '';
        this.onJoinMatch();
    },
    onBackToLobby() {
        this.setData({ showGameOver: false });
        wx.navigateBack();
    },
    /** 阻止弹窗内点击穿透到遮罩层 */
    stopPropagation() {
        // 空函数，catchtap 绑此方法仅用于阻止事件冒泡
    },
    // ===== 工具 =====
    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    _showToast(msg, type = 'info') {
        this.setData({ statusMessage: msg, statusToastType: type });
        setTimeout(() => {
            this.setData({ statusMessage: '' });
        }, 3000);
    },
});

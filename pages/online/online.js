"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 在线对弈页（PvP 人人对弈）
 * 五态：idle → matching/tabling → playing → finished
 * 通过 WebSocket 与服务端通信，走子由服务端权威验证后广播同步。
 */
const app = getApp();
const Chess = require('../../utils/chessjs');
const util = require('../../utils/util');
const wsClient = require('../../utils/ws').default;
const FILES = 'abcdefgh';
const RANKS = '87654321';

/** 棋桌时间预设（后端只支持 total_time 模式，10s~10800s） */
const TABLE_TIME_PRESETS = [
  { label: '不限时', mode: 'none', time: 0, inc: 0 },
  { label: '1分钟', mode: 'total_time', time: 60, inc: 0 },
  { label: '3分钟', mode: 'total_time', time: 180, inc: 0 },
  { label: '5分钟', mode: 'total_time', time: 300, inc: 0 },
  { label: '10分钟', mode: 'total_time', time: 600, inc: 0 },
  { label: '15分钟', mode: 'total_time', time: 900, inc: 0 },
  { label: '30分钟', mode: 'total_time', time: 1800, inc: 0 },
];

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
        status: 'idle', // idle | matching | tabling | playing | finished
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
        wsConnected: false,
        lastMoveFrom: '',
        lastMoveTo: '',
        spectatorCount: 0,
        // 棋桌模式
        activeTables: [],
        showInviteDialog: false,
        inviteData: {},
        pendingChallenge: false,
        currentTimeLabel: '不限时',
    },
    // 内部状态
    _matchId: '',
    _chess: null,
    _pendingTimer: null,
    _unsubs: [],
    _promotionFrom: '',
    _promotionTo: '',
    _pendingMatchJoin: false,
    onLoad() {
        // 栈深=1 表示本页由外部入口（分享卡片/小程序码）直接打开，栈深>1 才是 navigateTo 压栈进来的
        const pages = getCurrentPages();
        const prev = pages.length > 1 ? pages[pages.length - 2] : null;
        const launch = typeof wx.getLaunchOptionsSync === 'function' ? wx.getLaunchOptionsSync() : {};
        console.log('[online] 页面栈深度=' + pages.length
            + ' 上一页=' + (prev ? prev.route : '(无，本页在栈底)')
            + ' 启动scene=' + launch.scene
            + ' 启动path=' + launch.path);
        if (!app.globalData.token) {
            wx.redirectTo({ url: '/pages/login/login' });
            return;
        }
        this.setData({
            myName: app.globalData.user?.username || '我',
        });
    },
    onShow() {
        this._syncTheme();
        this._setupWs();
        // 页面显示时请求棋桌列表
        this.onRequestTables();
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
        // 页面被销毁时自动撤下棋桌
        if (this.data.status === 'tabling') {
            wsClient.send('pvp:table_close');
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
        // 监听连接状态变化，连上后如果 pending 就自动发 match:join
        unsubs.push(ws.on('__status', (status) => {
            this.setData({ wsConnected: status === 'connected' });
            if (status === 'connected' && this._pendingMatchJoin) {
                this._pendingMatchJoin = false;
                ws.send('match:join');
            }
            else if (status === 'disconnected' && this._pendingMatchJoin) {
                // 连接失败，恢复空闲状态
                this._pendingMatchJoin = false;
                if (this._pendingTimer) {
                    clearInterval(this._pendingTimer);
                    this._pendingTimer = null;
                }
                this.setData({ status: 'idle' });
                this._showToast('连接服务器失败，请检查网络后重试', 'warn');
            }
        }));
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
        unsubs.push(ws.on('game:spectator_count', (p) => this._onSpectatorCount(p)));
        unsubs.push(ws.on('game:error', (p) => this._showToast(p.message || '操作失败', 'warn')));

        // 棋桌大厅事件
        unsubs.push(ws.on('pvp:tables', (p) => this._onTablesUpdated(p)));
        unsubs.push(ws.on('pvp:tables_updated', (p) => this._onTablesUpdated(p)));
        // 邀请对弈事件
        unsubs.push(ws.on('pvp:invite_received', (p) => this._onInviteReceived(p)));
        unsubs.push(ws.on('pvp:invite_accepted', (p) => this._onInviteAccepted(p)));
        unsubs.push(ws.on('pvp:invite_declined', (p) => this._onInviteDeclined(p)));
        unsubs.push(ws.on('pvp:invite_cancelled', (p) => this._onInviteCancelled(p)));

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
        if (wsClient.status === 'connected') {
            wsClient.send('match:join');
            this._pendingMatchJoin = false;
        }
        else {
            // 尚未连上，设置标志，等 __status 事件触发后自动发送
            this._pendingMatchJoin = true;
            wsClient.connect();
        }
    },
    onCancelMatch() {
        this._pendingMatchJoin = false;
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

    // ===== 棋桌模式 =====

    /** 摆下棋桌（让用户选择时间后发送） */
    onOpenTable() {
        const timeLabels = TABLE_TIME_PRESETS.map((p) => p.label);
        wx.showActionSheet({
            itemList: timeLabels,
            success: (res) => {
                const preset = TABLE_TIME_PRESETS[res.tapIndex];
                const timeControl = { mode: preset.mode, initialTime: preset.time, increment: preset.inc };
                wsClient.send('pvp:table_open', { timeControl });
                this.setData({
                    status: 'tabling',
                    currentTimeLabel: preset.label,
                });
                this._showToast('已摆下棋桌，等待对手挑战...', 'info');
            },
        });
    },

    /** 撤下棋桌 */
    onCloseTable() {
        wsClient.send('pvp:table_close');
        this.setData({ status: 'idle', activeTables: [] });
        this._showToast('棋桌已撤下', 'info');
    },

    /** 挑战他人棋桌 */
    onChallengeTable(e) {
        const tableId = e.currentTarget.dataset.tableid;
        if (!tableId || this.data.pendingChallenge) return;
        this.setData({ pendingChallenge: true });
        wsClient.send('pvp:table_join', { tableId });
        this._showToast('已发送挑战，等待对方回应...', 'info');
    },

    /** 请求棋桌列表 */
    onRequestTables() {
        wsClient.send('pvp:get_tables');
    },

    /** 处理棋桌列表更新 */
    _onTablesUpdated(payload) {
        const tables = payload.tables || [];
        // 过滤掉 playing 类型的棋桌（只保留 waiting 的）
        const waitingTables = tables.filter((t) => t.kind === 'waiting');
        this.setData({ activeTables: waitingTables });
    },

    /** 收到挑战邀请 */
    _onInviteReceived(payload) {
        const invite = payload.invite;
        if (!invite) return;
        this.setData({
            showInviteDialog: true,
            inviteData: {
                inviteId: invite.matchId,
                fromUserId: invite.fromUserId,
                fromUsername: invite.fromUsername,
                fromRating: invite.fromRating,
                timeControl: invite.timeControl,
            },
        });
        // 震动反馈
        wx.vibrateShort?.({ type: 'medium' }).catch(() => {});
    },

    /** 接受邀请 */
    onInviteAccept() {
        const inviteId = this.data.inviteData?.inviteId;
        if (!inviteId) return;
        this.setData({ showInviteDialog: false });
        wsClient.send('pvp:invite_accept', { inviteId });
        this._showToast('已接受邀请，进入对局...', 'info');
    },

    /** 拒绝邀请 */
    onInviteDecline() {
        const inviteId = this.data.inviteData?.inviteId;
        this.setData({ showInviteDialog: false, inviteData: {} });
        if (inviteId) {
            wsClient.send('pvp:invite_decline', { inviteId });
        }
    },

    /** 邀请已被接受（发起方收到） */
    _onInviteAccepted(payload) {
        this.setData({ pendingChallenge: false });
        // 后端会紧接着发送 match:found，由 _onMatchFound 处理进入对局
        this._showToast('对方接受了邀请！', 'info');
    },

    /** 邀请被拒绝 */
    _onInviteDeclined(payload) {
        this.setData({ pendingChallenge: false });
        this._showToast('对方拒绝了邀请', 'warn');
    },

    /** 邀请被取消 */
    _onInviteCancelled(payload) {
        this.setData({ showInviteDialog: false, inviteData: {} });
        this._showToast('对方取消了邀请', 'warn');
    },

    /** 格式化棋桌时间的展示文本（兼容 WXML 不支持可选链） */
    formatTableTime(item) {
        const seconds = item?.timeControl?.initialTime;
        if (!seconds || seconds <= 0) return '不限时';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? m + '分' + s + '秒' : m + '分钟';
    },

    /** 获取棋手名首字符（兼容 WXML 不支持可选链） */
    getHostInitial(item) {
        const name = item?.host?.username;
        return (name || '?').substring(0, 1);
    },

    /** 获取棋手名（兼容 WXML 不支持可选链） */
    getHostName(item) {
        return item?.host?.username || '未知棋手';
    },

    /** 格式化等待时长 */
    formatWaitingTime(createdAt) {
        if (!createdAt) return '';
        const elapsed = Math.floor((Date.now() - createdAt) / 1000);
        if (elapsed < 60) return elapsed + '秒';
        return Math.floor(elapsed / 60) + '分钟';
    },

    // ===== 匹配回调 =====
    _onMatchFound(payload) {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        const match = payload.match;
        if (!match)
            return;
        this._matchId = match.matchId;
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
            lastMoveFrom: '',
            lastMoveTo: '',
            spectatorCount: 0,
            // 清除棋桌状态
            showInviteDialog: false,
            inviteData: {},
            pendingChallenge: false,
            activeTables: [],
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
            // 记录最后一步走子，用于棋盘高亮
            lastMoveFrom: payload.uci.substring(0, 2),
            lastMoveTo: payload.uci.substring(2, 4),
        });
    },
    _onGameSync(payload) {
        const match = payload.match;
        if (!match)
            return;
        this._chess = new Chess.Chess(match.currentFen || undefined);
        // 尝试从同步数据中获取最后一步走子
        const lastMoveUci = match.lastMove || match.lastMoveUci || '';
        const lastFrom = lastMoveUci ? lastMoveUci.substring(0, 2) : '';
        const lastTo = lastMoveUci ? lastMoveUci.substring(2, 4) : '';
        this.setData({
            fen: match.currentFen || '',
            isMyTurn: (this._chess.turn() === this.data.myColor),
            isCheck: this._chess?.isCheck() || false,
            myTime: match.timerState?.whiteTime ?? this.data.myTime,
            opponentTime: match.timerState?.blackTime ?? this.data.opponentTime,
            selectedSquare: '',
            legalMoves: [],
            lastMoveFrom: lastFrom,
            lastMoveTo: lastTo,
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
    _onSpectatorCount(payload) {
        if (payload.matchId !== this._matchId) return;
        this.setData({ spectatorCount: payload.spectatorCount ?? 0 });
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
        util.navigateBackSafe('/pages/choice/choice');
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
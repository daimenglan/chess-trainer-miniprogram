"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 在线对弈页（PvP 人人对弈 + Lichess 跨平台对弈）
 *
 * 状态机：idle → matching → playing → finished（另有 tabling / replay）
 * 通过 WebSocket 与服务端通信，走子由服务端权威验证后广播同步。
 *
 * Lichess 对局与本地对局的关键差异（与网页版保持一致）：
 *   - 匹配入口合并：先本系统匹配，3 秒无对手且已绑定 Lichess 时自动转 Lichess
 *   - 走子推送只带完整 UCI 序列（moves）+ wtime/btime，无 FEN/SAN，必须本地重放
 *   - 棋钟由 Lichess 权威提供，两次走棋之间由本地锚点外推（服务端不推 game:timer）
 *   - 落子采用乐观更新，失败时回滚到上一个权威局面
 */
const app = getApp();
const api = require('../../utils/api');
const Chess = require('../../utils/chessjs');
const util = require('../../utils/util');
const wsClient = require('../../utils/ws').default;
const lplay = require('../../utils/lichessPlay');
const lbind = require('../../utils/lichessBind');
const { trackEvent } = require('../../utils/analytics');
const soundManager = require('../../utils/sound').default;
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
/**
 * Lichess 时限预设（分钟 + 加秒）
 * 注意 time 单位是「分钟」：后端校验 time 为 1~180 分钟，且
 * 预估时长 = time*60 + 40*inc 必须 ≥ 480 秒（Lichess Board API 仅支持 Rapid 及以上）
 */
const LICHESS_TIME_PRESETS = [
    { label: '10+0', time: 10, inc: 0 },
    { label: '10+5', time: 10, inc: 5 },
    { label: '15+10', time: 15, inc: 10 },
    { label: '15+15', time: 15, inc: 15 },
    { label: '30+0', time: 30, inc: 0 },
    { label: '30+20', time: 30, inc: 20 },
];
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Lichess 占位对手 userId（与后端 pvpService.LICHESS_OPPONENT_ID 一致），用于识别跨平台对局 */
const LICHESS_OPPONENT_ID = -1000000;
Page({
    /** 同步主题 */
    _syncTheme() {
        try {
            const a = getApp();
            const theme = a?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        soundEnabled: (typeof getApp === "function" ? (getApp().globalData?.settings?.soundEnabled !== false) : true),
        status: 'idle', // idle | matching | tabling | playing | finished | replay
        waitingSeconds: 0,
        fen: START_FEN,
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
        opponentRating: 0,
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
        // ===== 手动推演（本地试走，不发送给对手）=====
        exploreMode: false,
        exploreFen: '',
        exploreBaseFen: '',
        exploreLastUci: '',
        // ===== 分享 =====
        showShareModal: false,
        shareUrl: '',
        // ===== 历史对局 =====
        gameHistory: [],
        historyLoading: false,
        showHistory: false,
        // 棋桌模式
        activeTables: [],
        showInviteDialog: false,
        inviteData: {},
        pendingChallenge: false,
        currentTimeLabel: '不限时',
        // 观战/回放
        isSpectating: false,
        isReplay: false,
        replayIndex: 0,
        replayMoves: [],
        replayTotal: 0,
        // ===== 观战视图专用（一律白方/黑方固定槽位，不走 myColor 映射）=====
        whiteName: '白方',
        blackName: '黑方',
        whiteRating: 0,
        blackRating: 0,
        whiteInitial: '?',
        blackInitial: '?',
        /** 双方棋钟剩余秒数（原始值，供低时判断） */
        whiteTime: 600,
        blackTime: 600,
        /** 棋钟文案（mm:ss，低时时为原始秒数） */
        whiteTimeLabel: '10:00',
        blackTimeLabel: '10:00',
        whiteLow: false,
        blackLow: false,
        activeSide: '',
        /** 时限文案（如 10m / 10m+5 / 不限时） */
        timeControlLabel: '不限时',
        /** 当前走子方中文名 */
        turnSideName: '白方',
        /** 已走回合数 */
        roundCount: 0,
        /** 观战信息区 Tab：board（棋盘信息）| moves（走法记录） */
        spectateTab: 'board',
        showSpectateMenu: false,
        /** 回看：null = 实时局面，数字 = 第 n 半步 */
        viewPly: null,
        spectateTotal: 0,
        /** 回看用局面序列（fens[0] 为开局） */
        spectateFens: [],
        /** 棋盘当前展示局面（实时或回看） */
        displayFen: START_FEN,
        displayLastFrom: '',
        displayLastTo: '',
        /** 观战棋盘配色（跟随用户设置） */
        boardColorPreset: 'blueWhite',
        // 对弈模式切换：random = 随机匹配（默认），tables = 棋桌大厅
        gameMode: 'random',
        tableLobbyEnabled: true,
        // Lichess 跨平台对弈（入口受后台开关 + 白名单灰度控制）
        lichessVisible: false,
        lichessBound: false,
        lichessUsername: '',
        lichessProfile: null,
        lichessMatching: false,
        lichessTime: 10,
        lichessIncrement: 0,
        lichessTimePresets: LICHESS_TIME_PRESETS,
        lichessInviteSent: null,
        lichessInviteError: '',
        lichessOnlineUsers: [],
        lichessChallenges: [],
        gameSource: '', // '' | 'local' | 'lichess'
        lichessGameId: '',
        // 走法历史（用于教练闲聊）
        moveHistory: [],
        gameStarted: false,
        // 终局文案（按网页版口径区分「你/对方」）
        resultText: '',
        reasonText: '',
    },
    // 内部状态
    _matchId: '',
    _chess: null,
    _exploreChess: null,
    _pendingTimer: null,
    _clockTimer: null,
    _unsubs: [],
    _promotionFrom: '',
    _promotionTo: '',
    _pendingMatchJoin: false,
    _fallbackTimer: null,
    _pendingSeek: null,
    /** 乐观走子回滚快照（权威回显后前移，失败时回滚） */
    _optimisticRollback: null,
    /** 已发送的对局结果（用于终局文案判断） */
    _gameOverReason: '',
    /** 服务端下发的原始终局结果：'w'/'b'/'draw'/'*'，复盘页据此生成 PGN Result 标签 */
    _gameOverResult: '',
    /** 当前对局时限的加秒数（Lichess 走子后推进棋钟用） */
    _matchIncrement: 0,
    /** 游客被登录引导拦截：避免 onShow 继续建 WS/发请求 */
    _guestBlocked: false,
    /** 观战：服务端权威走法（{uci,san,from,to}），用于回看局面重建 */
    onLoad() {
        // 在线对弈需匹配真实账号才能建立对战房间，游客引导登录后返回即可
        if (!util.requireLogin('在线对弈')) {
            this._guestBlocked = true;
            util.navigateBackSafe();
            return;
        }
        this.setData({
            myName: app.globalData.user?.username || '我',
            lichessBound: !!(app.globalData.user?.lichessUsername),
            lichessUsername: app.globalData.user?.lichessUsername || '',
        });
        this._loadLichessEntry();
        this._loadTableLobbyFlag();
    },
    onShow() {
        this._syncTheme();
        if (this._guestBlocked || !app.globalData.token) {
            this._cleanupWs();
            return;
        }
        this._setupWs();
        this.onRequestTables();
        this.loadGameHistory();
        // 绑定页返回后重新拉取状态（令牌绑定/解绑都在该页完成）
        this._refreshLichessStatus();
    },
    onHide() {
        this._cleanupWs();
    },
    onUnload() {
        this._cleanupWs();
        this._stopClockTicker();
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        this._clearFallbackTimer();
        if (this.data.status === 'tabling') {
            wsClient.send('pvp:table_close');
        }
        // 观战页被销毁（navigateBack / redirectTo）：主动退出观战，避免服务端观战人数虚高
        if (this.data.isSpectating && this._matchId) {
            wsClient.send('pvp:spectate_leave', { matchId: this._matchId });
        }
    },
    _setupWs() {
        this._cleanupWs();
        const unsubs = [];
        const ws = wsClient;
        if (ws.status === 'idle' || ws.status === 'disconnected') {
            ws.connect();
        }
        unsubs.push(ws.on('__status', (status) => {
            this.setData({ wsConnected: status === 'connected' });
            if (status === 'connected' && this._pendingMatchJoin) {
                this._pendingMatchJoin = false;
                ws.send('match:join');
            }
            else if (status === 'disconnected' && this._pendingMatchJoin) {
                this._pendingMatchJoin = false;
                if (this._pendingTimer) {
                    clearInterval(this._pendingTimer);
                    this._pendingTimer = null;
                }
                this.setData({ status: 'idle' });
                this._showToast('连接服务器失败，请检查网络后重试', 'warn');
            }
            // 好友页把「接受挑战」交接过来：必须等订阅就绪后再发，
            // 否则服务端随之而来的 match:found 会在我们还没订阅时到达而丢失
            if (status === 'connected')
                this._consumePendingInviteAccept();
        }));
        unsubs.push(ws.on('match:found', (p) => this._onMatchFound(p)));
        unsubs.push(ws.on('match:cancelled', () => this._onMatchCancelled()));
        unsubs.push(ws.on('match:waiting', (p) => this._onMatchWaiting(p)));
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
        unsubs.push(ws.on('game:error', (p) => this._onGameError(p)));
        // ===== Lichess 事件（服务端真实事件名）=====
        // 匹配/对局复用 match:* 与 game:* 通道，Lichess 专属事件只有下面这几个
        unsubs.push(ws.on('lichess:online_users', (p) => this._onLichessOnlineUsers(p)));
        unsubs.push(ws.on('lichess:invite_sent', (p) => this._onLichessInviteSent(p)));
        unsubs.push(ws.on('lichess:challenge_received', (p) => this._onLichessChallengeReceived(p)));
        unsubs.push(ws.on('lichess:challenge_cancelled', (p) => this._onLichessChallengeCancelled(p)));
        unsubs.push(ws.on('lichess:challenge_declined', (p) => this._onLichessChallengeDeclined(p)));
        // 棋桌大厅事件
        unsubs.push(ws.on('pvp:tables', (p) => this._onTablesUpdated(p)));
        unsubs.push(ws.on('pvp:tables_updated', (p) => this._onTablesUpdated(p)));
        // 邀请对弈事件
        unsubs.push(ws.on('pvp:invite_received', (p) => this._onInviteReceived(p)));
        unsubs.push(ws.on('pvp:invite_accepted', (p) => this._onInviteAccepted(p)));
        unsubs.push(ws.on('pvp:invite_declined', () => this._onInviteDeclined()));
        unsubs.push(ws.on('pvp:invite_cancelled', (p) => this._onInviteCancelled(p)));
        // 观战状态（pvp:spectate_join 的响应）
        unsubs.push(ws.on('pvp:spectate_state', (p) => this._onSpectateState(p)));
        this._unsubs = unsubs;
    },
    _cleanupWs() {
        for (const fn of this._unsubs)
            fn();
        this._unsubs = [];
    },
    // ===== 匹配 =====
    /**
     * 点击「匹配对手」：本系统优先，3 秒无对手且 Lichess 可用时自动降级到 Lichess。
     * 与网页版 handleStartMatch 完全一致。
     */
    onJoinMatch() {
        if (this.data.status !== 'idle')
            return;
        trackEvent('match_join', { mode: this.data.gameMode });
        this.setData({ status: 'matching', waitingSeconds: 0, gameSource: 'local' });
        this._startWaitingTimer();
        this._clearFallbackTimer();
        if (wsClient.status === 'connected') {
            wsClient.send('match:join');
            this._pendingMatchJoin = false;
        }
        else {
            this._pendingMatchJoin = true;
            wsClient.connect();
        }
        // 3 秒降级定时器：仍在本系统匹配中（未被匹配成功）则取消并转 Lichess
        if (this.data.lichessVisible && this.data.lichessBound) {
            this._fallbackTimer = setTimeout(() => {
                this._fallbackTimer = null;
                if (this.data.status === 'matching' && !this.data.lichessMatching) {
                    // 本地匹配转为 Lichess：先取消本地队列，待服务端回 match:cancelled 后再 seek
                    // （不能在取消确认前直接 seek，否则本地队列与 Lichess 会同时生效）
                    this._pendingSeek = true;
                    wsClient.send('match:cancel');
                }
            }, 3000);
        }
    },
    /** 取消匹配（区分本地 / Lichess） */
    onCancelMatch() {
        this._clearFallbackTimer();
        this._pendingSeek = null;
        // 取消的来源与下面三条分支保持同一口径：Lichess / 棋桌 / 本地随机匹配
        trackEvent('match_cancel', {
            source: (this.data.lichessMatching || this.data.gameSource === 'lichess')
                ? 'lichess'
                : (this.data.status === 'tabling' ? 'table' : 'local'),
        });
        if (this.data.lichessMatching || this.data.gameSource === 'lichess') {
            wsClient.send('lichess:cancel');
            this._resetToIdle();
            this._showToast('已取消 Lichess 匹配', 'info');
            return;
        }
        if (this.data.status === 'tabling') {
            this.onCloseTable();
            return;
        }
        wsClient.send('match:cancel');
        this._resetToIdle();
    },
    _resetToIdle() {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        this._stopClockTicker();
        this.setData({
            status: 'idle',
            gameSource: '',
            lichessMatching: false,
            waitingSeconds: 0,
        });
    },
    _startWaitingTimer() {
        if (this._pendingTimer)
            clearInterval(this._pendingTimer);
        this._pendingTimer = setInterval(() => {
            this.setData({ waitingSeconds: this.data.waitingSeconds + 1 });
        }, 1000);
    },
    _clearFallbackTimer() {
        if (this._fallbackTimer) {
            clearTimeout(this._fallbackTimer);
            this._fallbackTimer = null;
        }
    },
    _onMatchWaiting(payload) {
        // Lichess 侧仍在匹配（重连恢复时会带 source）
        if (payload?.source === 'lichess') {
            this.setData({ status: 'matching', lichessMatching: true, gameSource: 'lichess' });
            this._startWaitingTimer();
        }
        // 本系统匹配中已有等待动画，无需额外处理
    },
    _onMatchCancelled() {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        // 降级中：本地匹配已被取消，紧接着发起 Lichess seek
        if (this._pendingSeek) {
            this._pendingSeek = null;
            this._startLichessSeek(this.data.lichessTime, this.data.lichessIncrement);
            return;
        }
        this.setData({ status: 'idle', gameSource: '', lichessMatching: false, waitingSeconds: 0 });
    },
    // ===== 棋桌模式 =====
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
    onCloseTable() {
        wsClient.send('pvp:table_close');
        this.setData({ status: 'idle', activeTables: [] });
        this._showToast('棋桌已撤下', 'info');
    },
    onChallengeTable(e) {
        const tableId = e.currentTarget.dataset.tableid;
        if (!tableId || this.data.pendingChallenge)
            return;
        this.setData({ pendingChallenge: true });
        wsClient.send('pvp:table_join', { tableId });
        this._showToast('已发送挑战，等待对方回应...', 'info');
    },
    /** 观战他人棋桌：注意服务端事件是 pvp:spectate_join，参数为 matchId（对局桌的 tableId 即 matchId） */
    onSpectateTable(e) {
        const tableId = e.currentTarget.dataset.tableid;
        if (!tableId)
            return;
        this.setData({ pendingChallenge: true });
        wsClient.send('pvp:spectate_join', { matchId: tableId });
    },
    onRequestTables() {
        wsClient.send('pvp:get_tables');
    },
    _onTablesUpdated(payload) {
        const tables = payload.tables || [];
        this.setData({ activeTables: tables });
    },
    /** 服务端返回观战状态 → 进入观战视图（布局/数据一律按白方/黑方固定槽位） */
    _onSpectateState(payload) {
        const match = payload?.match;
        if (!match)
            return;
        this._matchId = match.matchId;
        this._chess = new Chess.Chess(match.currentFen || undefined);
        const white = match.whitePlayer || {};
        const black = match.blackPlayer || {};
        // Lichess 对局：对手是占位身份（userId = -1000000），棋钟由本地锚点外推
        const isLichess = white.userId === LICHESS_OPPONENT_ID || black.userId === LICHESS_OPPONENT_ID;
        // 服务端 moves 只带 {uci, san}，from/to 由 uci 前 4 位推导（move-history 与回看都要用）
        const moves = (match.moves || []).map((m) => {
            const uci = m?.uci || '';
            return {
                uci,
                san: m?.san || '',
                from: uci.substring(0, 2),
                to: uci.substring(2, 4),
            };
        });
        const ts = match.timerState || {};
        const activeSide = ts.activeSide === 'black' ? 'black' : (ts.activeSide === 'white' ? 'white' : '');
        // Lichess 棋钟权威且不推 game:timer：用服务端初始值建锚点后本地走秒
        if (isLichess && ts) {
            lplay.resetClockAnchor();
            lplay.anchorFromTimerState({
                whiteTime: ts.whiteTime ?? 600,
                blackTime: ts.blackTime ?? 600,
                isRunning: true,
                activeSide: ts.activeSide || 'white',
            });
        }
        const fens = this._buildSpectateFens(moves, match.currentFen);
        const boardColorPreset = app.globalData?.settings?.boardColorPreset || 'blueWhite';
        this.setData({
            status: 'playing',
            isSpectating: true,
            pendingChallenge: false,
            matchId: match.matchId,
            whiteName: white.username || '白方',
            blackName: black.username || '黑方',
            whiteRating: white.rating || 0,
            blackRating: black.rating || 0,
            whiteInitial: (white.username || '?').substring(0, 1).toUpperCase(),
            blackInitial: (black.username || '?').substring(0, 1).toUpperCase(),
            whiteTime: ts.whiteTime ?? 600,
            blackTime: ts.blackTime ?? 600,
            activeSide,
            timeControlLabel: this._formatTimeControlLabel(match.timeControl),
            moveHistory: moves,
            fen: this._chess.fen(),
            isMyTurn: false,
            isCheck: this._chess.isCheck(),
            spectatorCount: payload.spectatorCount || 0,
            gameSource: isLichess ? 'lichess' : 'local',
            gameStarted: true,
            spectateTab: 'board',
            showSpectateMenu: false,
            viewPly: null,
            spectateTotal: moves.length,
            spectateFens: fens,
            boardColorPreset,
            flipped: false,
            gameOver: false,
            showGameOver: false,
            resultText: '',
            reasonText: '',
        });
        this._refreshSpectateClocks();
        this._refreshSpectateMeta();
        this._refreshSpectateDisplay();
        if (isLichess)
            this._startClockTicker();
        const turn = (match.currentFen || '').split(' ')[1] === 'b' ? '黑方' : '白方';
        this._showToast(`已进入观战，轮到${turn}走棋`, 'info');
    },
    // ===== 观战视图辅助 =====
    /** 由 UCI 序列重建局面序列（fens[0] 为开局），失败则退回服务端 FEN */
    _buildSpectateFens(moves, currentFen) {
        try {
            const chess = new Chess.Chess();
            const arr = [chess.fen()];
            for (const m of moves) {
                const uci = m?.uci || '';
                if (uci.length < 4)
                    return currentFen ? [currentFen] : arr;
                chess.move({
                    from: uci.substring(0, 2),
                    to: uci.substring(2, 4),
                    promotion: uci.length > 4 ? uci.substring(4, 5) : 'q',
                });
                arr.push(chess.fen());
            }
            return arr;
        }
        catch {
            return currentFen ? [currentFen] : [];
        }
    },
    /** 时限文案：与网页版 formatTimeControlLabel 一致 */
    _formatTimeControlLabel(tc) {
        if (!tc || tc.mode === 'none' || !tc.initialTime)
            return '不限时';
        const minutes = Math.floor(tc.initialTime / 60);
        return tc.increment > 0 ? `${minutes}m+${tc.increment}` : `${minutes}m`;
    },
    /** 刷新双方棋钟文案（低时显示原始秒数并标红；mm:ss 与网页版 formatTime 一致，分钟补零） */
    _refreshSpectateClocks() {
        const w = Math.max(0, Math.floor(this.data.whiteTime || 0));
        const b = Math.max(0, Math.floor(this.data.blackTime || 0));
        const fmt = (s) => {
            if (s <= 10 && s > 0)
                return String(s);
            const m = Math.floor(s / 60);
            return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        };
        this.setData({
            whiteTimeLabel: fmt(w),
            blackTimeLabel: fmt(b),
            whiteLow: w <= 30 && w > 0,
            blackLow: b <= 30 && b > 0,
        });
    },
    /** 刷新走子方与回合数（依据服务端权威 FEN） */
    _refreshSpectateMeta() {
        const fen = this.data.fen || START_FEN;
        const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        this.setData({
            turnSideName: turn === 'b' ? '黑方' : '白方',
            roundCount: Math.ceil((this.data.moveHistory || []).length / 2),
        });
    },
    /** 刷新棋盘展示局面（实时 = 服务端 FEN；回看 = spectateFens[viewPly]） */
    _refreshSpectateDisplay() {
        const moves = this.data.moveHistory || [];
        if (this.data.viewPly === null) {
            const last = moves[moves.length - 1];
            this.setData({
                displayFen: this.data.fen || START_FEN,
                displayLastFrom: last ? last.from : '',
                displayLastTo: last ? last.to : '',
                isCheck: this._chess ? this._chess.isCheck() : false,
            });
            return;
        }
        const fens = this.data.spectateFens || [];
        const idx = Math.min(this.data.viewPly, Math.max(0, fens.length - 1));
        const mv = moves[idx - 1];
        this.setData({
            displayFen: fens[idx] || this.data.fen || START_FEN,
            displayLastFrom: mv ? mv.from : '',
            displayLastTo: mv ? mv.to : '',
        });
    },
    /** 观战：设置回看步数（null = 回到实时局面） */
    _setSpectatePly(ply) {
        const total = (this.data.moveHistory || []).length;
        const next = ply === null ? null : Math.max(0, Math.min(ply, total));
        this.setData({ viewPly: next, spectateTotal: total }, () => this._refreshSpectateDisplay());
    },
    onSpectateGoStart() { this._setSpectatePly(0); },
    onSpectatePrev() {
        const cur = this.data.viewPly === null ? (this.data.moveHistory || []).length : this.data.viewPly;
        this._setSpectatePly(Math.max(0, cur - 1));
    },
    onSpectateNext() {
        const total = (this.data.moveHistory || []).length;
        const cur = this.data.viewPly === null ? total : this.data.viewPly;
        this._setSpectatePly(cur >= total ? null : cur + 1);
    },
    onSpectateLive() { this._setSpectatePly(null); },
    /** 棋谱点击跳步：index 为半步索引，展示到该步之后 */
    onSpectateGoToMove(e) {
        const index = e?.detail?.index;
        if (typeof index !== 'number' || isNaN(index))
            return;
        this._setSpectatePly(index + 1);
    },
    onToggleSpectateMenu() {
        this.setData({ showSpectateMenu: !this.data.showSpectateMenu });
    },
    onToggleSpectateTab() {
        this.setData({
            spectateTab: this.data.spectateTab === 'moves' ? 'board' : 'moves',
            showSpectateMenu: false,
        });
    },
    /** 收到挑战邀请 */
    _onInviteReceived(payload) {
        const invite = payload.invite;
        if (!invite)
            return;
        this.setData({
            showInviteDialog: true,
            inviteData: {
                inviteId: invite.matchId,
                fromUserId: invite.fromUserId,
                fromUsername: invite.fromUsername,
                fromRating: invite.fromRating,
                timeControl: invite.timeControl,
                isLichess: false,
            },
        });
        try {
            wx.vibrateShort?.({ type: 'medium' });
        }
        catch { /* 部分基础库不支持震动 */ }
    },
    onInviteAccept() {
        const inviteId = this.data.inviteData?.inviteId;
        if (!inviteId)
            return;
        this.setData({ showInviteDialog: false });
        trackEvent('pvp_invite_accept');
        wsClient.send('pvp:invite_accept', { inviteId });
        this._showToast('已接受邀请，进入对局...', 'info');
    },
    onInviteDecline() {
        const inviteId = this.data.inviteData?.inviteId;
        this.setData({ showInviteDialog: false, inviteData: {} });
        if (inviteId) {
            wsClient.send('pvp:invite_decline', { inviteId });
        }
    },
    /**
     * 消费好友页交接过来的「接受挑战」。
     *
     * 好友页收到挑战弹窗时若直接接受，开局事件 match:found 会发到本页而本页尚未订阅，
     * 对局就静默开不起来。因此改由本页在 WS 订阅就绪后代为接受。
     */
    _consumePendingInviteAccept() {
        const pending = app.globalData.pendingInviteAccept;
        if (!pending || !pending.inviteId)
            return;
        app.globalData.pendingInviteAccept = null;
        trackEvent('pvp_invite_accept');
        wsClient.send('pvp:invite_accept', { inviteId: pending.inviteId });
        this._showToast('已接受挑战，进入对局...', 'info');
    },
    _onInviteAccepted(payload) {
        this.setData({ pendingChallenge: false });
        this._showToast('对方接受了邀请！', 'info');
    },
    _onInviteDeclined(payload) {
        this.setData({ pendingChallenge: false });
        this._showToast('对方拒绝了邀请', 'warn');
    },
    _onInviteCancelled(payload) {
        this.setData({ showInviteDialog: false, inviteData: {} });
        this._showToast(payload?.notice || '对方取消了邀请', 'warn');
    },
    formatTableTime(item) {
        const seconds = item?.timeControl?.initialTime;
        if (!seconds || seconds <= 0)
            return '不限时';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
    },
    getHostInitial(item) {
        const name = item?.host?.username;
        return (name || '?').substring(0, 1);
    },
    getHostName(item) {
        return item?.host?.username || '未知棋手';
    },
    getSpectatorCount(item) {
        return item?.spectatorCount || 0;
    },
    formatWaitingTime(createdAt) {
        if (!createdAt)
            return '';
        const elapsed = Math.floor((Date.now() - createdAt) / 1000);
        if (elapsed < 60)
            return `${elapsed}秒`;
        return `${Math.floor(elapsed / 60)}分钟`;
    },
    /** 棋桌卡片的展示名（对局桌用白/黑双方名，等待桌用桌主名） */
    getTableName(item) {
        if (item?.kind === 'playing') {
            const w = item?.white?.username || '白方';
            const b = item?.black?.username || '黑方';
            return `${w} vs ${b}`;
        }
        return item?.host?.username || '未知棋手';
    },
    /** 对局桌的时限文案 */
    getTableTimeLabel(item) {
        const tc = item?.timeControl;
        if (!tc || !tc.initialTime)
            return '不限时';
        const m = Math.floor(tc.initialTime / 60);
        const inc = tc.increment || 0;
        if (item?.kind === 'playing')
            return `${m}分钟${inc ? ' +' + inc + '秒' : ''} · 第${(item?.moveCount || 0) + 1}步`;
        return `${m}分钟${inc ? ' +' + inc + '秒' : ''}`;
    },
    // ===== 匹配成功 =====
    _onMatchFound(payload) {
        if (this._pendingTimer) {
            clearInterval(this._pendingTimer);
            this._pendingTimer = null;
        }
        this._clearFallbackTimer();
        this._pendingSeek = null;
        const match = payload.match;
        if (!match)
            return;
        const isLichess = payload.source === 'lichess';
        this._matchId = match.matchId;
        const userId = wsClient.userId || app.globalData.user?.userId;
        const isWhite = match.whitePlayer?.userId === userId;
        const myColor = isWhite ? 'w' : 'b';
        const opponentName = isWhite ? match.blackPlayer?.username : match.whitePlayer?.username;
        const opponentRating = isWhite ? match.blackPlayer?.rating : match.whitePlayer?.rating;
        this._chess = new Chess.Chess(match.currentFen || undefined);
        // 新对局：重置重放缓存与棋钟锚点，丢弃旧对局的回滚快照
        lplay.resetReplayCache();
        lplay.resetClockAnchor();
        this._optimisticRollback = null;
        this._gameOverReason = '';
        // 记下加秒数：Lichess 走子后本地推进棋钟需要它
        this._matchIncrement = match.timeControl?.increment || 0;
        const ts = match.timerState;
        if (isLichess && ts) {
            // 用服务端初始棋钟建立锚点，此后本地按真实时间走秒
            lplay.anchorFromTimerState({
                whiteTime: ts.whiteTime,
                blackTime: ts.blackTime,
                isRunning: true,
                activeSide: ts.activeSide,
            });
        }
        const myTime = isLichess && ts
            ? (myColor === 'w' ? ts.whiteTime : ts.blackTime)
            : (myColor === 'w' ? (ts?.whiteTime ?? 600) : (ts?.blackTime ?? 600));
        const oppTime = isLichess && ts
            ? (myColor === 'w' ? ts.blackTime : ts.whiteTime)
            : (myColor === 'w' ? (ts?.blackTime ?? 600) : (ts?.whiteTime ?? 600));
        this.setData({
            status: 'playing',
            isSpectating: false,
            matchId: match.matchId,
            myColor,
            opponentColor: myColor === 'w' ? 'b' : 'w',
            opponentName: opponentName || (isLichess ? 'Lichess 玩家' : '对手'),
            opponentRating: opponentRating || 0,
            fen: this._chess.fen(),
            isMyTurn: this._chess.turn() === myColor,
            isCheck: this._chess.isCheck(),
            myTime,
            opponentTime: oppTime,
            // Lichess 对局同样支持提和/悔棋：服务端会转发到 Lichess API
            canOfferDraw: true,
            canTakeback: true,
            gameOver: false,
            selectedSquare: '',
            legalMoves: [],
            flipped: myColor === 'b',
            lastMoveFrom: '',
            lastMoveTo: '',
            spectatorCount: 0,
            showInviteDialog: false,
            inviteData: {},
            pendingChallenge: false,
            activeTables: [],
            gameSource: isLichess ? 'lichess' : 'local',
            lichessGameId: payload.lichessGameId || '',
            lichessMatching: false,
            gameStarted: true,
            moveHistory: [],
            resultText: '',
            reasonText: '',
        });
        trackEvent('pvp_start', {
            matchType: isLichess ? 'lichess' : 'local',
            mode: this.data.gameMode,
            myColor,
            opponentRating: opponentRating || 0,
            initialTime: match.timeControl?.initialTime || 0,
            increment: match.timeControl?.increment || 0,
        });
        if (isLichess) {
            this._startClockTicker();
            this._showToast('已匹配 Lichess 对手，对局开始！', 'info');
        }
    },
    // ===== 走子 =====
    onSquareTap(e) {
        if (this.data.gameOver)
            return;
        const square = e.detail.square;
        const chess = this._chess;
        if (!chess)
            return;
        // 手动推演中：黑白双方均可自由走子
        if (this.data.exploreMode) {
            this._handleExploreMove(square);
            return;
        }
        if (!this.data.isMyTurn || this.data.isSpectating)
            return;
        if (this.data.selectedSquare === square) {
            this.setData({ selectedSquare: '', legalMoves: [] });
            return;
        }
        if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
            this._tryMove(this.data.selectedSquare, square);
            return;
        }
        const piece = chess.get(square);
        if (piece && piece.color === this.data.myColor) {
            const moves = chess.moves({ square, verbose: true });
            this.setData({
                selectedSquare: square,
                legalMoves: moves.map((m) => m.to),
            });
        }
    },
    // ===== 手动推演（本地试走，不发送给对手）=====
    /** 进入手动推演：黑白双方自由走子，对手不可见 */
    onStartManualExploration() {
        if (this.data.status !== 'playing' || this.data.isSpectating)
            return;
        const Chess = require('../../utils/chessjs');
        const chess = new Chess.Chess(this._chess.fen());
        this._exploreChess = chess;
        this.setData({
            exploreMode: true,
            exploreFen: this._chess.fen(),
            exploreBaseFen: this._chess.fen(),
            exploreLastUci: '',
        });
        util.showToast('推演中：黑白自由试走，对手不可见', 'info');
    },
    /** 退出推演，恢复到当前对局局面 */
    onExitExploration() {
        this._exploreChess = null;
        this.setData({
            exploreMode: false,
            exploreFen: '',
            exploreBaseFen: '',
            exploreLastUci: '',
        });
    },
    /** 推演中走子 */
    _handleExploreMove(square) {
        const chess = this._exploreChess;
        if (!chess)
            return;
        // 取消选中
        if (this.data.selectedSquare === square) {
            this.setData({ selectedSquare: '', legalMoves: [] });
            return;
        }
        // 走子
        if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
            const uci = this.data.selectedSquare + square;
            try {
                chess.move({
                    from: uci.slice(0, 2),
                    to: uci.slice(2, 4),
                    promotion: uci.length > 4 ? uci.slice(4) : 'q',
                });
            }
            catch {
                return;
            }
            this.setData({
                exploreFen: chess.fen(),
                exploreLastUci: uci,
                selectedSquare: '',
                legalMoves: [],
            });
            return;
        }
        // 选中己方棋子（推演中双方均可选）
        const piece = chess.get(square);
        if (piece) {
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
    /** promotion-dialog 的事件载荷是 { type }，不是 { piece } */
    onPromotionSelect(e) {
        const piece = e.detail.type || 'q';
        this.setData({ showPromotion: false });
        this._doMove(this._promotionFrom, this._promotionTo, piece);
    },
    onPromotionCancel() {
        this.setData({ showPromotion: false });
    },
    _doMove(from, to, promotion) {
        const chess = this._chess;
        if (!chess)
            return;
        // UCI：走子不带升变后缀（q 为默认），避免与 Lichess 侧序列比对不一致
        const uci = from + to + (promotion && promotion !== 'q' ? promotion : '');
        if (this.data.gameSource === 'lichess') {
            // Lichess 对局：乐观更新本地棋盘（棋子立即显示），权威回显随后幂等覆盖
            const uciList = (this.data.moveHistory || []).map((m) => m.uci);
            uciList.push(uci);
            const replayed = lplay.replayUciMoves(uciList);
            if (!replayed) {
                // 本地序列非法（理论不应发生）：不做乐观应用，直接交给服务端判定
                wsClient.send('game:move', { matchId: this._matchId, uci });
                return;
            }
            // 保存回滚快照（走子前的权威局面与棋钟锚点，失败时整体还原）
            this._optimisticRollback = {
                fen: this.data.fen,
                moves: (this.data.moveHistory || []).slice(),
                myTime: this.data.myTime,
                opponentTime: this.data.opponentTime,
                anchor: lplay.snapshotClockAnchor(),
            };
            const inc = this._incrementSeconds();
            lplay.advanceAnchorForLocalMove(replayed.turn, inc);
            this._chess.load(replayed.fen);
            this.setData({
                fen: replayed.fen,
                moveHistory: replayed.moves,
                isMyTurn: false,
                isCheck: chess.isCheck(),
                selectedSquare: '',
                legalMoves: [],
                lastMoveFrom: from,
                lastMoveTo: to,
            });
            this._syncClocksFromAnchor();
            wsClient.send('game:move', { matchId: this._matchId, uci });
            return;
        }
        // 本地对局：服务端回显很快，不做乐观更新，等权威广播
        try {
            chess.move({ from, to, promotion });
        }
        catch { /* 服务端验证 */ }
        this.setData({ selectedSquare: '', legalMoves: [] });
        wsClient.send('game:move', { matchId: this._matchId, uci });
    },
    /** 当前对局的加秒数（用于 Lichess 走子后推进棋钟锚点） */
    _incrementSeconds() {
        return this._matchIncrement || 0;
    },
    _onGameMove(payload) {
        const chess = this._chess;
        if (!chess)
            return;
        if (payload.matchId !== this._matchId)
            return;
        // 对方走子：自动退出推演，恢复到当前对局局面
        if (this.data.exploreMode) {
            this.onExitExploration();
        }
        // ===== Lichess 走棋：从完整 UCI 序列幂等重建（棋盘/着法/棋钟一并同步）=====
        if (payload.source === 'lichess' && payload.moves !== undefined) {
            const uciList = String(payload.moves).split(' ').filter(Boolean);
            const replayed = lplay.replayUciMoves(uciList);
            if (!replayed)
                return; // 序列非法：忽略本次推送，等待下一次权威同步
            const last = replayed.moves[replayed.moves.length - 1];
            const activeSide = replayed.turn === 'w' ? 'white' : 'black';
            if (payload.wtime !== undefined && payload.btime !== undefined) {
                lplay.buildAuthoritativeAnchor(payload.wtime, payload.btime, activeSide, payload.tServer, payload.lagMs);
            }
            this._chess.load(replayed.fen);
            this.setData({
                fen: replayed.fen,
                moveHistory: replayed.moves,
                isMyTurn: replayed.turn === this.data.myColor,
                isCheck: chess.isCheck(),
                selectedSquare: '',
                legalMoves: [],
                lastMoveFrom: last ? last.from : '',
                lastMoveTo: last ? last.to : '',
                gameStarted: true,
            });
            if (this.data.isSpectating) {
                // 观战：棋谱整体替换为权威序列，并刷新回看局面/走子方
                this.setData({
                    spectateFens: this._buildSpectateFens(replayed.moves, replayed.fen),
                    spectateTotal: replayed.moves.length,
                });
                this._refreshSpectateClocks();
                this._refreshSpectateMeta();
                this._refreshSpectateDisplay();
            }
            this._syncClocksFromAnchor();
            // 权威状态已确认：回滚点前移
            this._optimisticRollback = null;
            // 走子音效
            if (this.data.soundEnabled !== false) {
                this._playMoveSound(last ? last.san : '', replayed.turn);
            }
            return;
        }
        // ===== 本地走棋：服务端已给出 FEN/PGN/SAN =====
        const uci = payload.uci || '';
        try {
            this._chess.load(payload.fen || chess.fen());
        }
        catch { /* 忽略异常 FEN */ }
        const chessRef = this._chess;
        // 记录走法历史（用于教练闲聊）：保留 captured / isCheck 供语料路由
        const entry = {
            uci,
            san: payload.san || '',
            from: uci.substring(0, 2),
            to: uci.substring(2, 4),
            isCheck: chessRef.isCheck(),
            isCheckmate: chessRef.isCheckmate(),
            timestamp: Date.now(),
        };
        const history = (this.data.moveHistory || []).slice();
        history.push(entry);
        const newFen = payload.fen || chessRef.fen();
        this.setData({
            fen: newFen,
            moveHistory: history,
            isMyTurn: chessRef.turn() === this.data.myColor,
            isCheck: chessRef.isCheck(),
            selectedSquare: '',
            legalMoves: [],
            lastMoveFrom: uci.substring(0, 2),
            lastMoveTo: uci.substring(2, 4),
            gameStarted: true,
        });
        if (this.data.isSpectating) {
            this.setData({
                spectateFens: this._buildSpectateFens(history, newFen),
                spectateTotal: history.length,
            });
            this._refreshSpectateMeta();
            this._refreshSpectateDisplay();
        }
        // 走子音效
        if (this.data.soundEnabled !== false) {
            this._playMoveSound(entry.san, chessRef.turn());
        }
    },
    /** 根据 SAN 判断走子类型并播放对应音效 */
    _playMoveSound(san, turnAfter) {
        if (!san) {
            soundManager.playMoveSound();
            return;
        }
        // 吃子：SAN 含 'x'
        if (san.includes('x')) {
            soundManager.playCaptureSound();
            return;
        }
        // 将军：SAN 含 '+'
        if (san.includes('+')) {
            soundManager.playCheckSound();
            return;
        }
        // 升变：SAN 含 '='
        if (san.includes('=')) {
            soundManager.playPromoteSound();
            return;
        }
        // 短易位 / 长易位
        if (san.includes('O-O')) {
            soundManager.playCastleSound();
            return;
        }
        // 普通走子
        soundManager.playMoveSound();
    },
    _onGameSync(payload) {
        const match = payload.match;
        if (!match)
            return;
        this._chess = new Chess.Chess(match.currentFen || undefined);
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
            moveHistory: (match.moves && match.moves.length > 0) ? match.moves : this.data.moveHistory,
            gameStarted: true,
        });
    },
    // ===== 计时器 =====
    /** Lichess 对局：本地每秒按锚点外推走秒（服务端不推 game:timer） */
    _startClockTicker() {
        this._stopClockTicker();
        this._clockTimer = setInterval(() => {
            if (this.data.status !== 'playing' || this.data.gameSource !== 'lichess')
                return;
            this._syncClocksFromAnchor();
        }, 1000);
    },
    _stopClockTicker() {
        if (this._clockTimer) {
            clearInterval(this._clockTimer);
            this._clockTimer = null;
        }
    },
    /** 由锚点刷新双方棋钟显示 */
    _syncClocksFromAnchor() {
        const ts = lplay.currentTimerState();
        if (!ts)
            return;
        if (this.data.isSpectating) {
            // 观战：白/黑固定槽位，不做 my/opponent 映射
            this.setData({
                whiteTime: ts.whiteTime,
                blackTime: ts.blackTime,
                activeSide: ts.activeSide === 'black' ? 'black' : (ts.activeSide === 'white' ? 'white' : this.data.activeSide),
            });
            this._refreshSpectateClocks();
            return;
        }
        // 双方剩余时间（秒）：按己方颜色映射到 my/opponent 两个槽位
        const myTime = this.data.myColor === 'w' ? ts.whiteTime : ts.blackTime;
        const oppTime = this.data.myColor === 'w' ? ts.blackTime : ts.whiteTime;
        this.setData({
            myTime,
            opponentTime: oppTime,
        });
        // 计时器警告：己方时间 ≤ 10 秒且轮到己方走棋时触发
        if (myTime <= 10 && this.data.isMyTurn && this.data.soundEnabled !== false) {
            soundManager.playTimerSound();
        }
    },
    /** 本地对局：服务端推来的权威棋钟 */
    _onGameTimer(payload) {
        if (payload.matchId !== this._matchId)
            return;
        const ts = payload.timerState;
        if (!ts)
            return;
        if (this.data.isSpectating) {
            // 观战：白/黑固定槽位（对齐网页版 timerState.activeSide 高亮）
            this.setData({
                whiteTime: ts.whiteTime,
                blackTime: ts.blackTime,
                activeSide: ts.activeSide === 'black' ? 'black' : (ts.activeSide === 'white' ? 'white' : this.data.activeSide),
            });
            this._refreshSpectateClocks();
            return;
        }
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
        if (!this.data.canOfferDraw || this.data.isSpectating)
            return;
        wsClient.send('game:draw_offer', { matchId: this._matchId });
        this.setData({ canOfferDraw: false, canTakeback: false });
        this._showToast('已发送和棋请求，等待对方回复', 'info');
    },
    _onDrawOffered(payload) {
        // 观战者不是对局一方，不能应答提和（Lichess 对局用 emitToRoom，观战者也会收到）
        if (this.data.isSpectating)
            return;
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
        if (!this.data.canTakeback || this.data.isSpectating)
            return;
        wsClient.send('game:takeback_request', { matchId: this._matchId });
        this.setData({ canTakeback: false, canOfferDraw: false });
        this._showToast('已发送悔棋请求，等待对方回复', 'info');
    },
    _onTakebackRequested(payload) {
        // 观战者不是对局一方，不能应答悔棋（Lichess 对局用 emitToRoom，观战者也会收到）
        if (this.data.isSpectating)
            return;
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
        if (this.data.isSpectating)
            return;
        wx.showModal({
            title: '确认认输？',
            content: '确定要认输吗？',
            success: (res) => {
                if (res.confirm) {
                    // 只记录真正认输的这次确认，取消弹窗不计入
                    trackEvent('pvp_resign', { matchType: this.data.gameSource || 'local' });
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
    // ===== 错误处理 =====
    _onGameError(payload) {
        // 后端/代理错误负载可能是对象（如 Lichess API 错误体），统一转字符串
        const msg = payload?.message;
        const text = typeof msg === 'string' ? msg : (msg == null ? '操作失败' : JSON.stringify(msg));
        // match_unavailable：服务端已无此对局（后端重启 / 对局已结束并被清理）。
        // 本地棋盘无法继续，丢弃这盘死棋回到大厅，避免刷新后卡在一个"走子必报错"的棋盘上。
        if (payload?.code === 'match_unavailable') {
            this._resetToIdle();
            this._showToast('对局已失效，请返回大厅重新开始', 'warn');
            return;
        }
        // Lichess 乐观走子失败：回滚到最后一个权威局面，棋盘不能停在未确认状态
        const rollback = this._optimisticRollback;
        if (rollback && this.data.gameSource === 'lichess') {
            this._optimisticRollback = null;
            // 棋钟锚点一并还原，否则失败后本地走秒会停在错误时刻
            lplay.restoreClockAnchor(rollback.anchor || null);
            if (this._chess) {
                try {
                    this._chess.load(rollback.fen);
                }
                catch { /* 忽略 */ }
            }
            this.setData({
                fen: rollback.fen,
                moveHistory: rollback.moves,
                myTime: rollback.myTime,
                opponentTime: rollback.opponentTime,
                isMyTurn: true,
                selectedSquare: '',
                legalMoves: [],
                lastMoveFrom: rollback.moves.length > 0
                    ? (rollback.moves[rollback.moves.length - 1].from || '') : '',
                lastMoveTo: rollback.moves.length > 0
                    ? (rollback.moves[rollback.moves.length - 1].to || '') : '',
            });
        }
        this._showToast(text, 'warn');
    },
    // ===== 对局结束 =====
    _onGameOver(payload) {
        this._stopClockTicker();
        this._optimisticRollback = null;
        // 终局时自动退出推演
        if (this.data.exploreMode) {
            this._exploreChess = null;
            this.setData({ exploreMode: false, exploreFen: '', exploreBaseFen: '', exploreLastUci: '' });
        }
        this._gameOverReason = payload.reason || '';
        this._gameOverResult = payload.result || '';
        this.setData({ gameOver: true, selectedSquare: '', legalMoves: [] });
        const isLichess = payload.source === 'lichess' || this.data.gameSource === 'lichess';
        const result = payload.result;
        const resultText = this._resultText(result, payload.reason);
        const reasonText = this._reasonText(result, payload.reason);
        let icon = '🤝';
        if (result === 'draw' || result === '*') {
            icon = result === '*' ? '🎬' : '🤝';
        }
        else if (this.data.isSpectating) {
            // 观战者无「本方」视角：按胜方直接给图标（原实现 else if 恒真，观战恒按 myColor='b' 判定）
            icon = '👑';
        }
        else {
            const iWin = result === this.data.myColor;
            icon = iWin ? '👑' : '😔';
        }
        this.setData({
            showGameOver: true,
            gameOverIcon: icon,
            gameOverTitle: resultText,
            gameOverDesc: reasonText,
            resultText,
            reasonText,
        });
        if (this.data.isSpectating)
            this._refreshSpectateDisplay();
        // 终局音效（与网页版对齐：胜/负/和棋各有反馈）
        if (this.data.soundEnabled !== false) {
            if (!this.data.isSpectating) {
                const iWin = result === this.data.myColor;
                if (result === 'draw' || result === '*') {
                    soundManager.playDrawSound();
                }
                else if (iWin) {
                    soundManager.playWinSound();
                }
                else {
                    soundManager.playLoseSound();
                }
            }
        }
        // result 用服务端口径（w/b/draw/*），另附本方视角便于直接看胜率
        trackEvent('pvp_end', {
            result,
            reason: payload.reason || '',
            myColor: this.data.myColor,
            outcome: this.data.isSpectating ? 'spectate' : (result === this.data.myColor ? 'win' : (result === 'draw' || result === '*' ? 'draw' : 'loss')),
            moves: (this.data.moveHistory || []).length,
            matchType: isLichess ? 'lichess' : 'local',
        });
    },
    /** 终局标题（与网页版 resultText 口径一致） */
    _resultText(result, reason) {
        if (result === '*' || reason === 'aborted')
            return '对局已中止';
        if (this.data.isSpectating) {
            if (result === 'draw')
                return '和棋';
            return result === 'white' ? '白方获胜' : '黑方获胜';
        }
        if (result === 'draw')
            return '和棋';
        return result === this.data.myColor ? '你赢了' : '你输了';
    },
    /** 终局副标题：区分「你」与「对方」，未知原因统一为将杀结束 */
    _reasonText(result, reason) {
        if (result === '*' || reason === 'aborted')
            return '开局前退出，不计胜负';
        if (this.data.isSpectating) {
            switch (reason) {
                case 'resign': return '一方认输';
                case 'timeout': return '超时判负';
                case 'disconnected': return '掉线判负';
                case 'draw_agreed': return '双方协议和棋';
                default: return result === 'draw' ? '和棋' : '将杀结束';
            }
        }
        const loser = result === 'white' ? 'black' : 'white';
        switch (reason) {
            case 'resign': return loser === this.data.myColor ? '你认输了' : '对方认输';
            case 'timeout': return loser === this.data.myColor ? '你超时了' : '对方超时';
            case 'disconnected': return loser === this.data.myColor ? '你掉线了' : '对方掉线';
            case 'draw_agreed': return '双方协议和棋';
            default:
                if (result === 'draw')
                    return '和棋';
                return loser === this.data.myColor ? '你被将杀' : '对方被将杀';
        }
    },
    // ===== 分享 =====
    /** 打开分享弹窗 */
    onShareGame() {
        const matchId = this._matchId || '';
        const shareUrl = matchId ? `/pages/analysis/analysis?gameId=${matchId}` : '';
        this.setData({ showShareModal: true, shareUrl: shareUrl });
    },
    /** 关闭分享弹窗 */
    onCloseShareModal() {
        this.setData({ showShareModal: false, shareUrl: '' });
    },
    /** 复制分享链接 */
    onCopyShareLink() {
        const url = this.data.shareUrl;
        if (!url)
            return;
        wx.setClipboardData({
            data: url,
            success: () => util.showToast('链接已复制，去微信粘贴给好友', 'success'),
        });
    },
    _onOpponentDisconnected() {
        // 观战者不是对局一方，「对手掉线」对其无意义
        if (this.data.isSpectating)
            return;
        this._showToast('对手已掉线，等待重连...', 'warn');
    },
    _onOpponentReconnected() {
        if (this.data.isSpectating)
            return;
        this._showToast('对手已重连', 'info');
    },
    _onSpectatorCount(payload) {
        if (payload.matchId !== this._matchId)
            return;
        this.setData({ spectatorCount: payload.spectatorCount ?? 0 });
    },
    // ===== 结束操作 =====
    /** 立即复盘：从走法历史重建 PGN 后进入复盘页 */
    onGameOverReview() {
        const uciList = (this.data.moveHistory || [])
            .map((m) => m.uci)
            .filter(Boolean);
        if (uciList.length === 0) {
            this._showToast('本局没有走法记录，无法复盘', 'warn');
            return;
        }
        // 服务端每次只推权威 FEN，this._chess 的走法历史已被清空，改由 UCI 序列重建
        const replayed = lplay.replayUciMoves(uciList);
        if (!replayed) {
            this._showToast('棋谱重建失败，无法复盘', 'warn');
            return;
        }
        // 终局结果归一化为 PGN 记谱标签：'w'/'b' 为胜方，'draw' 和棋，'*' 未定（中止/掉线）
        const resultMap = {
            w: '1-0', b: '0-1', white: '1-0', black: '0-1', draw: '1/2-1/2',
        };
        const myColor = this.data.myColor;
        const oppName = this.data.opponentName || '对手';
        // 观战者不是对局一方：用真实双方姓名，避免把观战者标成「我」
        const whiteName = this.data.isSpectating ? (this.data.whiteName || '白方') : (myColor === 'w' ? '我' : oppName);
        const blackName = this.data.isSpectating ? (this.data.blackName || '黑方') : (myColor === 'w' ? oppName : '我');
        app.globalData._analysisGame = {
            pgn: replayed.pgn,
            white: whiteName,
            black: blackName,
            event: this.data.gameSource === 'lichess' ? 'Lichess 对局' : '人人对弈',
            result: resultMap[this._gameOverResult] || '*',
            gameId: this.data.lichessGameId || '',
        };
        this.setData({ showGameOver: false });
        wx.navigateTo({ url: '/pages/analysis/analysis' });
    },
    onRematch() {
        this._resetToIdle();
        this.setData({
            showGameOver: false,
            fen: START_FEN,
            gameSource: '',
            moveHistory: [],
            gameStarted: false,
            isSpectating: false,
            resultText: '',
            reasonText: '',
        });
        this._chess = null;
        this._matchId = '';
        lplay.resetReplayCache();
        lplay.resetClockAnchor();
        // 再来一局：直接走合并匹配入口（本系统优先，3 秒后降级 Lichess）
        setTimeout(() => this.onJoinMatch(), 100);
    },
    onBackToLobby() {
        // 观战者从终局弹窗回大厅 = 离开观战：需通知服务端减人数并清掉 _matchId/_chess
        if (this.data.isSpectating) {
            this.onExitGame();
            return;
        }
        this.setData({ showGameOver: false });
        this._resetToIdle();
        this._stopClockTicker();
        this.setData({ isSpectating: false, ...this._spectateResetData() });
    },
    /** 退出对局回大厅（观战时为离开观战） */
    onExitGame() {
        if (this.data.isSpectating) {
            wsClient.send('pvp:spectate_leave', { matchId: this._matchId });
        }
        this._stopClockTicker();
        this._resetToIdle();
        this.setData({
            isSpectating: false,
            gameOver: false,
            showGameOver: false,
            fen: START_FEN,
            moveHistory: [],
            gameStarted: false,
            ...this._spectateResetData(),
        });
        this._chess = null;
        this._matchId = '';
    },
    /** 观战态需要一并清空的字段（退出/回到大厅共用） */
    _spectateResetData() {
        return {
            showSpectateMenu: false,
            spectateTab: 'board',
            viewPly: null,
            spectateFens: [],
            spectateTotal: 0,
            activeSide: '',
            displayFen: START_FEN,
            displayLastFrom: '',
            displayLastTo: '',
            whiteLow: false,
            blackLow: false,
        };
    },
    // ===== 历史对局 =====
    /** 加载历史对局 */
    loadGameHistory() {
        this.setData({ historyLoading: true });
        api.loadGames()
            .then((res) => {
            const games = res?.data?.games || res?.data || [];
            const formatted = (Array.isArray(games) ? games : []).map((g) => ({
                ...g,
                dateFormatted: g.date ? util.formatDate(g.date) : '',
                whiteName: this.isPlayer(g.white) ? '你' : (g.white === 'AI' || g.white === 'ai' ? 'AI' : (g.white || '白方')),
                blackName: this.isPlayer(g.black) ? '你' : (g.black === 'AI' || g.black === 'ai' ? 'AI' : (g.black || '黑方')),
                resultLabel: this.getResultLabel(g.result),
            }));
            this.setData({
                gameHistory: formatted,
                historyLoading: false,
            });
        })
            .catch(() => {
            this.setData({ historyLoading: false });
        });
    },
    /** 切换历史面板 */
    onToggleHistory() {
        this.setData({ showHistory: !this.data.showHistory });
    },
    /** 回放历史对局 */
    onReplayGame(e) {
        const idx = e.currentTarget.dataset.idx;
        const game = this.data.gameHistory[idx];
        if (!game)
            return;
        // 解析 PGN 或走法历史
        const moves = game.moves || game.pgn ? this.parsePgnMoves(game.pgn || game.moves) : [];
        this._chess = new Chess.Chess(game.fen || undefined);
        this.setData({
            status: 'replay',
            isReplay: true,
            replayIndex: 0,
            replayMoves: moves,
            replayTotal: moves.length,
            fen: game.fen || this._chess.fen(),
            opponentName: game.whiteName || '白方',
            myName: game.blackName || '黑方',
            showGameOver: false,
            showHistory: false,
        });
    },
    /** 解析 PGN 走法 */
    parsePgnMoves(pgn) {
        if (!pgn)
            return [];
        try {
            const chess = new Chess.Chess();
            chess.loadPgn(pgn);
            return chess.history();
        }
        catch {
            return [];
        }
    },
    /** 回放：上一步 */
    replayPrev() {
        if (this.data.replayIndex <= 0)
            return;
        const idx = this.data.replayIndex - 1;
        this._chess.undo();
        this.setData({
            replayIndex: idx,
            fen: this._chess.fen(),
            isMyTurn: this._chess.turn() === 'w',
        });
    },
    /** 回放：下一步 */
    replayNext() {
        if (this.data.replayIndex >= this.data.replayTotal)
            return;
        const move = this.data.replayMoves[this.data.replayIndex];
        if (!move)
            return;
        try {
            this._chess.move(move);
        }
        catch { /* 忽略无效走法 */ }
        this.setData({
            replayIndex: this.data.replayIndex + 1,
            fen: this._chess.fen(),
            isMyTurn: this._chess.turn() === 'w',
            isCheck: this._chess.isCheck(),
        });
    },
    /** 退出回放 */
    exitReplay() {
        this.setData({
            status: 'idle',
            isReplay: false,
            replayIndex: 0,
            replayMoves: [],
            replayTotal: 0,
            gameSource: '',
        });
    },
    /** 获取对局结果标签 */
    getResultLabel(result) {
        if (result === '1-0')
            return '白胜';
        if (result === '0-1')
            return '黑胜';
        if (result === '1/2-1/2')
            return '和棋';
        return result || '*';
    },
    /** 判断是否为玩家 */
    isPlayer(type) {
        return type === 'player' || type === 'human' || type === '我';
    },
    // ===== 工具 =====
    formatTime(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    _showToast(msg, type = 'info') {
        this.setData({ statusMessage: msg, statusToastType: type });
        setTimeout(() => {
            this.setData({ statusMessage: '' });
        }, 3000);
    },
    stopPropagation() {
        // 空函数，catchtap 绑此方法仅用于阻止事件冒泡
    },
    // ===== 模式切换 =====
    onSwitchMode(e) {
        const mode = e.currentTarget.dataset.mode;
        if (mode !== 'random' && mode !== 'tables' && mode !== 'friends')
            return;
        this.setData({ gameMode: mode });
    },
    /**
     * 好友对弈大厅的邀请变更（生成/重置/换时限）。
     * 记下 token 供 onShareAppMessage 生成分享路径，让「发送给微信好友」能直达落地页。
     */
    onFriendInviteChange(e) {
        const detail = e?.detail || {};
        this._friendInviteToken = detail.token || '';
        this._friendInviteTimeLabel = detail.timeLabel || '';
    },
    /**
     * 分享：已生成邀请时分享落地页（对方点开自动成为好友并进入对弈），
     * 否则退化为分享本页，避免分享按钮点不动。
     */
    onShareAppMessage() {
        const token = this._friendInviteToken;
        if (token) {
            trackEvent('friend_invite_share', { from: 'online' });
            return {
                title: `⚔️ 邀请你下一局${this._friendInviteTimeLabel ? ' ' + this._friendInviteTimeLabel : ''}国际象棋，点开自动成为好友`,
                path: `/pages/friend-invite/index?token=${token}`,
            };
        }
        return {
            title: '⚔️ Mychess 国际象棋 · 在线对弈等你来',
            path: '/pages/online/online',
        };
    },
    /** 分享到朋友圈 */
    onShareTimeline() {
        const token = this._friendInviteToken;
        if (token) {
            return {
                title: '⚔️ 邀请你下一局国际象棋，点开自动成为好友',
                query: `token=${encodeURIComponent(token)}`,
            };
        }
        return {
            title: '♟️ MyChess 国际象棋 · AI 陪练在线对弈',
            query: '',
        };
    },
    // ===== Lichess 入口状态 =====
    /** 棋桌大厅开关（后台系统设置关闭时隐藏大厅，仅保留随机匹配） */
    _loadTableLobbyFlag() {
        api.isPvpTableLobbyEnabled()
            .then((res) => {
            const enabled = res?.data?.enabled !== false;
            this.setData({ tableLobbyEnabled: enabled });
            if (!enabled)
                this.setData({ gameMode: 'random' });
        })
            .catch(() => { });
    },
    /** 入口可见性：后台开关开启 + 当前用户在灰度白名单内（与网页版一致） */
    _loadLichessEntry() {
        api.getLichessConfig()
            .then((res) => {
            const config = res?.data || {};
            if (!config.featureEnabled || !config.allowed) {
                this.setData({ lichessVisible: false });
                return;
            }
            this.setData({ lichessVisible: true });
            this._refreshLichessStatus();
        })
            .catch(() => {
            // 配置接口不可用时静默隐藏入口
            this.setData({ lichessVisible: false });
        });
    },
    /** 刷新绑定状态 + 头像资料 + 在线棋手列表 */
    _refreshLichessStatus() {
        if (!this.data.lichessVisible)
            return;
        api.getLichessBinding()
            .then((res) => {
            const data = res?.data || {};
            this.setData({
                lichessBound: !!data.bound,
                lichessUsername: data.lichessUsername || '',
                lichessProfile: data.profile || null,
            });
            lbind.persistBinding(data.bound ? (data.lichessUsername || null) : null);
            if (data.bound) {
                this._requestLichessOnlineUsers();
            }
            else {
                this.setData({ lichessOnlineUsers: [] });
            }
        })
            .catch(() => { });
    },
    _requestLichessOnlineUsers() {
        wsClient.send('lichess:get_online_users');
    },
    /** 跳转绑定页（令牌粘贴式绑定） */
    onGoLichessBind() {
        wx.navigateTo({ url: '/pages/lichess-bind/lichess-bind?from=online' });
    },
    /** 选择 Lichess 时限预设 */
    onSelectLichessTime(e) {
        const idx = Number(e.currentTarget.dataset.idx);
        const preset = LICHESS_TIME_PRESETS[idx];
        if (!preset)
            return;
        this.setData({ lichessTime: preset.time, lichessIncrement: preset.inc });
    },
    // ===== Lichess 事件处理 =====
    /** 在线用户列表（含绑定/灰度状态回执） */
    _onLichessOnlineUsers(payload) {
        if (payload?.allowed === false) {
            // 灰度未放行：隐藏入口，避免用户看到无效入口
            this.setData({ lichessVisible: false, lichessOnlineUsers: [] });
            return;
        }
        this.setData({
            lichessOnlineUsers: payload?.users || [],
            lichessBound: payload?.bound !== false ? this.data.lichessBound : false,
            lichessInviteError: payload?.error || '',
        });
    },
    /** 发起 Lichess 快速匹配（仅内部调用：合并匹配的降级路径） */
    _startLichessSeek(time, increment) {
        this._pendingSeek = null;
        this.setData({
            status: 'matching',
            gameSource: 'lichess',
            lichessMatching: true,
            waitingSeconds: 0,
        });
        this._startWaitingTimer();
        wsClient.send('lichess:seek', { time, increment });
    },
    /** Lichess 邀请已发出（服务端回执） */
    _onLichessInviteSent(payload) {
        this.setData({
            lichessInviteSent: {
                lichessUsername: payload?.lichessUsername || '',
                time: payload?.time || 0,
                increment: payload?.increment || 0,
            },
            lichessInviteError: '',
        });
    },
    /** 收到 Lichess 挑战（对方邀请我） */
    _onLichessChallengeReceived(payload) {
        const challenge = payload?.challenge;
        if (!challenge)
            return;
        const list = (this.data.lichessChallenges || []).slice();
        if (!list.some((c) => c.id === challenge.id)) {
            list.push(challenge);
        }
        this.setData({ lichessChallenges: list });
        try {
            wx.vibrateShort?.({ type: 'medium' });
        }
        catch { /* 部分基础库不支持震动 */ }
    },
    /** 挑战被对方取消 */
    _onLichessChallengeCancelled(payload) {
        const id = payload?.challengeId;
        this.setData({
            lichessChallenges: (this.data.lichessChallenges || []).filter((c) => c.id !== id),
            lichessInviteSent: null,
        });
    },
    /** 我发出的挑战被拒绝 */
    _onLichessChallengeDeclined(payload) {
        this.setData({
            lichessInviteSent: null,
            lichessInviteError: payload?.reason || '对方拒绝了邀请',
        });
        this._showToast(payload?.reason || '对方拒绝了邀请', 'warn');
    },
    /** 接受 Lichess 挑战 */
    onAcceptLichessChallenge(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        wsClient.send('lichess:challenge_accept', { challengeId: id });
        this.setData({
            lichessChallenges: (this.data.lichessChallenges || []).filter((c) => c.id !== id),
        });
    },
    /** 拒绝 Lichess 挑战 */
    onDeclineLichessChallenge(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        wsClient.send('lichess:challenge_decline', { challengeId: id });
        this.setData({
            lichessChallenges: (this.data.lichessChallenges || []).filter((c) => c.id !== id),
        });
    },
    /** 邀请指定 Lichess 棋手 */
    onInviteLichessUser(e) {
        const username = e?.currentTarget?.dataset?.username;
        if (!username)
            return;
        if (!this.data.lichessBound) {
            this._showToast('请先绑定 Lichess 账号', 'warn');
            return;
        }
        // 服务端要求 lichessUsername（Lichess 侧的用户名），不是本系统用户名
        wsClient.send('lichess:invite', {
            lichessUsername: username,
            time: this.data.lichessTime,
            increment: this.data.lichessIncrement,
        });
    },
    /** 取消 Lichess 邀请（Lichess 无撤单接口，仅清除本地等待态） */
    onCancelLichessInvite() {
        this.setData({ lichessInviteSent: null, lichessInviteError: '' });
        this._showToast('已取消邀请', 'info');
    },
    /** 清除 Lichess 邀请错误 */
    onClearLichessInviteError() {
        this.setData({ lichessInviteError: '' });
    },
});

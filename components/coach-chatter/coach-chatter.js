"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rex 教练闲聊气泡 — 对局中偶尔在棋盘上方说一句简短的话（同网页版 CoachChatter）
 *
 * 语言来源（按优先级）：
 *   1. 外部注入（pushCoachBubble：偏好日志的实时提醒/表扬等，立即展示）
 *   2. LLM 新鲜句队列（本地缓存，跨局消费）
 *   3. 本地语料池（按对局上下文：开局/吃子/将军/优劣势/残局）
 *
 * 触发机制：
 *   - 每 8 秒静默期轮询一次（保证不依赖走子节奏也有稳定存在感）
 *   - 冷却 30 秒，每局最多 10 句（残局 >60 步追加 6 句）
 *   - 开局问候概率 85%
 */
const CHATTER_LINES = [
    // 开局
    { id: 'o1', category: 'opening', text: '开局抢出象和马，别急着冲兵。' },
    { id: 'o2', category: 'opening', text: '出子效率是王道，别把皇后早早放出去。' },
    { id: 'o3', category: 'opening', text: '控制中心格，让对手的子不好展开。' },
    { id: 'o4', category: 'opening', text: '王车易位要尽早，安全第一。' },
    { id: 'o5', category: 'opening', text: '兵的结构决定后续子的活动空间。' },
    // 中局
    { id: 'm1', category: 'middlegame', text: '子力协调比多一个兵更重要。' },
    { id: 'm2', category: 'middlegame', text: '找到对手的弱点，然后集中子力攻击它。' },
    { id: 'm3', category: 'middlegame', text: '换子前先想清楚，换完之后局面会变成什么样。' },
    { id: 'm4', category: 'middlegame', text: '通路兵是潜在的威胁，别让它安静地爬到底线。' },
    { id: 'm5', category: 'middlegame', text: '王的安全是底线，别为了攻王把自己的王暴露了。' },
    // 残局
    { id: 'e1', category: 'endgame', text: '子越少，越考验真功夫。' },
    { id: 'e2', category: 'endgame', text: '现在推动兵的人，往往笑到最后。' },
    { id: 'e3', category: 'endgame', text: '残局的王不是吉祥物，是主力队员。' },
    { id: 'e4', category: 'endgame', text: '残局每一步都是缩小版的战争，细节决定胜负。' },
    { id: 'e5', category: 'endgame', text: '王走到中心来，残局里它可是全能选手。' },
    { id: 'e6', category: 'endgame', text: '通路兵就像黎明前的号角，越早推越响亮。' },
    { id: 'e7', category: 'endgame', text: '别急着兑子，先想想兑完之后剩什么优势。' },
    { id: 'e8', category: 'endgame', text: '残局的每一次换子，都是在重新洗牌。' },
    { id: 'e9', category: 'endgame', text: '兵链是残局的城墙，断开的兵链要小心。' },
    { id: 'e10', category: 'endgame', text: '这么少的子力，反而更容易看清胜负手了。' },
    { id: 'e11', category: 'endgame', text: '残局里耐心比天才更值钱，我们慢慢磨。' },
    // 吃子
    { id: 'c1', category: 'capture', text: '又一颗{piece}离开了棋盘，气氛紧张起来了。' },
    { id: 'c2', category: 'capture', text: '吃得好！继续保持这个节奏。' },
    { id: 'c3', category: 'capture', text: '对手的{piece}没了，他的防线出现空档了。' },
    // 将军
    { id: 'ch1', category: 'check', text: '将军！对手必须立刻处理这个威胁。' },
    { id: 'ch2', category: 'check', text: '将杀的雏形出来了，看看怎么收尾。' },
    // 优势
    { id: 'a1', category: 'ahead', text: '局面打开了，继续保持压力。' },
    { id: 'a2', category: 'ahead', text: '你的子力活动性更好，找机会扩大优势。' },
    // 劣势
    { id: 'b1', category: 'behind', text: '暂时落后，别急，找机会反击。' },
    { id: 'b2', category: 'behind', text: '局面不太乐观，稳住阵脚是关键。' },
];
const TRIGGER_PROBABILITY = 0.55;
const GREETING_PROBABILITY = 0.85;
const COOLDOWN_MS = 30000;
const MAX_PER_GAME = 10;
const ENDGAME_EXTRA = 6;
const TICK_INTERVAL_MS = 8000;
const TICK_PROBABILITY = 0.25;
const STAY_MS = 6000;
const FRESH_QUEUE_KEY = 'rexChatterFreshQueue';
const RECENT_KEY = 'rexChatterRecent';
const REFRESH_COOLDOWN_KEY = 'rexChatterLastRefresh';
const FRESH_TTL_MS = 48 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 10 * 60 * 60 * 1000;
const FRESH_QUEUE_ENOUGH = 4;
const FRESH_QUEUE_MAX = 20;
const RECENT_LIMIT = 12;
const HINT_QUEUE_KEY = 'rexChatterHintQueue';
const HINT_FETCH_PROBABILITY = 0.3;
// ===== localStorage 读写（损坏/不可用时静默降级） =====
function readFreshQueue() {
    try {
        const raw = wx.getStorageInfoSync ? wx.getStorageInfoSync() : null;
        const data = wx.getStorageSync(FRESH_QUEUE_KEY);
        if (!data)
            return [];
        const arr = JSON.parse(data);
        if (!Array.isArray(arr))
            return [];
        const now = Date.now();
        return arr.filter((it) => !!it && typeof it.text === 'string' && now - Number(it.ts || 0) < FRESH_TTL_MS);
    }
    catch {
        return [];
    }
}
function writeFreshQueue(queue) {
    try {
        wx.setStorageSync(FRESH_QUEUE_KEY, JSON.stringify(queue.slice(-FRESH_QUEUE_MAX)));
    }
    catch { /* ignore */ }
}
function readRecent() {
    try {
        const data = wx.getStorageSync(RECENT_KEY);
        if (!data)
            return [];
        const arr = JSON.parse(data);
        return Array.isArray(arr) ? arr.filter((it) => typeof it === 'string') : [];
    }
    catch {
        return [];
    }
}
function pushRecent(text) {
    try {
        const next = [text, ...readRecent().filter((t) => t !== text)].slice(0, RECENT_LIMIT);
        wx.setStorageSync(RECENT_KEY, JSON.stringify(next));
    }
    catch { /* ignore */ }
}
function readRefreshTs() {
    try {
        return Number(wx.getStorageSync(REFRESH_COOLDOWN_KEY) || 0);
    }
    catch {
        return 0;
    }
}
function readHintQueue() {
    try {
        const data = wx.getStorageSync(HINT_QUEUE_KEY);
        if (!data)
            return [];
        const arr = JSON.parse(data);
        return Array.isArray(arr) ? arr.filter((it) => typeof it === 'string' && it.trim().length > 0) : [];
    }
    catch {
        return [];
    }
}
function writeHintQueue(queue) {
    try {
        wx.setStorageSync(HINT_QUEUE_KEY, JSON.stringify(queue.slice(-5)));
    }
    catch { /* ignore */ }
}
/** 按吃子记录估算玩家视角的子力差额 */
function materialBalance(moveHistory, playerSide) {
    const value = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const playerFirst = playerSide === 'white' ? 0 : 1;
    let balance = 0;
    (moveHistory || []).forEach((m, i) => {
        if (!m || !m.captured)
            return;
        const v = value[m.captured.toLowerCase()] ?? 1;
        balance += i % 2 === playerFirst ? v : -v;
    });
    return balance;
}
/** 按对局上下文路由语料类别 */
function pickCategory(moveHistory, isCheck) {
    const moves = moveHistory || [];
    const last = moves.length > 0 ? moves[moves.length - 1] : undefined;
    if (last && (last.isCheck || last.isCheckmate) || isCheck)
        return 'check';
    if (last && last.captured)
        return 'capture';
    const bal = materialBalance(moves, 'white');
    if (Math.abs(bal) >= 3 && Math.random() < 0.25) {
        return bal > 0 ? 'ahead' : 'behind';
    }
    if (moves.length < 12)
        return 'opening';
    if (moves.length > 60)
        return 'endgame';
    return 'middlegame';
}
function pickChatterLine(category, recent) {
    const lines = CHATTER_LINES.filter((l) => l.category === category);
    const available = lines.filter((l) => !recent.includes(l.text));
    const pool = available.length > 0 ? available : lines;
    if (pool.length === 0)
        return { text: '继续加油！', template: 'default' };
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return { text: picked.text, template: picked.id };
}
// ===== 模块级气泡注入通道 =====
let bubbleListener = null;
function pushCoachBubble(text) {
    if (!text)
        return;
    bubbleListener === null || bubbleListener === void 0 ? void 0 : bubbleListener(text);
}
exports.pushCoachBubble = pushCoachBubble;
Component({
    properties: {
        fen: { type: String, value: '' },
        moveHistory: { type: Array, value: [] },
        playerSide: { type: String, value: 'white' },
        gameStarted: { type: Boolean, value: false },
        gameOver: { type: Boolean, value: false },
        /** 是否启用闲聊（分析页/在线对弈页传入） */
        enabled: { type: Boolean, value: true },
    },
    data: {
        bubbleText: '',
        visible: false,
        isGreeting: false,
    },
    lifetimes: {
        attached() {
            var _a;
            bubbleListener = (text) => {
                this.showBubble(text, false);
            };
            // 启动静默期轮询
            this._startSilentTick();
            // 开局问候
            if (this.data.gameStarted && this.data.enabled) {
                this._tryGreeting();
            }
            // 挂载时消费画像提示队列
            const hints = readHintQueue();
            if (hints.length > 0) {
                writeHintQueue([]);
                setTimeout(() => this.showBubble(hints[0], false), 1500);
            }
            (_a = this._tickTimer) === null || _a === void 0 ? void 0 : _a.call(this);
        },
        detached() {
            if (this._tickTimer)
                clearInterval(this._tickTimer);
            if (this._hideTimer)
                clearTimeout(this._hideTimer);
            bubbleListener = null;
        },
    },
    observers: {
        ['gameStarted, gameOver'](started, over) {
            if (started && !over && this.data.enabled) {
                this._tryGreeting();
            }
        },
    },
    methods: {
        _startSilentTick() {
            if (this._tickTimer)
                clearInterval(this._tickTimer);
            this._tickTimer = setInterval(() => {
                if (!this.data.enabled || !this.data.gameStarted || this.data.gameOver)
                    return;
                if (Math.random() >= TICK_PROBABILITY)
                    return;
                this._tryChatter();
            }, TICK_INTERVAL_MS);
        },
        _tryGreeting() {
            if (this._greeted)
                return;
            this._greeted = true;
            if (Math.random() < GREETING_PROBABILITY) {
                const { text } = pickChatterLine('greeting', readRecent());
                this.showBubble(text, true);
            }
        },
        _tryChatter() {
            var _a;
            const now = Date.now();
            if (now - (this._lastChatterAt || 0) < COOLDOWN_MS)
                return;
            const moves = this.data.moveHistory || [];
            const quota = moves.length > 60 ? MAX_PER_GAME + ENDGAME_EXTRA : MAX_PER_GAME;
            if ((this._chatterCount || 0) >= quota)
                return;
            this._lastChatterAt = now;
            this._chatterCount = (this._chatterCount || 0) + 1;
            // 1) 画像提示缓存优先
            const hintQueue = readHintQueue();
            if (hintQueue.length > 0) {
                const [head, ...rest] = hintQueue;
                writeHintQueue(rest);
                pushRecent(head);
                this.showBubble(head, false);
                return;
            }
            // 2) 低概率拉取画像提示（后端节流，前端静默）
            if (Math.random() < HINT_FETCH_PROBABILITY) {
                this._fetchCoachHint();
            }
            // 3) LLM 新鲜句队列
            const queue = readFreshQueue();
            if (queue.length > 0) {
                const [head, ...rest] = queue;
                writeFreshQueue(rest);
                pushRecent(head.text);
                this.showBubble(head.text, false);
                return;
            }
            // 4) 本地语料池
            const category = pickCategory(moves, false);
            const { text, template } = pickChatterLine(category, readRecent());
            pushRecent(template);
            this.showBubble(text, false);
            // 5) 后台补货
            this._maybeRefresh();
        },
        _fetchCoachHint() {
            const api = require('../../utils/api');
            const polarity = this.data.playerSide === 'white' ? 'mistake' : 'good';
            api.fetchCoachHint(polarity).then((res) => {
                const hint = res?.data || res;
                if (hint && hint.hit && hint.text) {
                    // 写入提示队列，下次 _tryChatter 时消费
                    const queue = readHintQueue();
                    queue.push(hint.text);
                    writeHintQueue(queue);
                }
            }).catch(() => { /* 静默失败 */ });
        },
        _maybeRefresh() {
            const ts = readRefreshTs();
            if (Date.now() - ts < REFRESH_COOLDOWN_MS)
                return;
            const queue = readFreshQueue();
            if (queue.length >= FRESH_QUEUE_ENOUGH)
                return;
            // 小程序无 LLM 补货接口，跳过
            wx.setStorageSync(REFRESH_COOLDOWN_KEY, String(Date.now()));
        },
        showBubble(text, isGreeting) {
            this.setData({ bubbleText: text, visible: true, isGreeting });
            if (this._hideTimer)
                clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => {
                this.setData({ visible: false });
            }, STAY_MS);
        },
        onCloseBubble() {
            if (this._hideTimer)
                clearTimeout(this._hideTimer);
            this.setData({ visible: false });
        },
    },
});
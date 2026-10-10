/**
 * 每日 90 秒陪练页（竖屏模式）
 *
 * 三阶段：入口 → 对弈 → 结算
 * 与网页版 DailyChallengePage 布局一致。
 */
const ChessLib: any = require('../../utils/chessjs');
const api: any = require('../../utils/api');

const CHALLENGE_SECONDS = 90;

const THEME_LABELS = {
  master: '名局', mate: '将杀', mateIn1: '一步杀', mateIn2: '两步杀', mateIn3: '三步杀',
  endgame: '残局', middlegame: '中局', opening: '开局', tactics: '战术', positional: '局面',
  fork: '双攻击', pin: '牵制', skewer: '串击', sacrifice: '弃子', promotion: '升变',
  discoveredAttack: '闪击', hangingPiece: '吃白子', backRankMate: '底线杀', smotheredMate: '闷杀',
  deflection: '引离', attraction: '引入', clearance: '清线', interference: '阻隔',
  zugzwang: '限着', rookEndgame: '车残局', pawnEndgame: '兵残局', queenEndgame: '后残局',
  checkmate: '将杀', advantage: '优势', crushing: '胜势', equality: '均势',
};

function themeLabel(t: string): string { return THEME_LABELS[t as keyof typeof THEME_LABELS] || t; }

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function resultText(r: string): { text: string; cls: string } {
  switch (r) {
    case 'win': return { text: '胜', cls: 'text-emerald-600' };
    case 'loss': return { text: '负', cls: 'text-rose-600' };
    case 'draw': return { text: '和', cls: 'text-amber-600' };
    default: return { text: '未知', cls: 'text-gray-500' };
  }
}

Page({
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) this.setData({ __theme__: theme });
    } catch (e) { /* non-critical */ }
  },
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    phase: 'loading', // loading | entry | playing | summary | error
    info: null as any,
    settledToday: false,
    todaySummary: null as any,
    streak: 0,
    error: '',
    /** 加载失败是否因为未登录（后端 /api/daily-challenge 整组 requireAuth）：
     *  游客会拿到 401，若不区分就只会看到一个「未登录」字样。此处决定是否给出登录入口。 */
    needLogin: false,
    // playing
    challengeId: null as number | null,
    elapsed: 0,
    moveCount: 0,
    fen: '',
    lastMoveUci: '',
    userColor: 'white',
    aiDifficulty: 5,
    // summary
    summary: null as any,
    timerRef: null as any,
  },
  onReady() { this._syncTheme(); },
  onShow() { this._syncTheme(); this.loadToday(); },
  onUnload() { if (this.data.timerRef) clearInterval(this.data.timerRef); },

  async loadToday() {
    this.setData({ phase: 'loading', error: '', needLogin: false });
    // 每日挑战的连续打卡与今日战绩都绑定账号，接口整组 requireAuth。
    // 游客直接拦在门口并给出登录入口，而不是发一次注定 401 的请求后
    // 停在「加载中…」——那样页面既没有内容也没有出口。
    const app = getApp();
    if (!app?.globalData?.token) {
      this.setData({ phase: 'error', needLogin: true, error: '登录后即可开始今日的 90 秒陪练局' });
      return;
    }
    try {
      const res: any = await api.getDailyChallengeToday();
      const data = res?.data || res;
      this.setData({
        info: data?.info || null,
        settledToday: data?.settledToday || false,
        todaySummary: data?.todaySummary || null,
        streak: data?.streak || 0,
        phase: data?.info ? 'entry' : 'loading',
      });
    } catch (e: any) {
      // 登录态过期也会走到这里（token 失效 → 401），同样给登录入口
      this.setData({ phase: 'error', error: e.message || '加载失败', needLogin: /未登录|登录/.test(e?.message || '') });
    }
  },

  /** 登录引导：取消则留在本页继续浏览，不强制跳转 */
  onGoLogin() {
    wx.showModal({
      title: '登录提示',
      content: '每日 90 秒陪练局需要登录后使用，是否前往登录？',
      confirmText: '去登录',
      cancelText: '再逛逛',
      success: (res: any) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
      },
    });
  },

  /** 加载失败且无需登录时的重试 */
  onRetry() {
    this.loadToday();
  },

  async onStart() {
    if (!this.data.info) return;
    try {
      const res: any = await api.startDailyChallenge({});
      const data = res?.data || res;
      this.setData({
        challengeId: data.challengeId,
        fen: data.fen,
        userColor: data.userColor || 'white',
        aiDifficulty: data.aiDifficulty || 5,
        phase: 'playing',
        elapsed: 0,
        moveCount: 0,
      });
      this._startTimer();
    } catch (e: any) {
      wx.showToast({ title: e.message || '开始失败', icon: 'none' });
    }
  },

  _startTimer() {
    if (this.data.timerRef) clearInterval(this.data.timerRef);
    const timer = setInterval(() => {
      const elapsed = this.data.elapsed + 1;
      this.setData({ elapsed });
      if (elapsed >= CHALLENGE_SECONDS) {
        clearInterval(timer);
        this.setData({ timerRef: null });
        this._onTimeUp();
      }
    }, 1000);
    this.setData({ timerRef: timer });
  },

  _onTimeUp() {
    // 时间到，结算
    if (this.data.moveCount >= 3) {
      // 弹窗确认
      wx.showModal({
        title: '时间到',
        content: `已走 ${this.data.moveCount} 步，是否结束并查看复盘？`,
        success: (res) => {
          if (res.confirm) {
            this._settle();
          } else {
            // 继续下完，停止计时但不结算
            this.setData({ phase: 'playing' });
          }
        },
      });
    } else {
      wx.showModal({
        title: '无效对局',
        content: '步数不足 3 步，无法打卡。请重新开始。',
        showCancel: false,
        success: () => {
          this.setData({ phase: 'entry' });
          this.loadToday();
        },
      });
    }
  },

  async _settle() {
    try {
      const res: any = await api.settleDailyChallenge(this.data.challengeId!, {
        moveCount: this.data.moveCount,
        elapsed: this.data.elapsed,
      });
      const data = res?.data || res;
      this.setData({ phase: 'summary', summary: data });
    } catch (e: any) {
      wx.showToast({ title: e.message || '结算失败', icon: 'none' });
    }
  },

  onMove(e: any) {
    this.setData({ moveCount: this.data.moveCount + 1 });
  },

  onFenChange(e: any) {
    this.setData({ fen: e.detail.fen, lastMoveUci: e.detail.lastMoveUci || '' });
  },

  onBack() {
    wx.navigateBack();
  },

  onReplay() {
    wx.navigateTo({ url: '/pages/analysis/analysis' });
  },
});
export {};
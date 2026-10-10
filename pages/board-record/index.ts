/** 棋盘录制页 — 竖屏模式
 * 在空白棋盘上逐手走棋，保存到「我的棋谱」。
 * 布局：顶栏(返回/翻转) → 棋盘 → 控制面板(元数据/工具栏/走棋历史/保存)
 *
 * 走子交互由本页负责：chess-board 只抛 squaretap，选子/走子/升变/复盘跳转
 * 都在这里维护 chess 实例，再把 fen / selectedSquare / legalMoves 回写给组件。
 *
 * AI 推荐走法：工具栏「🤖 AI提示」开关，开启后把 api.analyzePosition 的候选
 * 回写给 chess-board（箭头+编号角标）与 analysis-panel（评估条+候选列表）。
 * 默认关闭 —— 课堂录入不应在用户没要求时消耗分析额度。
 */
const Chess = require('../../utils/chessjs');
const api = require('../../utils/api');
const util = require('../../utils/util');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// AI 推荐：与网页版空白棋盘（BlankBoardWorkspace）取值一致，压低深度/时间保证讲课时的响应速度
const HINT_DEPTH_CAP = 8;
const HINT_MULTIPV_CAP = 3;
const HINT_MOVETIME = 200;
const HINT_DEBOUNCE = 400;

Page({
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) this.setData({ __theme__: theme });
    } catch (e) { /* non-critical */ }
  },

  /** chess.js 实例：录制全过程的唯一真相来源（复盘跳转不会改动它） */
  _chess: null as any,

  /** AI 推荐：分析请求防抖计时器；被 analyzePosition 持有的「本次请求仍有效」标记 */
  _hintTimer: null as any,
  _hintSeq: 0,

  /** 后端分析是否已失败：失败后暂停「跟随走子自动刷新」，避免每步都发失败请求 */
  _hintFailed: false,

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    boardColorPreset: 'blueWhite',
    whiteName: '',
    blackName: '',
    eventName: '课堂对局',
    saving: false,
    saveError: '',
    saveResult: null as any,
    fen: START_FEN,
    // 走棋历史：moveHistoryRaw 给棋盘组件算最后一步高亮，moveItems 是列表显示项
    moveHistoryRaw: [] as any[],
    moveItems: [] as any[],
    moveCount: 0,
    selectedSquare: '',
    legalMoves: [] as string[],
    isCheck: false,
    boardFlip: false,
    // 复盘：>=0 表示正在查看历史某一步，-1 表示最新局面
    replayIndex: -1,
    statusText: '白方走棋',
    gameOverText: '',
    showPromotion: false,
    promotionFrom: '',
    promotionTo: '',
    promotionColor: 'w',
    // AI 推荐走法：默认关闭，用户点工具栏按钮才分析
    aiHintOn: false,
    analyzing: false,
    analysisCandidates: [] as any[],
    analysisError: '',
    /** 当前局面的走子方（'w' | 'b'）：评估条与候选评分按此视角显示 */
    turnSide: 'w',
  },

  onLoad() {
    this._chess = new Chess.Chess();
    let preset = 'blueWhite';
    try {
      preset = getApp()?.globalData?.settings?.boardColorPreset || 'blueWhite';
    } catch (e) { /* non-critical */ }
    this.setData({ boardColorPreset: preset, fen: this._chess.fen() });
    this.refreshState();
  },
  onReady() { this._syncTheme(); },
  onShow() { this._syncTheme(); },
  onUnload() {
    this.clearHintTimer();
    // 离开页面后异步结果不再有意义，递增序号让在途请求的回写作废
    this._hintSeq++;
  },

  onWhiteName(e: any) { this.setData({ whiteName: e.detail.value }); },
  onBlackName(e: any) { this.setData({ blackName: e.detail.value }); },
  onEventName(e: any) { this.setData({ eventName: e.detail.value }); },

  // ===== AI 推荐走法 =====
  /** 工具栏「🤖 AI提示」开关：开启即分析当前局面，关闭则清空棋盘上的推荐标记 */
  onToggleAIHint() {
    if (this.data.saving) return;
    // 已开启且上次分析失败 → 这一次当作「重试」，否则用户要先关再开才能重试
    if (this.data.aiHintOn && this._hintFailed) {
      this._hintFailed = false;
      this.setData({ analyzing: false, analysisCandidates: [], analysisError: '' });
      this.triggerAnalysis(true);
      return;
    }
    const on = !this.data.aiHintOn;
    // 关掉时递增序号，让在途请求的结果作废，避免箭头在关闭后又冒出来
    if (!on) this._hintSeq++;
    this._hintFailed = false;
    this.clearHintTimer();
    this.setData({
      aiHintOn: on,
      analyzing: false,
      analysisCandidates: [],
      analysisError: '',
    });
    if (on) this.triggerAnalysis(true);
  },

  clearHintTimer() {
    if (this._hintTimer) {
      clearTimeout(this._hintTimer);
      this._hintTimer = null;
    }
  },

  /** 清空推荐走法（局面已变，旧推荐不能再留在棋盘上） */
  clearAnalysis() {
    this.clearHintTimer();
    // 失败提示要留着：失败后自动跟随已暂停，用户需要看到原因才知道去点按钮重试
    const keepError = this._hintFailed;
    if (this.data.analysisCandidates.length > 0 || this.data.analyzing || (!keepError && this.data.analysisError)) {
      this.setData({
        analysisCandidates: [],
        analyzing: false,
        analysisError: keepError ? this.data.analysisError : '',
      });
    }
  },

  /**
   * 分析当前局面并回写推荐走法。
   * @param immediate 用户主动点击 → 立即请求；跟随走子 → 防抖，避免连走时请求风暴
   */
  triggerAnalysis(immediate: boolean) {
    // 复盘查看历史局面时不分析：推荐必须对应当前正在录制的局面
    if (!this.data.aiHintOn || this.data.replayIndex >= 0 || this.data.saving) return;
    // 后端已失败 → 暂停自动跟随，避免每步都发一次失败请求；用户再点按钮即重试
    if (!immediate && this._hintFailed) return;

    this.clearHintTimer();
    if (immediate) {
      this.runAnalysis();
    } else {
      this._hintTimer = setTimeout(() => {
        this._hintTimer = null;
        this.runAnalysis();
      }, HINT_DEBOUNCE);
    }
  },

  runAnalysis() {
    if (!this._chess) return;
    const fen = this._chess.fen();
    // 序号用于丢弃过期结果：期间又走了子 / 关了提示 / 离开了页面
    const seq = ++this._hintSeq;
    let settings: any = {};
    try { settings = getApp()?.globalData?.settings || {}; } catch (e) { /* non-critical */ }

    this.setData({ analyzing: true, analysisError: '' });

    api.analyzePosition({
      fen,
      depth: Math.min(settings.analysisDepth || 10, HINT_DEPTH_CAP),
      multiPv: Math.min(settings.analysisMultiPv || 3, HINT_MULTIPV_CAP),
      movetime: HINT_MOVETIME,
      pgn: this._chess.pgn(),
    })
      .then((res: any) => {
        if (seq !== this._hintSeq) return;
        this._hintFailed = false;
        // 录制页双方都能走子，没有「我方」：按当前走子方视角显示，
        // 此时 toPlayerView 为恒等变换（正分 = 对走子方有利），与网页版空白棋盘一致
        const playerSide = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        const candidates = (res?.data?.candidates || []).map((c: any, i: number) => {
          const score = typeof c.score === 'number' ? util.toPlayerView(c.score, fen, playerSide) : 0;
          return {
            ...c,
            rank: i + 1,
            score,
            scoreFormatted: util.formatScore(score),
            scoreColor: util.getScoreColor(score),
            // 字符串数组转带唯一键对象，避免 wx:key 重复告警
            pros: util.keyedList(c.pros, 'p' + (i + 1)),
            cons: util.keyedList(c.cons, 'c' + (i + 1)),
            tactics: util.keyedList(c.tactics, 't' + (i + 1)),
            line: util.keyedList(c.line, 'l' + (i + 1)),
          };
        });
        this.setData({
          analysisCandidates: candidates,
          analysisError: candidates.length > 0 ? '' : '引擎未返回推荐走法',
          analyzing: false,
        });
      })
      .catch((err: any) => {
        if (seq !== this._hintSeq) return;
        this._hintFailed = true;
        const msg = err?.message || '分析失败';
        const friendly = msg.indexOf('url not in domain list') !== -1 || msg.indexOf('fail') !== -1
          ? '引擎分析不可用（服务器未配置或未启动），再点「AI提示」可重试'
          : msg;
        this.setData({ analysisCandidates: [], analysisError: friendly, analyzing: false });
      });
  },

  /** 点击候选走法卡片 → 直接把这步走到棋盘上（可用「撤销」回退） */
  onPlayCandidate(e: any) {
    const uci = e.detail?.uci || e.currentTarget?.dataset?.uci || '';
    if (this.data.saving || this.data.replayIndex >= 0) return;
    if (typeof uci !== 'string' || uci.length < 4) return;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4) : '';
    // 引擎已给出升变子则直接走；否则交给 tryMove 弹升变选择
    if (promotion) this.executeMove(from, to, promotion);
    else this.tryMove(from, to);
  },

  /** 点击棋盘上的候选编号角标 → 滚动到对应候选卡片 */
  onScrollToCandidate(e: any) {
    const rank = e.detail?.rank;
    if (!rank) return;
    const panel = this.selectComponent('#boardRecordPanel');
    if (panel && panel.scrollToCandidate) panel.scrollToCandidate(rank);
  },

  // ===== 走子交互 =====
  onSquareTap(e: any) {
    if (this.data.saving) return;
    const square = e.detail?.square;
    if (!square || !this._chess) return;
    // 复盘模式下先回到最新局面，避免在历史局面上走子
    if (this.data.replayIndex >= 0) {
      this.setData({ replayIndex: -1 });
      this.refreshState();
      this.triggerAnalysis(false);
      return;
    }
    const chess = this._chess;
    const selected = this.data.selectedSquare;
    // 已选中棋子 + 点击合法目标 → 走子
    if (selected && this.data.legalMoves.indexOf(square) !== -1) {
      this.tryMove(selected, square);
      return;
    }
    // 再次点击已选中的格子 → 取消选中
    if (selected === square) {
      this.setData({ selectedSquare: '', legalMoves: [] });
      return;
    }
    // 点击棋子 → 选中（黑白双方都可录，不限制走子方）
    const piece = chess.get(square);
    if (piece) {
      const moves = chess.moves({ square, verbose: true }) as any[];
      this.setData({ selectedSquare: square, legalMoves: moves.map((m) => m.to) });
      return;
    }
    this.setData({ selectedSquare: '', legalMoves: [] });
  },

  tryMove(from: string, to: string) {
    const chess = this._chess;
    const piece = chess.get(from);
    // 兵走到底线 → 先选升变棋子
    if (piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      this.setData({
        showPromotion: true,
        promotionFrom: from,
        promotionTo: to,
        promotionColor: piece.color,
      });
      return;
    }
    this.executeMove(from, to, 'q');
  },

  executeMove(from: string, to: string, promotion: string) {
    const chess = this._chess;
    try {
      const move = chess.move({ from, to, promotion });
      if (!move) {
        wx.showToast({ title: '无效走法', icon: 'none' });
        return;
      }
    } catch (err: any) {
      wx.showToast({ title: '走棋失败: ' + (err?.message || ''), icon: 'none' });
      return;
    }
    this.setData({ selectedSquare: '', legalMoves: [], replayIndex: -1 });
    this.refreshState();
    // 局面已变：先清掉旧推荐，再按需重算，避免箭头停留在过期局面上
    this.clearAnalysis();
    this.triggerAnalysis(false);
  },

  onPromotionSelect(e: any) {
    const type = e.detail?.type || 'q';
    const from = this.data.promotionFrom;
    const to = this.data.promotionTo;
    this.setData({ showPromotion: false, promotionFrom: '', promotionTo: '' });
    if (from && to) this.executeMove(from, to, type);
  },
  onPromotionCancel() {
    this.setData({ showPromotion: false, promotionFrom: '', promotionTo: '' });
  },

  onUndo() {
    if (!this._chess || this.data.saving) return;
    if (this.data.replayIndex >= 0) {
      this.setData({ replayIndex: -1 });
      this.refreshState();
      this.clearAnalysis();
      this.triggerAnalysis(false);
      return;
    }
    const undone = this._chess.undo();
    if (!undone) {
      wx.showToast({ title: '没有可撤销的走法', icon: 'none' });
      return;
    }
    this.setData({ selectedSquare: '', legalMoves: [], saveResult: null, saveError: '' });
    this.refreshState();
    // 撤销回退到上一局面，旧推荐不再适用
    this.clearAnalysis();
    this.triggerAnalysis(false);
  },

  onFlip() {
    this.setData({ boardFlip: !this.data.boardFlip });
  },

  onClear() {
    if (this.data.saving) return;
    wx.showModal({
      title: '清空棋盘',
      content: '将丢弃当前所有走法，确定清空？',
      success: (res: any) => {
        if (!res.confirm) return;
        this._chess = new Chess.Chess();
        this.setData({
          selectedSquare: '',
          legalMoves: [],
          replayIndex: -1,
          showPromotion: false,
          saveResult: null,
          saveError: '',
        });
        this.refreshState();
        this.clearAnalysis();
        this.triggerAnalysis(false);
      },
    });
  },

  /** 把 chess 实例的当前状态同步到视图（局面/走棋列表/提示文案） */
  refreshState() {
    const chess = this._chess;
    if (!chess) return;
    const history = chess.history({ verbose: true }) as any[];
    const replayIndex = this.data.replayIndex;
    const moveItems = history.map((m: any, i: number) => ({
      label: (i % 2 === 0 ? (Math.floor(i / 2) + 1) + '. ' : '') + m.san,
      active: replayIndex >= 0 && replayIndex === i,
    }));
    // 复盘历史某步时显示那一步之后的局面；否则显示最新局面
    const viewingHistory = replayIndex >= 0 && !!history[replayIndex];
    const fen = viewingHistory ? history[replayIndex].after : chess.fen();
    // 状态文案按「当前显示的局面」判断，复盘时不会误报最新局面的将杀结果
    const view = viewingHistory ? new Chess.Chess(fen) : chess;
    let statusText: string;
    let gameOverText = '';
    if (view.isCheckmate()) {
      gameOverText = view.turn() === 'w' ? '黑方将杀获胜' : '白方将杀获胜';
      statusText = gameOverText;
    } else if (view.isStalemate()) {
      gameOverText = '逼和（无子可动）';
      statusText = gameOverText;
    } else if (view.isInsufficientMaterial()) {
      gameOverText = '和棋（子力不足）';
      statusText = gameOverText;
    } else if (view.isDraw()) {
      gameOverText = '和棋';
      statusText = gameOverText;
    } else {
      const toMove = view.turn() === 'w' ? '白方' : '黑方';
      const check = view.isCheck() ? '（被将军）' : '';
      statusText = viewingHistory
        ? '复盘中 · 第 ' + (replayIndex + 1) + ' 手 / 共 ' + history.length + ' 手'
        : toMove + '走棋' + check;
    }
    this.setData({
      fen,
      moveHistoryRaw: history,
      moveItems,
      moveCount: history.length,
      isCheck: view.isCheck(),
      statusText,
      gameOverText,
      // 评估条与候选评分按当前显示局面的走子方视角展示
      turnSide: view.turn() === 'b' ? 'b' : 'w',
    });
  },

  /** 点击走棋历史 → 棋盘跳到该步局面 */
  onMoveHistoryTap(e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx)) return;
    this.setData({ replayIndex: idx, selectedSquare: '', legalMoves: [] });
    this.refreshState();
    // 复盘时不保留推荐：箭头会画在正在查看的历史局面上，与推荐局面不一致
    this.clearAnalysis();
  },

  /** 退出复盘，回到最新局面 */
  onBackToLatest() {
    this.setData({ replayIndex: -1 });
    this.refreshState();
    this.clearAnalysis();
    this.triggerAnalysis(false);
  },

  /** 按当前局面推导 PGN 的 Result 标签 */
  resolveResultTag() {
    const chess = this._chess;
    if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
    if (chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
      return '1/2-1/2';
    }
    return '*';
  },

  /** 构建完整 PGN（头部标签 + 走法文本） */
  buildPgn() {
    const today = new Date().toISOString().split('T')[0];
    const headers = [
      '[White "' + (this.data.whiteName.trim() || '白方') + '"]',
      '[Black "' + (this.data.blackName.trim() || '黑方') + '"]',
      '[Date "' + today + '"]',
      '[Event "' + (this.data.eventName.trim() || '课堂对局') + '"]',
      '[Result "' + this.resolveResultTag() + '"]',
    ];
    // 走法文本必须取自记录走子的同一个实例：用当前 fen 新建实例会丢掉 history
    const moves = this._chess.pgn();
    return headers.join('\n') + '\n\n' + moves;
  },

  async onSave() {
    if (!this._chess || this.data.moveCount === 0) {
      wx.showToast({ title: '请先走棋', icon: 'none' });
      return;
    }
    this.setData({ saving: true, saveError: '', saveResult: null });
    try {
      const fullPgn = this.buildPgn();
      // recordType=classroom：空白棋盘录制属于个人录制，不进入大师棋谱公共库
      const res: any = await api.importChessRecords(fullPgn, 'classroom');
      const data = res?.data || res || {};
      const ids = data.ids || [];
      if (ids[0]) {
        this.setData({
          saveResult: { recordId: ids[0], pgn: fullPgn },
          saveError: '',
        });
        wx.showToast({ title: '已保存到我的棋谱', icon: 'success' });
      } else if (data.count > 0) {
        this.setData({ saveResult: { recordId: null, pgn: fullPgn }, saveError: '' });
        wx.showToast({ title: '已保存到我的棋谱', icon: 'success' });
      } else {
        const errors = data.errors || [];
        this.setData({ saveError: errors[0] || '导入失败，该棋谱可能已存在' });
      }
    } catch (err: any) {
      this.setData({ saveError: err?.message || '保存失败' });
    }
    this.setData({ saving: false });
  },

  /** 保存后直接进入复盘 */
  onViewSaved() {
    const saved = this.data.saveResult;
    if (!saved) return;
    const app = getApp();
    app.globalData._analysisGame = {
      recordId: saved.recordId,
      pgn: saved.pgn,
      white: this.data.whiteName.trim() || '白方',
      black: this.data.blackName.trim() || '黑方',
      event: this.data.eventName.trim() || '课堂对局',
      result: this.resolveResultTag(),
    };
    wx.navigateTo({ url: '/pages/analysis/analysis' });
  },

  onBack() {
    wx.navigateBack();
  },
});
export {};

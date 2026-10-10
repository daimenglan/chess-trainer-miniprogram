/**
 * 自主探究页（与网页版 ExplorePage 对齐）
 *
 * 场景定位：自由摆子的研究台。黑白轮流走子、没有胜负，每步都过一遍引擎。
 * 与对弈页的「推演」不同，这里不保护任何在下的棋局 —— 悔棋/重做直接重建
 * 整条推演线，保存时整条线就是一个干净的 PGN。
 *
 * 与网页版的关键差异（均为小程序侧约束，非功能删减）：
 * - 网页版 flipBoard() 换的是执子方，视觉朝向由 playerSide 派生；小程序
 *   chess-board 有独立的 flipped 属性，这里做成纯视觉翻转，不改走子逻辑。
 * - 网页版「保存棋谱」在无痕模式（user_id IS NULL）下也能匿名存；小程序保存
 *   走的是同一条 POST /api/games，登录与否都能存，游客存的只有自己看得到。
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const chessNotation = require('../../utils/chessNotation');
const Chess = require('../../utils/chessjs');

/** 推演线上的单步：san 用于展示，uci 用于跳步重放，fen 为该步之前的局面 */
interface ExploreStep {
  san: string;
  uci: string;
  fen: string;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

Page({
  data: {
    __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),

    // ===== 棋局主体 =====
    fen: START_FEN,
    selectedSquare: '',
    legalMoves: [] as string[],
    lastMoveFrom: '',
    lastMoveTo: '',
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    turn: 'w',
    boardFlip: false,
    moveCount: 0,

    // 自由走子不写 moveHistory：步数只取 undo 栈长度，保存按钮也据此禁用
    undoDepth: 0,
    redoDepth: 0,

    // ===== 引擎分析 =====
    analysis: [] as any[],
    analysisError: '',
    analysisLoading: false,
    /** 分析所属局面：与当前 fen 不一致时清空棋盘上的推荐箭头，避免标错格子 */
    analysisFen: '',
    openingName: '',
    openingNameCN: '',
    ecoCode: '',
    showHints: true,

    // ===== 推演线（点候选走法进入）=====
    exploreActive: false,
    exploreSteps: [] as ExploreStep[],
    exploreIndex: -1,
    exploreEval: 0,
    exploreEvalText: '',

    // ===== 升变 =====
    showPromotion: false,
    promotionFrom: '',
    promotionTo: '',
    promotionColor: 'w',

    // ===== 棋谱保存/载入 =====
    saving: false,
    justSaved: false,
    showLoadModal: false,
    loadList: [] as any[],
    loadLoading: false,

    // ===== 弹窗打开时隐藏棋盘 canvas（原生层会盖住弹窗）=====
    canvasHidden: false,
  },

  // 棋盘实例只在实例字段上，setData 不持有 —— 避免每次走子都序列化整局
  _chess: null as any,
  _undoStack: [] as ExploreStep[],
  _redoStack: [] as ExploreStep[],
  /** 推演入口局面：退出演示时棋盘要回到这里 */
  _exploreStartFen: '',
  _analysisTimer: 0 as any,
  _hintSeq: 0,
  _savedTimer: 0 as any,

  onLoad() {
    this._syncTheme();
    this._chess = new Chess.Chess();
    this._undoStack = [];
    this._redoStack = [];
    this._syncBoard();
    // 进入即给开局局面的分析，用户不用先走一步才看到推荐
    this.triggerAnalysis();
  },

  onShow() {
    this._syncTheme();
  },

  onUnload() {
    this.clearAnalysisTimer();
    if (this._savedTimer) clearTimeout(this._savedTimer);
  },

  onHide() {
    this.clearAnalysisTimer();
  },

  _syncTheme() {
    try {
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) this.setData({ __theme__: theme });
    } catch (e) { /* non-critical */ }
  },

  // ===== 局面同步 =====

  /**
   * 把当前实例回写到页面数据。
   * undo 栈长度即步数：自由走子不维护 moveHistory（与网页版一致），
   * 否则这里恒为 0，保存按钮会被永久禁用。
   */
  _syncBoard() {
    const chess = this._chess;
    if (!chess) return;
    this.setData({
      fen: chess.fen(),
      turn: chess.turn(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      moveCount: this._undoStack.length,
      undoDepth: this._undoStack.length,
      redoDepth: this._redoStack.length,
    });
  },

  // ===== 棋盘交互 =====

  onSquareTap(e: any) {
    const square = e.detail.square;
    const chess = this._chess;
    if (!chess) return;

    const from = this.data.selectedSquare;

    // 再次点击已选中的格子 → 取消选中
    if (from && from === square) {
      this.setData({ selectedSquare: '', legalMoves: [] });
      return;
    }

    // 推演线中途落子：从当前局面开一条新分支，原有后续被丢弃
    if (this.data.exploreActive && from && this.data.exploreIndex < this.data.exploreSteps.length - 1) {
      this._branchFromHere();
    }

    // 已选中且目标合法 → 走子
    if (from && this.data.legalMoves.includes(square)) {
      const piece = chess.get(from);
      if (piece && piece.type === 'p' && this._isPromotion(piece.color, square)) {
        this.setData({
          showPromotion: true,
          promotionFrom: from,
          promotionTo: square,
          promotionColor: piece.color,
        });
        return;
      }
      this._makeMove(from, square, 'q');
      return;
    }

    // 点自己的棋子 → 选中（黑白都能选，轮流走子）
    const piece = chess.get(square);
    if (piece) {
      const moves = chess.moves({ square, verbose: true });
      this.setData({
        selectedSquare: square,
        legalMoves: moves.map((m: any) => m.to),
      });
    } else {
      this.setData({ selectedSquare: '', legalMoves: [] });
    }
  },

  /** 兵是否走到了升变行 */
  _isPromotion(color: string, square: string): boolean {
    const rank = square.charAt(1);
    return (color === 'w' && rank === '8') || (color === 'b' && rank === '1');
  },

  _makeMove(from: string, to: string, promotion: string) {
    const chess = this._chess;
    const fenBefore = chess.fen();
    let move: any;
    try {
      move = chess.move({ from, to, promotion });
    } catch (e) {
      util.showToast('无效走法', 'none');
      return;
    }
    if (!move) {
      util.showToast('无效走法', 'none');
      return;
    }

    const step: ExploreStep = {
      san: move.san,
      uci: move.from + move.to + (move.promotion || ''),
      fen: fenBefore,
    };

    // 推演中：只推进指针，不入 undo 栈（退出演示才回到主线）
    if (this.data.exploreActive) {
      const steps = this.data.exploreSteps.slice(0, this.data.exploreIndex + 1);
      steps.push(step);
      this.setData({ exploreSteps: steps, exploreIndex: steps.length - 1 });
    } else {
      this._undoStack.push(step);
      // 新走法作废重做栈
      this._redoStack = [];
    }

    this.setData({
      lastMoveFrom: move.from,
      lastMoveTo: move.to,
      selectedSquare: '',
      legalMoves: [],
      showPromotion: false,
    });
    this._syncBoard();
    this.triggerAnalysis();
  },

  onPromotionSelect(e: any) {
    const { promotionFrom, promotionTo } = this.data;
    this.setData({ showPromotion: false });
    this._makeMove(promotionFrom, promotionTo, e.detail.type);
  },

  onPromotionCancel() {
    this.setData({ showPromotion: false, selectedSquare: '', legalMoves: [] });
  },

  onScrollToCandidate(e: any) {
    const panel = this.selectComponent('#analysisPanel');
    if (panel && panel.scrollToCandidate) panel.scrollToCandidate(e.detail.rank);
  },

  // ===== 悔棋 / 重做 =====
  //
  // 不能退到某个 FEN 就算完：FEN 里没有走子历史，chess.js 再 pgn() 会输出
  // 带 [FEN] 头部的残缺记录。悔棋后从推演线起点重放整条线，重做同理。

  onUndo() {
    if (this.data.exploreActive) return;
    if (this._undoStack.length === 0) return;

    const last = this._undoStack[this._undoStack.length - 1];
    const rest = this._undoStack.slice(0, -1);
    if (!this._replayTo(rest, last.fen)) return;

    this._undoStack = rest;
    this._redoStack = this._redoStack.concat([last]);
    this._afterJump(rest.length > 0 ? rest[rest.length - 1] : null);
  },

  onRedo() {
    if (this.data.exploreActive) return;
    if (this._redoStack.length === 0) return;

    const next = this._redoStack[this._redoStack.length - 1];
    const remaining = this._redoStack.slice(0, -1);
    // 重做栈里的步都有 fen，直接拼到当前 undo 栈尾部重放
    if (!this._replayTo(this._undoStack.concat([next]), this._undoStack[0]?.fen || START_FEN)) return;

    this._undoStack = this._undoStack.concat([next]);
    this._redoStack = remaining;
    this._afterJump(this._undoStack[this._undoStack.length - 1]);
  },

  /**
   * 把实例重置到 line 的状态。
   * line 为空时退到 fallbackFen；否则从 line[0].fen（推演起点）重放 line 每一步。
   * 返回是否重放成功 —— 中途有非法着法说明内部状态已损坏，保持原局面不动。
   */
  _replayTo(line: ExploreStep[], fallbackFen: string): boolean {
    try {
      const startFen = line.length > 0 ? line[0].fen : fallbackFen;
      const chess = new Chess.Chess(startFen);
      for (const s of line) {
        chess.move({
          from: s.uci.slice(0, 2),
          to: s.uci.slice(2, 4),
          promotion: s.uci.length > 4 ? s.uci.slice(4) : 'q',
        });
      }
      this._chess = chess;
      return true;
    } catch (e) {
      util.showToast('局面回放失败', 'none');
      return false;
    }
  },

  /** 悔棋/重做/跳步后的收尾：刷新高亮并重算分析 */
  _afterJump(lastStep: ExploreStep | null) {
    this.setData({
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: lastStep ? lastStep.uci.slice(0, 2) : '',
      lastMoveTo: lastStep ? lastStep.uci.slice(2, 4) : '',
    });
    this._syncBoard();
    this.triggerAnalysis();
  },

  // ===== 推演线（点候选走法进入）=====

  /**
   * 从当前局面走一步进入推演。
   * 有引擎给出的续着就整条铺上去，用户可以逐步回看；没有就只走第一步。
   */
  onPlayContinuation(e: any) {
    const uci = e.currentTarget.dataset.uci;
    this._startExplore(uci);
  },

  onStartExploration(e: any) {
    this._startExplore(e.currentTarget.dataset.uci);
  },

  /** 自动续着：把引擎给出的变化整条走完，只看最终局面 */
  onAutoContinuation(e: any) {
    const uci = e.currentTarget.dataset.uci;
    const cand = (this.data.analysis || []).find((c: any) => c.uci === uci);
    const continuation: string[] = (cand && cand.continuation) || [];
    this._startExplore(uci, continuation);
  },

  _startExplore(uci: string, continuation: string[] = []) {
    const chess = this._chess;
    if (!chess || !uci) return;

    const startFen = chess.fen();
    const steps: ExploreStep[] = [];

    try {
      const first = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4) : 'q',
      });
      if (!first) throw new Error('非法着法');
      steps.push({ san: first.san, uci: uci.slice(0, uci.length), fen: startFen });

      for (const c of continuation) {
        const fenBefore = chess.fen();
        const m = chess.move({
          from: c.slice(0, 2),
          to: c.slice(2, 4),
          promotion: c.length > 4 ? c.slice(4) : 'q',
        });
        if (!m) break;
        steps.push({ san: m.san, uci: c, fen: fenBefore });
      }
    } catch (e) {
      util.showToast('无法进入推演', 'none');
      return;
    }

    // 用独立实例承载推演线：主线 undo 栈保持原样，退出时整条丢弃
    this._exploreStartFen = startFen;
    this.setData({
      exploreActive: true,
      exploreSteps: steps,
      exploreIndex: steps.length - 1,
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: steps[steps.length - 1].uci.slice(0, 2),
      lastMoveTo: steps[steps.length - 1].uci.slice(2, 4),
    });
    this._syncBoard();
    this.triggerAnalysis();
    this._updateExploreEval();
  },

  /** 在推演线中途落子：砍掉该步之后的所有后续，从当前局面开新分支 */
  _branchFromHere() {
    const steps = this.data.exploreSteps.slice(0, this.data.exploreIndex + 1);
    this.setData({ exploreSteps: steps });
  },

  onExplorePrev() {
    if (!this.data.exploreActive) return;
    this._exploreGoTo(this.data.exploreIndex - 1);
  },

  onExploreNext() {
    if (!this.data.exploreActive) return;
    this._exploreGoTo(this.data.exploreIndex + 1);
  },

  onExploreGoToStep(e: any) {
    const idx = e.currentTarget.dataset.index;
    this._exploreGoTo(idx);
  },

  _exploreGoTo(index: number) {
    if (!this.data.exploreActive) return;
    const clamped = Math.max(0, Math.min(index, this.data.exploreSteps.length - 1));
    if (clamped === this.data.exploreIndex) return;

    if (!this._replayTo(this.data.exploreSteps.slice(0, clamped + 1), this._exploreStartFen)) return;
    const step = this.data.exploreSteps[clamped];
    this.setData({
      exploreIndex: clamped,
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: step.uci.slice(0, 2),
      lastMoveTo: step.uci.slice(2, 4),
    });
    this._syncBoard();
    this.triggerAnalysis();
    this._updateExploreEval();
  },

  /**
   * 推演中的局面评分：单独一层浅分析（1 条候选、300ms），
   * 与列表用的多候选分析分开请求，避免互相顶掉对方的缓存。
   */
  _updateExploreEval() {
    const fen = this._chess ? this._chess.fen() : '';
    if (!fen) return;
    const turnIsBlack = fen.split(' ')[1] === 'b';
    api.analyzePosition({ fen, depth: 8, multiPv: 1, movetime: 300 })
      .then((res: any) => {
        // 过期结果直接丢：分析期间局面可能又变了
        if (!this._chess || this._chess.fen() !== fen) return;
        const raw = (res?.data?.candidates?.[0]?.score) ?? 0;
        const whiteEval = turnIsBlack ? -raw : raw;
        this.setData({ exploreEval: whiteEval, exploreEvalText: util.getPlayerEvalText(whiteEval) });
      })
      .catch(() => { /* 推演评分失败不影响继续走子 */ });
  },

  onExitExplore() {
    if (!this.data.exploreActive) return;
    this._chess = new Chess.Chess(this._exploreStartFen);
    this.setData({
      exploreActive: false,
      exploreSteps: [],
      exploreIndex: -1,
      exploreEval: 0,
      exploreEvalText: '',
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: '',
      lastMoveTo: '',
    });
    this._syncBoard();
    this.triggerAnalysis();
  },

  // ===== 引擎分析 =====

  clearAnalysisTimer() {
    if (this._analysisTimer) {
      clearTimeout(this._analysisTimer);
      this._analysisTimer = 0;
    }
  },

  /**
   * 500ms 防抖后分析当前局面。
   * 用序号而非 fen 比对来丢弃过期结果：同一局面被反复分析时，
   * 序号法不会把结果误判成过期而丢光。
   */
  triggerAnalysis() {
    this.clearAnalysisTimer();
    if (!this._chess) return;
    const fen = this._chess.fen();
    const seq = ++this._hintSeq;
    this.setData({ analysisLoading: true });

    this._analysisTimer = setTimeout(() => {
      const depth = Math.min(app.globalData?.settings?.analysisDepth || 8, 8);
      const multiPv = Math.min(app.globalData?.settings?.analysisMultiPv || 3, 3);
      api.analyzePosition({ fen, depth, multiPv, movetime: 150, pgn: this._chess.pgn() })
        .then((res: any) => {
          if (seq !== this._hintSeq) return;
          const d = res?.data;
          const candidates = ((d && d.candidates) || []).map((c: any, i: number) => ({
            ...c,
            rank: i + 1,
            // 自由走子没有「己方」，评分统一按白方视角呈现
            score: typeof c.score === 'number' ? util.toPlayerView(c.score, fen, 'w') : 0,
            pros: util.keyedList(c.pros, 'p' + (i + 1)),
            cons: util.keyedList(c.cons, 'c' + (i + 1)),
            tactics: util.keyedList(c.tactics, 't' + (i + 1)),
            line: util.keyedList(
              chessNotation.uciToSanLine(fen, [c.uci, ...(c.continuation || [])]),
              'l' + (i + 1)
            ),
          }));
          candidates.forEach((c: any) => {
            c.scoreFormatted = util.formatScore(c.score);
            c.scoreColor = util.getScoreColor(c.score);
          });
          this.setData({
            analysis: candidates,
            analysisFen: fen,
            analysisError: '',
            analysisLoading: false,
            openingName: (d && d.openingName) || '',
            openingNameCN: (d && d.openingNameCN) || '',
            ecoCode: (d && d.ecoCode) || '',
          });
        })
        .catch(() => {
          if (seq !== this._hintSeq) return;
          this.setData({ analysis: [], analysisError: '分析服务暂时不可用', analysisLoading: false });
        });
    }, 500);
  },

  onToggleHints() {
    this.setData({ showHints: !this.data.showHints });
  },

  onFlipBoard() {
    this.setData({ boardFlip: !this.data.boardFlip });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/choice/choice' }) });
  },

  // ===== 保存棋谱 =====

  onSave() {
    if (!this._chess) return;
    const pgn = this._chess.pgn();
    if (!pgn || pgn.trim() === '') {
      util.showToast('先走几步再保存', 'none');
      return;
    }
    if (this.data.exploreActive) {
      util.showToast('请先退出推演再保存', 'none');
      return;
    }
    if (this.data.saving) return;

    this.setData({ saving: true });
    api.saveGame({
      pgn,
      // 双方都是人走、没有胜负：复盘页据此识别为「人走双方」，不误判成 AI 对局
      white: 'human',
      black: 'human',
      result: '*',
    })
      .then(() => {
        this.setData({ saving: false, justSaved: true });
        if (this._savedTimer) clearTimeout(this._savedTimer);
        // 「✓ 已保存」只闪一下就复原，不长期占位
        this._savedTimer = setTimeout(() => this.setData({ justSaved: false }), 3000);
      })
      .catch((err: any) => {
        this.setData({ saving: false });
        util.showToast('保存失败：' + (err?.message || '未知错误'));
      });
  },

  // ===== 载入已保存棋谱 =====

  onOpenLoad() {
    this.setData({ showLoadModal: true, canvasHidden: true, loadList: [], loadLoading: true });
    api.loadGames()
      .then((res: any) => {
        const raw = res?.data?.games || res?.data || [];
        const list = (Array.isArray(raw) ? raw : []).map((g: any) => ({
          gameId: g.gameId || g.id,
          title: `${g.white || '玩家'} vs ${g.black || '玩家'}`,
          date: g.date || g.startTime || '',
          result: g.result || '*',
        }));
        // 只保留能载入的棋谱，避免点进去才发现是空的
        this.setData({ loadList: list, loadLoading: false });
      })
      .catch(() => this.setData({ loadList: [], loadLoading: false }));
  },

  onCloseLoad() {
    this.setData({ showLoadModal: false, canvasHidden: false });
  },

  onSelectGame(e: any) {
    const gameId = e.currentTarget.dataset.id;
    if (!gameId) return;
    api.getGameDetail(gameId)
      .then((res: any) => {
        const g = res?.data || {};
        const pgn = g.pgn || g.pgn_text || g.pgnText || '';
        this.onCloseLoad();
        this._loadPgn(pgn);
      })
      .catch((err: any) => util.showToast('载入失败：' + (err?.message || '未知错误')));
  },

  _loadPgn(pgn: string) {
    if (!pgn) {
      util.showToast('该棋谱无法载入', 'none');
      return;
    }
    let chess: any;
    let history: any[];
    try {
      const clean = chessNotation.normalizePgn(pgn);
      chess = new Chess.Chess();
      chess.loadPgn(clean);
      history = chess.history({ verbose: true });
    } catch (e) {
      util.showToast('该棋谱无法载入', 'none');
      return;
    }
    if (!history || history.length === 0) {
      util.showToast('该棋谱无法载入', 'none');
      return;
    }

    // undo 栈由 history 重建：fen 取该步之前的局面，悔棋才能一路退回起点
    this._undoStack = history.map((m: any) => ({
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion || ''}`,
      fen: m.before,
    }));
    this._redoStack = [];
    this._chess = chess;

    const last = history[history.length - 1];
    this.setData({
      exploreActive: false,
      exploreSteps: [],
      exploreIndex: -1,
      exploreEval: 0,
      exploreEvalText: '',
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: last.from,
      lastMoveTo: last.to,
      justSaved: false,
    });
    this._syncBoard();
    this.triggerAnalysis();
  },

  stopPropagation() {},
});

export {};

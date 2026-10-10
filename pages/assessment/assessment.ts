/**
 * AI 定级测评页
 * 三步向导式流程：问卷测评 → 做题测评 → 对弈测评 → 综合报告
 * 每一步完成后自动保存进度，下次进来可继续完成。
 * 根据问卷回答结果评估出题难度，根据做题测评结果智能调整 AI 对弈引擎难度。
 */
const api = require('../../utils/api');
const { trackEvent } = require('../../utils/analytics');

function getAppSafe(): any {
  try {
    return typeof getApp === 'function' ? getApp() : null;
  } catch {
    return null;
  }
}

/** 找出对局中玩家执哪一方（后端把玩家统一标记为 'player' / '👤 我'） */
function detectPlayerSide(game: any): string {
  const isPlayer = (name?: string) => name === '👤 我' || (name || '').toLowerCase() === 'player';
  if (isPlayer(game.white)) return 'white';
  if (isPlayer(game.black)) return 'black';
  return 'white';
}

/** PGN 结果 + 执方 → 玩家视角的胜负 */
function outcomeFor(side: string, result: string): string {
  if (result === '1-0') return side === 'white' ? 'win' : 'loss';
  if (result === '0-1') return side === 'black' ? 'win' : 'loss';
  return 'draw';
}

Page({

  _syncTheme() {
    try {
      const app = getAppSafe();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    stage: 'intro' as string,
    questions: [] as any[],
    answers: {} as Record<string, string>,
    questionIndex: 0,
    session: null as any,
    report: null as any,
    history: [] as any[],
    error: null as any,
    busy: false,

    // 问卷
    currentQuestion: null as any,
    answeredCount: 0,
    optionList: [] as any[],
    displayIndex: 0,
    isLastQuestion: false,
    unansweredCount: 0,
    answeredPct: 0,
    loadingQuestions: false,

    // 再测
    retakingFromReportId: null as any,

    // 步骤进度条
    stepBarCollapsed: false,
    stepDone: [false, false, false, false] as boolean[],
    stepActive: [true, false, false, false] as boolean[],

    // 对弈定级
    recentGames: null as any,
    selectedGameIds: [] as number[],
    gamesWithCheck: [] as any[],
    reviewProgress: 0,
    reviewTotal: 0,
    reviewPct: 5,
    reviewing: false,
    multiGameCurrent: 0,
    multiGameTotal: 0,
    tooShortModal: null as any,

    // 习题定级（自适应 + 交互棋盘）
    puzzleIndex: 0,
    currentPuzzle: null as any,
    puzzleThemeText: '',
    puzzleDifficultyText: '',
    puzzlePct: 0,
    puzzleNextLabel: '下一题 →',
    attempt: null as any,
    puzzleLoading: false,
    hintUsed: false,
    hintSan: null as any,
    feedback: null as any,
    puzzleResults: [] as any[],
    // 交互棋盘字段
    selectedSquare: '',
    legalMoves: [] as string[],
    lastMoveFrom: '',
    lastMoveTo: '',
    _puzzleChess: null as any,

    // 生成进度
    generatingProgress: null as any,
    generatingMsg: '',

    // 报告
    confidencePct: 0,
    confidenceLabel: '',
    confidenceTip: '',
  },

  onLoad() {
    try {
      this._syncTheme();
    } catch(e) { /* non-critical */ }
    const app = getAppSafe();
    if (app && !app.globalData.token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.initAssessment().catch((err: any) => {
      console.error('initAssessment error:', err);
      this.setData({ loadingQuestions: false, error: err?.message || '定级数据加载失败，请重试' });
    });
  },

  onShow() {
    this._syncTheme();
  },

  async initAssessment() {
    this.setData({ loadingQuestions: true });
    let qError: string | null = null;
    const [qRes, hRes] = await Promise.all([
      api.getAssessmentQuestionnaire().catch((err: any) => {
        qError = err?.message || '获取定级问卷失败';
        return null;
      }),
      api.getAssessmentHistory().catch(() => []),
    ]);
    const questions = qRes?.data?.questions || [];
    const history = (hRes?.data || hRes || []).map((item: any) => ({
      ...item,
      completedAtShort: item.completedAt ? item.completedAt.split('T')[0] : '',
      confidencePct: Math.round((item.confidence || 0) * 100),
    }));
    this.setData({
      questions,
      history,
      loadingQuestions: false,
      error: questions.length === 0 ? (qError || '定级问卷暂时不可用，请稍后重试') : null,
    });

    // 恢复进行中的三步向导会话
    try {
      const active = await api.getCurrentAssessment();
      if (active?.data) {
        const s = active.data;
        if (s.mode === 'full' && s.status === 'in_progress') {
          this.setData({ session: s });
          const step = s.currentStep;
          if (step === 'puzzle') {
            this.setData({
              stage: 'puzzle',
              puzzleResults: [],
              puzzleIndex: 0,
              stepDone: [true, false, false, false],
              stepActive: [false, true, false, false],
              stepBarCollapsed: true,
            });
            this.fetchNextAdaptivePuzzle(null);
          } else if (step === 'game') {
            this.setData({
              stage: 'game',
              stepDone: [true, true, false, false],
              stepActive: [false, false, true, false],
              stepBarCollapsed: true,
            });
          } else if (step === 'completed') {
            // 已完成但页面刷新，尝试从 report 加载
            if (s.report) {
              this.loadReportData(s.report);
            }
          }
        }
      }
    } catch (e) {
      // 会话恢复失败不阻塞正常流程
    }
  },

  /** 重新拉取问卷 */
  async onReloadQuestionnaire() {
    this.setData({ loadingQuestions: true, error: null });
    try {
      const res = await api.getAssessmentQuestionnaire();
      const questions = res?.data?.questions || [];
      if (questions.length === 0) {
        this.setData({ loadingQuestions: false, error: '问卷内容为空，请稍后重试' });
        return;
      }
      this.setData({ questions, loadingQuestions: false, error: null, questionIndex: 0, stage: 'questionnaire' });
      this.syncCurrentQuestion();
    } catch (err: any) {
      this.setData({ loadingQuestions: false, error: err?.message || '获取定级问卷失败' });
    }
  },

  onRetryPuzzle() {
    const results = this.data.puzzleResults;
    this.fetchNextAdaptivePuzzle(results[results.length - 1] || null);
  },

  onBackIntro() {
    this.setData({ stage: 'intro', error: null });
  },

  syncCurrentQuestion() {
    const qs = this.data.questions || [];
    const idx = this.data.questionIndex;
    const cur = qs[idx] || null;
    const answers = this.data.answers || {};
    const answeredCount = Object.keys(answers).length;
    const optionList: any[] = cur && cur.options
      ? cur.options.map((o: any) => ({ ...o, selected: answers[cur.id] == o.value }))
      : [];
    this.setData({
      currentQuestion: cur,
      optionList,
      answeredCount,
      displayIndex: Math.min(idx + 1, qs.length),
      isLastQuestion: qs.length > 0 && idx >= qs.length - 1,
      unansweredCount: Math.max(0, qs.length - answeredCount),
      answeredPct: qs.length > 0 ? Math.round((answeredCount / qs.length) * 100) : 0,
    });
  },

  // ===== 介绍页 =====

  onStartQuestionnaire() {
    if ((this.data.questions || []).length === 0) {
      this.onReloadQuestionnaire();
      return;
    }
    // 埋点：开始定级测评（问卷环节）
    trackEvent('trial_start', { flow: 'questionnaire' });
    this.setData({
      questionIndex: 0,
      stage: 'questionnaire',
      stepDone: [false, false, false, false],
      stepActive: [true, false, false, false],
      stepBarCollapsed: false,
    });
    this.syncCurrentQuestion();
  },

  onViewLatestReport() {
    if (this.data.history.length === 0) return;
    const latest = this.data.history[0];
    this.loadReport(latest.assessmentId);
  },

  onViewHistory(e: any) {
    const id = e.currentTarget.dataset.id;
    this.loadReport(id);
  },

  async loadReport(id: number) {
    const res = await api.getAssessmentReport(id).catch(() => null);
    const report = res?.data || res;
    if (report) {
      this.loadReportData(report);
    } else {
      this.setData({ error: '获取报告失败' });
    }
  },

  loadReportData(report: any) {
    const confidencePct = Math.round(report.confidence * 100);
    const confidenceLabel = confidencePct >= 75 ? '高' : confidencePct >= 55 ? '中' : '偏低';
    report.completedAtShort = report.completedAt ? report.completedAt.split('T')[0] : '';
    this.setData({
      report,
      stage: 'report',
      confidencePct,
      confidenceLabel,
      confidenceTip: confidencePct >= 75 ? '数据充分' : '建议多测一次',
      stepDone: [true, true, true, true],
      stepActive: [false, false, false, false],
      stepBarCollapsed: false,
    });
  },

  // ===== 步骤进度条 =====

  onToggleStepBar() {
    this.setData({ stepBarCollapsed: !this.data.stepBarCollapsed });
  },

  // ===== 问卷 =====

  onPickOption(e: any) {
    const { qid, value } = e.currentTarget.dataset;
    const answers = { ...this.data.answers, [qid]: value };
    this.setData({ answers });
    this.syncCurrentQuestion();
    const last = Math.max(0, this.data.questions.length - 1);
    const nextIdx = Math.min(this.data.questionIndex + 1, last);
    if (nextIdx !== this.data.questionIndex) {
      setTimeout(() => {
        this.setData({ questionIndex: nextIdx });
        this.syncCurrentQuestion();
      }, 180);
    }
  },

  onPrevQuestion() {
    if (this.data.questionIndex > 0) {
      this.setData({ questionIndex: this.data.questionIndex - 1 });
      this.syncCurrentQuestion();
    }
  },

  onNextQuestion() {
    if (this.data.questionIndex < this.data.questions.length - 1) {
      this.setData({ questionIndex: this.data.questionIndex + 1 });
      this.syncCurrentQuestion();
    }
  },

  /** 提交问卷并创建三步向导式会话，进入做题阶段 */
  async onSubmitQuestionnaire() {
    if ((this.data.questions || []).length === 0) {
      this.onBackIntro();
      return;
    }
    if (this.data.answeredCount < this.data.questions.length) {
      this.setData({ error: `还有 ${this.data.questions.length - this.data.answeredCount} 题没作答` });
      return;
    }
    this.setData({ busy: true, error: null });
    try {
      let created: any;
      if (this.data.retakingFromReportId !== null) {
        const res = await api.retakeAssessment(this.data.retakingFromReportId, 'full');
        created = res?.data || res;
        this.setData({ retakingFromReportId: null });
      } else {
        const res = await api.startAssessment(this.data.answers, 'full');
        created = res?.data || res;
      }
      // 埋点：问卷提交成功
      trackEvent('questionnaire_submit');
      this.setData({
        session: created,
        puzzleResults: [],
        puzzleIndex: 0,
        puzzlePct: 0,
        puzzleNextLabel: '下一题 →',
        currentPuzzle: null,
        attempt: null,
        busy: false,
        error: null,
        stage: 'puzzle',
        stepDone: [true, false, false, false],
        stepActive: [false, true, false, false],
        selectedSquare: '',
        legalMoves: [],
        lastMoveFrom: '',
        lastMoveTo: '',
        _puzzleChess: null,
        hintUsed: false,
        hintSan: null,
        feedback: null,
      });
      this.fetchNextAdaptivePuzzle(null);
    } catch (err: any) {
      this.setData({ error: err.message || '创建定级会话失败', busy: false });
    }
  },

  // ===== 再测（保留二选一模式入口） =====

  async startSession(mode: string) {
    this.setData({ busy: true, error: null });
    try {
      let created: any;
      if (this.data.retakingFromReportId !== null) {
        const res = await api.retakeAssessment(this.data.retakingFromReportId, mode);
        created = res?.data || res;
        this.setData({ retakingFromReportId: null });
      } else {
        const res = await api.startAssessment(this.data.answers, mode);
        created = res?.data || res;
      }
      this.setData({
        session: created,
        puzzleResults: [],
        puzzleIndex: 0,
        puzzlePct: 0,
        puzzleNextLabel: '下一题 →',
        puzzleLoading: mode === 'puzzle',
        currentPuzzle: null,
        attempt: null,
        busy: false,
        error: null,
        selectedSquare: '',
        legalMoves: [],
        lastMoveFrom: '',
        lastMoveTo: '',
        _puzzleChess: null,
        stage: mode === 'game' ? 'game' : 'puzzle',
      });
      if (mode === 'puzzle') {
        this.fetchNextAdaptivePuzzle(null);
      }
    } catch (err: any) {
      this.setData({ error: err.message || '创建定级会话失败', busy: false });
    }
  },

  onStartGameMode() {
    this.startSession('game');
  },

  onStartPuzzleMode() {
    this.startSession('puzzle');
  },

  // ===== 对弈定级 =====

  onStartGame() {
    if (!this.data.session) return;
    const app = getAppSafe();
    if (app) {
      app.globalData.pendingAssessment = {
        assessmentId: this.data.session.assessmentId,
      };
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  syncGamesWithCheck() {
    const games: any[] = this.data.recentGames || [];
    const ids: number[] = this.data.selectedGameIds || [];
    this.setData({
      gamesWithCheck: games.map((g: any) => {
        const side = detectPlayerSide(g);
        let icon = '🤝';
        if (g.result === '1-0') icon = side === 'white' ? '🏆' : '💔';
        else if (g.result === '0-1') icon = side === 'black' ? '🏆' : '💔';
        return {
          ...g,
          checked: ids.indexOf(g.gameId) !== -1,
          icon,
          dateText: g.date || g.startTime || '',
          playerSide: side,
        };
      }),
    });
  },

  syncPuzzleTheme() {
    const puzzle = this.data.currentPuzzle?.puzzle;
    const themes: string[] = (puzzle && puzzle.themes) || [];
    const themeText = themes.length > 0 ? ' · ' + themes.slice(0, 2).join('、') : '';
    this.setData({
      puzzleThemeText: themeText,
      puzzleDifficultyText: puzzle ? `难度 ${puzzle.difficulty}${themeText}` : '',
    });
  },

  syncPuzzleNextLabel() {
    if (this.data.busy) {
      this.setData({ puzzleNextLabel: '正在生成定级报告…' });
      return;
    }
    this.setData({
      puzzleNextLabel: this.data.puzzleIndex + 1 >= 15 ? '🎯 完成作答，生成报告' : '下一题 →',
    });
  },

  async onScanGames() {
    this.setData({ busy: true, error: null });
    try {
      const res = await api.loadGames({ page: 1, pageSize: 50 });
      const games = res?.data || res || [];
      const finished = games.filter((g: any) => g.result && g.result !== '*' && g.pgn && g.pgn.includes('1.'));
      this.setData({
        recentGames: finished.slice(0, 10),
        selectedGameIds: [],
        busy: false,
      });
      this.syncGamesWithCheck();
      if (finished.length === 0) {
        this.setData({ error: '还没有找到已结束的对局。请先完成一局与 AI 的对弈。' });
      }
    } catch (err: any) {
      this.setData({ error: err.message || '读取对局记录失败', busy: false });
    }
  },

  onToggleGame(e: any) {
    const gameId = e.currentTarget.dataset.id;
    let selected = [...this.data.selectedGameIds];
    const idx = selected.indexOf(gameId);
    if (idx !== -1) {
      selected.splice(idx, 1);
    } else {
      selected.push(gameId);
    }
    this.setData({ selectedGameIds: selected });
    this.syncGamesWithCheck();
  },

  onToggleAll() {
    const allIds = (this.data.recentGames || []).map((g: any) => g.gameId);
    const current = this.data.selectedGameIds;
    if (current.length === allIds.length) {
      this.setData({ selectedGameIds: [] });
    } else {
      this.setData({ selectedGameIds: allIds });
    }
    this.syncGamesWithCheck();
  },

  async onAnalyzeMultiGames() {
    if (!this.data.session || this.data.selectedGameIds.length === 0) return;
    this.setData({ reviewing: true, reviewProgress: 0, reviewTotal: 0, error: null, multiGameCurrent: 0 });

    try {
      const gamesToAnalyze = (this.data.recentGames || []).filter(
        (g: any) => this.data.selectedGameIds.indexOf(g.gameId) !== -1
      );
      this.setData({ multiGameTotal: gamesToAnalyze.length });
      const allResults: any[] = [];

      // 埋点：批量分析选中的对局
      trackEvent('assessment_batch_analyze', { count: gamesToAnalyze.length });

      for (let gi = 0; gi < gamesToAnalyze.length; gi++) {
        const game = gamesToAnalyze[gi];
        this.setData({ multiGameCurrent: gi + 1 });
        const playerSide = detectPlayerSide(game);
        const playerColor = playerSide === 'white' ? 'w' : 'b';

        const reviews = await this.reviewGame(game, playerColor);

        if (reviews.length === 0) continue;

        const count = (kind: string) => reviews.filter((r: any) => r.classification === kind).length;
        const losses = reviews.map((r: any) => Math.max(0, Math.min(10, r.loss || 0)));
        const avgLoss = losses.reduce((s: number, v: number) => s + v, 0) / reviews.length;

        const difficulty = game.difficulty || this.data.session.suggestedDifficulty;
        allResults.push({
          gameId: game.gameId,
          difficulty,
          result: outcomeFor(playerSide, game.result),
          playerSide,
          moveCount: game.moveHistory?.length || 0,
          metrics: {
            total: reviews.length,
            best: count('best'),
            good: count('good'),
            inaccuracy: count('inaccuracy'),
            mistake: count('mistake'),
            blunder: count('blunder'),
            avgLoss: Number(avgLoss.toFixed(3)),
          },
        });
      }

      if (allResults.length === 0) {
        this.setData({ error: '所有选中对局均无法分析', reviewing: false });
        return;
      }

      const res = await api.submitMultiGameMetrics(this.data.session.assessmentId, allResults);
      const report = res?.data || res;
      if (report) {
        this.loadReportData(report);
        this.setData({ reviewing: false });
        api.getAssessmentHistory().then((h: any) => this.setData({ history: h?.data || h || [] }));
      }
    } catch (err: any) {
      const msg = err.message || '多局复盘分析失败';
      if (msg.includes('不满 20 回合') || msg.includes('仅')) {
        this.setData({ tooShortModal: { open: true, moves: 0 } });
      } else {
        this.setData({ error: msg });
      }
      this.setData({ reviewing: false });
    }
  },

  reviewGame(game: any, playerColor: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const Chess = require('../../utils/chessjs');
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history({ verbose: true });
        const playerMoves = history
          .filter((m: any) => m.color === playerColor)
          .map((m: any) => ({ uci: m.from + m.to + (m.promotion || ''), fenBefore: m.before }));

        if (playerMoves.length === 0) { resolve([]); return; }

        const collected: any[] = [];
        const total = playerMoves.length;
        this.setData({ reviewTotal: total, reviewProgress: 0, reviewPct: 5 });

        api.reviewGameStream(
          playerMoves,
          {
            onReview: (review: any) => {
              collected.push(review);
              this.setData({
                reviewProgress: collected.length,
                reviewPct: Math.min(100, Math.round((collected.length / Math.max(1, total)) * 100)),
              });
            },
            onDone: () => resolve(collected),
            onError: (err: Error) => reject(err),
          },
          12, 220
        );
      } catch (e) {
        resolve([]);
      }
    });
  },

  onDismissTooShort() {
    this.setData({ tooShortModal: null, reviewing: false });
  },

  // ===== 习题定级（自适应 + 交互棋盘）=====

  async fetchNextAdaptivePuzzle(lastResult: any) {
    if (!this.data.session) return;
    this.setData({
      puzzleLoading: true,
      feedback: null,
      hintUsed: false,
      hintSan: null,
      attempt: null,
      error: null,
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: '',
      lastMoveTo: '',
      _puzzleChess: null,
    });
    try {
      const res = await api.getAdaptiveNextPuzzle(this.data.session.assessmentId, lastResult);
      const next = res?.data || res;
      this.setData({ currentPuzzle: next });
      this.syncPuzzleTheme();

      if (next.done || !next.puzzle) {
        this.finishPuzzleAssessment();
        return;
      }

      const stateRes = await api.startPuzzle({ puzzleId: next.puzzle.id });
      const state = stateRes?.data || stateRes;
      // 初始化本地 chess.js 实例用于交互走子判断
      const Chess = require('../../utils/chessjs');
      const chess = new Chess(state.fen);

      this.setData({
        attempt: state,
        puzzleIndex: next.doneCount,
        puzzleLoading: false,
        puzzlePct: Math.min(100, Math.round((next.doneCount / 15) * 100)),
        _puzzleChess: chess,
      });
      this.syncPuzzleNextLabel();
    } catch (err: any) {
      this.setData({ error: err.message || '加载题目失败', puzzleLoading: false });
    }
  },

  /** 棋盘点击 - 选择/走子 */
  onPuzzleSquareTap(e: any) {
    if (!this.data.attempt || this.data.attempt.completed || this.data.busy) return;
    const square = e.detail.square;
    const chess = this.data._puzzleChess;
    if (!chess) return;

    // 取消选中
    if (this.data.selectedSquare === square) {
      this.setData({ selectedSquare: '', legalMoves: [] });
      return;
    }

    // 如果已有选中格且点击目标在合法走法内 → 走子
    if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
      this.submitPuzzleMove(this.data.selectedSquare, square);
      return;
    }

    // 选中己方棋子（根据 orientation 决定）
    const playerColor = this.data.attempt.orientation === 'black' ? 'b' : 'w';
    const piece = chess.get(square);
    if (piece && piece.color === playerColor) {
      const moves = chess.moves({ square, verbose: true });
      this.setData({
        selectedSquare: square,
        legalMoves: moves.map((m: any) => m.to),
      });
    }
  },

  /** 提交走法到 API */
  async submitPuzzleMove(from: string, to: string) {
    const uci = from + to;
    const chess = this.data._puzzleChess;
    this.setData({ selectedSquare: '', legalMoves: [] });
    try {
      const res = await api.submitPuzzleMove(this.data.attempt.attemptId, uci);
      const data = res?.data || res;
      if (!data) return;

      if (data.completed) {
        const puzzle = this.data.currentPuzzle?.puzzle;
        if (puzzle) {
          const record = {
            puzzleId: puzzle.id,
            difficulty: puzzle.difficulty,
            result: data.result ?? 0,
            hintUsed: this.data.hintUsed || this.data.attempt.usedHint,
          };
          const results = [
            ...this.data.puzzleResults.filter((r: any) => r.puzzleId !== puzzle.id),
            record,
          ];
          this.setData({ puzzleResults: results });
          // 更新棋盘局面
          let lastFrom = '', lastTo = '';
          try {
            chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
            lastFrom = uci.slice(0, 2);
            lastTo = uci.slice(2, 4);
            if (data.opponentMoveUci) {
              chess.move({
                from: data.opponentMoveUci.slice(0, 2),
                to: data.opponentMoveUci.slice(2, 4),
                promotion: data.opponentMoveUci.length > 4 ? data.opponentMoveUci.slice(4) : 'q',
              });
              lastFrom = data.opponentMoveUci.slice(0, 2);
              lastTo = data.opponentMoveUci.slice(2, 4);
            }
          } catch (e) { /* non-critical */ }
          this.setData({
            attempt: {
              ...this.data.attempt,
              fen: data.nextFen || chess.fen(),
              completed: true,
              failed: (data.result ?? 0) === 0,
            },
            feedback: (data.result ?? 0) === 2
              ? { text: '🎉 完全正确！', tone: 'ok' }
              : (data.result ?? 0) === 1
                ? { text: '👍 部分正确，思路对了但没算全', tone: 'ok' }
                : { text: '❌ 这题没做对，没关系，继续下一题', tone: 'bad' },
            lastMoveFrom: lastFrom,
            lastMoveTo: lastTo,
          });
          this.syncPuzzleNextLabel();
        }
      } else if (!data.legal) {
        this.setData({ feedback: { text: `这一步不合规则：${data.message}`, tone: 'bad' } });
      } else if (data.failed) {
        this.setData({ feedback: { text: `❌ ${data.message}`, tone: 'bad' } });
      } else if (!data.correct) {
        this.setData({ feedback: { text: `❌ ${data.message || '走法不正确'}`, tone: 'bad' } });
      } else {
        // 正确但未完成（对手还没有回应），更新局面
        let lastFrom = '', lastTo = '';
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
          lastFrom = uci.slice(0, 2);
          lastTo = uci.slice(2, 4);
          if (data.opponentMoveUci) {
            chess.move({
              from: data.opponentMoveUci.slice(0, 2),
              to: data.opponentMoveUci.slice(2, 4),
              promotion: data.opponentMoveUci.length > 4 ? data.opponentMoveUci.slice(4) : 'q',
            });
            lastFrom = data.opponentMoveUci.slice(0, 2);
            lastTo = data.opponentMoveUci.slice(2, 4);
          }
        } catch (e) { /* non-critical */ }
        this.setData({
          attempt: {
            ...this.data.attempt,
            fen: data.nextFen || chess.fen(),
          },
          _puzzleChess: chess,
          lastMoveFrom: lastFrom,
          lastMoveTo: lastTo,
          feedback: null,
        });
      }
    } catch (err: any) {
      this.setData({ feedback: { text: err.message || '提交失败，请重试', tone: 'bad' } });
    }
  },

  onRequestHint() {
    if (!this.data.attempt || this.data.hintUsed) return;
    api.requestPuzzleHint(this.data.attempt.attemptId)
      .then((res: any) => {
        const hint = res?.data || res;
        this.setData({ hintSan: hint.san || hint.hint, hintUsed: true });
      })
      .catch(() => {
        this.setData({ feedback: { text: '获取提示失败', tone: 'bad' } });
      });
  },

  onNextPuzzle() {
    const results = this.data.puzzleResults;
    const lastRecord = results[results.length - 1];
    this.fetchNextAdaptivePuzzle(lastRecord || null);
  },

  async finishPuzzleAssessment() {
    if (!this.data.session) return;
    this.setData({ busy: true, generatingProgress: 0, generatingMsg: '分析答题数据…' });
    this.syncPuzzleNextLabel();

    const stages = [
      { at: 0, msg: '📊 分析答题数据…' },
      { at: 15, msg: '🧮 计算等级分…' },
      { at: 35, msg: '📐 评估置信区间…' },
      { at: 50, msg: '🎭 分析棋风特征…' },
      { at: 65, msg: '⚠️ 识别优劣势…' },
      { at: 80, msg: '📈 生成训练建议…' },
      { at: 92, msg: '🎯 生成定级报告…' },
    ];
    let stageIdx = 0;
    const progressTimer = setInterval(() => {
      const next = Math.min(95, (this.data.generatingProgress || 0) + 2 + Math.round(Math.random() * 4));
      while (stageIdx < stages.length - 1 && next >= stages[stageIdx + 1].at) stageIdx++;
      this.setData({ generatingProgress: next, generatingMsg: stages[stageIdx].msg });
    }, 400);

    try {
      const isFullFlow = this.data.session.mode === 'full';

      if (isFullFlow) {
        // 三步向导式：保存做题中间结果，进入对弈阶段
        const res = await api.submitPuzzleResultsForFullFlow(
          this.data.session.assessmentId,
          this.data.puzzleResults
        );
        clearInterval(progressTimer);
        const result = res?.data || res;
        // 更新 session 中的推荐难度
        this.setData({
          session: {
            ...this.data.session,
            puzzleElo: result.puzzleElo,
            suggestedDifficulty: result.suggestedDifficulty,
            currentStep: 'game',
          },
          stage: 'game',
          generatingProgress: null,
          generatingMsg: '',
          busy: false,
          stepDone: [true, true, false, false],
          stepActive: [false, false, true, false],
          recentGames: null,
          selectedGameIds: [],
          reviewProgress: 0,
          reviewTotal: 0,
          error: null,
        });
      } else {
        // 经典模式（兼容旧会话）：直接生成完整报告
        const res = await api.submitPuzzleResults(
          this.data.session.assessmentId,
          this.data.puzzleResults
        );
        clearInterval(progressTimer);
        const report = res?.data || res;
        if (report) {
          this.setData({ generatingProgress: 100, generatingMsg: '✅ 报告生成完毕！' });
          await new Promise((r) => setTimeout(r, 600));
          this.loadReportData(report);
          api.getAssessmentHistory().then((h: any) => this.setData({ history: h?.data || h || [] }));
        }
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      this.setData({
        error: err.message || '生成定级报告失败',
        generatingProgress: null,
        busy: false,
        puzzleLoading: false,
        currentPuzzle: null,
        attempt: null,
      });
    }
  },

  // ===== 报告页操作 =====

  onGoTraining() {
    wx.navigateTo({ url: '/pages/training-plan/training-plan' });
  },

  async onRetake() {
    if (!this.data.report) return;
    this.setData({ retakingFromReportId: this.data.report.assessmentId, stage: 'mode' });
    if (this.data.session) {
      await api.abandonAssessment(this.data.session.assessmentId).catch(() => {});
    }
    this.setData({
      session: null,
      recentGames: null,
      selectedGameIds: [],
      reviewProgress: 0,
      reviewTotal: 0,
      attempt: null,
      feedback: null,
      puzzleResults: [],
    });
  },

  onBackHistory() {
    this.setData({ stage: 'intro' });
  },

  onDismissError() {
    this.setData({ error: null });
  },

  onRestart() {
    if (this.data.session) {
      api.abandonAssessment(this.data.session.assessmentId).catch(() => {});
    }
    this.setData({
      stage: 'intro',
      session: null,
      report: null,
      answers: {},
      questionIndex: 0,
      answeredCount: 0,
      recentGames: null,
      selectedGameIds: [],
      reviewProgress: 0,
      reviewTotal: 0,
      attempt: null,
      feedback: null,
      puzzleResults: [],
      currentPuzzle: null,
      puzzleLoading: false,
      error: null,
      retakingFromReportId: null,
      hintUsed: false,
      hintSan: null,
      generatingProgress: null,
      selectedSquare: '',
      legalMoves: [],
      lastMoveFrom: '',
      lastMoveTo: '',
      _puzzleChess: null,
      stepDone: [false, false, false, false],
      stepActive: [true, false, false, false],
      stepBarCollapsed: false,
      tooShortModal: null,
      multiGameCurrent: 0,
      multiGameTotal: 0,
    });
    this.syncCurrentQuestion();
  },
});
export {}
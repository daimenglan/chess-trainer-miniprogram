/**
 * 首页/游戏页
 * 核心游戏逻辑：对弈、推演、重演、分析
 */
const Chess = require('../../utils/chessjs');
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const chessNotation = require('../../utils/chessNotation');
const localAI = require('../../utils/localAI');

// 时间预设
const TIME_PRESETS = [
  { label: '不限时', mode: 'none', time: 0, inc: 0 },
  { label: '1分钟', mode: 'total_time', time: 60, inc: 0 },
  { label: '3分钟', mode: 'total_time', time: 180, inc: 0 },
  { label: '5分钟', mode: 'total_time', time: 300, inc: 0 },
  { label: '10分钟', mode: 'total_time', time: 600, inc: 0 },
  { label: '15+10', mode: 'total_time', time: 900, inc: 10 },
];

interface MoveHistoryItem {
  from: string;
  to: string;
  san: string;
  promotion: string;
  piece: string;
  captured: string;
  aiExplanation?: string;
}

Page({
  data: {
    TIME_PRESETS,

    // 棋盘状态
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '',
    turn: 'w',
    playerSide: 'w',
    aiSide: 'b',
    difficulty: 5,
    isAIThinking: false,
    gameStarted: false,
    gameOver: false,
    result: 'playing',
    resultLabel: '',
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    moveHistory: [] as MoveHistoryItem[],
    moveReviews: {} as Record<number, any>,

    // 设置
    settings: app.globalData.settings || app.getDefaultSettings(),

    // 时间控制
    timeControlMode: 'none',
    initialTime: 0,
    timeIncrement: 0,
    whiteTime: 0,
    blackTime: 0,
    timerActiveSide: '',
    timerRunning: false,
    showTimeOptions: false,
    currentTimeLabel: '不限时',

    // 选中和走子
    selectedSquare: '',
    legalMoves: [] as string[],

    // 分析
    analysis: [] as any[],
    analysisError: '',
    openingName: '',
    openingNameCN: '',
    ecoCode: '',
    commentary: '',
    commentaryLoading: false,

    // 推演模式
    explorationMode: '',
    explorationSteps: [] as any[],
    explorationStepIndex: -1,
    explorationFen: '',

    // 重演
    replayIndex: -1,
    isReplay: false,

    // 弹窗
    showPromotion: false,
    promotionFrom: '',
    promotionTo: '',
    showBadMove: false,
    badMoveData: {
      moveDesc: '',
      userScore: 0,
      bestScore: 0,
      loss: 0,
      uci: '',
      fenBefore: '',
    },
    showGameOver: false,

    // 底部分析/棋谱面板
    activePanel: 'analysis',

    // 棋盘翻转
    boardFlipped: false,

    // 全屏提示模式
    showHintsFull: false,
    scrollTargetHints: '',

    // 右上角下拉菜单
    showMoreMenu: false,

    // 离线模式（后端不可用时本地AI对弈）
    offlineMode: false,
  },

  // chess.js 实例
  _chess: null as any,
  _timerInterval: null as any,
  _analysisTimer: null as any,
  _pendingMove: null as any,
  _lightMoves: [] as MoveHistoryItem[],
  _explorationChess: null as any,
  _reviewAbort: null as any,

onLoad(options: any) {
    // 从模式选择页跳转过来，直接开始AI对弈（switchTab 传参）
    if (options?.startAI === '1') {
      this._chess = new Chess.Chess();
      this._lightMoves = [];
      this.setData({
        settings: app.globalData.settings || app.getDefaultSettings(),
        boardFlipped: app.globalData.settings?.boardFlipped || false,
      });
      this.updateBoardState();
      setTimeout(() => this.onNewGame(), 100);
      return;
    }
    // 已登录用户重定向到模式选择页（但不要在从选择页跳转回来时重定向）
    if (app.globalData.pendingStartAI) {
      // 从选择页 switchTab 跳转过来，不重定向，由 onShow 处理
      return;
    }
    const token = (wx as any).getFileSync?.('auth_token') || (wx as any).getFileSync?.('authToken');
    if (token) {
      wx.redirectTo({ url: '/pages/choice/choice' });
      return;
    }
    this._chess = new Chess.Chess();
    this._lightMoves = [];
    this.setData({
      settings: app.globalData.settings || app.getDefaultSettings(),
      boardFlipped: app.globalData.settings?.boardFlipped || false,
    });
    this.updateBoardState();
  },

  onUnload() {
    this.clearTimer();
    this.clearAnalysisTimer();
  },

  onShow() {
    // 从模式选择页通过 switchTab 跳转过来，开始AI对弈
    if (app.globalData.pendingStartAI) {
      app.globalData.pendingStartAI = false;
      this._chess = new Chess.Chess();
      this._lightMoves = [];
      this.setData({
        settings: app.globalData.settings || app.getDefaultSettings(),
        boardFlipped: app.globalData.settings?.boardFlipped || false,
      });
      this.updateBoardState();
      setTimeout(() => this.onNewGame(), 100);
      return;
    }
    this.setData({
      settings: app.globalData.settings || app.getDefaultSettings(),
    });
  },

  // 用于WXML模板调用的辅助方法
  translateResult(result: string): string {
    return util.translateResult(result);
  },

  // ===== 棋盘事件 =====
  onSquareTap(e: any) {
    if (this.data.isAIThinking || this.data.gameOver) return;

    const square = e.detail.square;
    const chess = this._chess;

    // 推演模式：自由走子
    if (this.data.explorationMode) {
      this.handleExplorationMove(square);
      return;
    }

    // 重演模式：不响应
    if (this.data.isReplay) return;

    // 检查是否该玩家走子
    const isPlayerTurn = (this.data.playerSide === 'w' && chess.turn() === 'w') ||
                         (this.data.playerSide === 'b' && chess.turn() === 'b');
    if (!isPlayerTurn) return;

    // 点击已选中的格子 → 取消选中
    if (this.data.selectedSquare === square) {
      this.setData({ selectedSquare: '', legalMoves: [] });
      return;
    }

    // 如果已选中一个棋子，且点击的是合法目标 → 走子
    if (this.data.selectedSquare && this.data.legalMoves.includes(square)) {
      this.tryMove(this.data.selectedSquare, square);
      return;
    }

    // 点击自己的棋子 → 选中它
    const piece = chess.get(square);
    if (piece && piece.color === this.data.playerSide) {
      const moves = chess.moves({ square, verbose: true });
      this.setData({
        selectedSquare: square,
        legalMoves: moves.map((m: any) => m.to),
      });
    }
  },

  // ===== 走子逻辑 =====
  tryMove(from: string, to: string, promotion: string = 'q') {
    const chess = this._chess;

    // 检查升变
    const piece = chess.get(from);
    if (piece && piece.type === 'p') {
      const targetRank = to[1];
      if ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1')) {
        this.setData({
          showPromotion: true,
          promotionFrom: from,
          promotionTo: to,
        });
        return;
      }
    }

    this.executeMove(from, to, promotion);
  },

  executeMove(from: string, to: string, promotion: string) {
    const chess = this._chess;
    const fen = chess.fen();

    try {
      const move = chess.move({ from, to, promotion });
      if (!move) {
        util.showToast('无效走法', 'none');
        return;
      }

      // 记录轻量走法
      this._lightMoves.push({
        from: move.from,
        to: move.to,
        san: move.san,
        promotion: move.promotion || '',
        piece: move.piece,
        captured: move.captured || '',
      });

      // 构建UCI
      const uci = move.from + move.to + (move.promotion || '');

      // 更新棋盘
      const chessData = this.getBoardData(chess);
      this.setData({
        ...chessData,
        selectedSquare: '',
        legalMoves: [],
      });

      // 保存游戏
      this.saveGameIfNeeded();

      // 检查游戏结束
      if (chess.isGameOver()) {
        this.handleGameOver();
        return;
      }

      // AI走棋
      this.requestAIMove();

      // 走法质量分析延迟执行
      setTimeout(() => {
        this.checkMoveQuality(fen, uci, move);
      }, 100);

    } catch (e) {
      console.error('Move error:', e);
      util.showToast('走棋失败: ' + (e as Error).message, 'none');
    }
  },

  onPromotionSelect(e: any) {
    const type = e.detail.type;
    const from = this.data.promotionFrom;
    const to = this.data.promotionTo;
    this.setData({ showPromotion: false });
    this.executeMove(from, to, type);
  },

  onPromotionCancel() {
    this.setData({ showPromotion: false });
  },

  // ===== 走法质量检查 =====
  checkMoveQuality(fenBefore: string, uci: string, move: any) {
    api.analyzeMove({ fen: fenBefore, uci, depth: this.data.settings.analysisDepth || 10 })
      .then((res: any) => {
        if (res?.data && res.data.lossVsBest > 0.5) {
          const desc = chessNotation.describeMove(fenBefore, uci);
          this.setData({
            showBadMove: true,
            badMoveData: {
              fenBefore,
              moveDesc: `${desc.pieceName} ${uci.slice(0, 2)}→${uci.slice(2, 4)}（${desc.san}）`,
              userScore: res.data.score,
              bestScore: res.data.bestScore || 0,
              loss: res.data.lossVsBest,
              uci: uci,
            },
          });
        }
      })
      .catch(() => {});
  },

  onBadMoveExplore() {
    this.setData({ showBadMove: false });
    this.startExploration(this.data.badMoveData.uci);
  },

  onBadMoveConfirm() {
    this.setData({ showBadMove: false });
  },

  onBadMoveCancel() {
    this.setData({ showBadMove: false });
    this._chess.undo();
    this._lightMoves.pop();
    this.updateBoardState();
  },

  // ===== AI 走棋 =====
  requestAIMove() {
    const chess = this._chess;
    const fen = chess.fen();

    this.setData({ isAIThinking: true });

    api.requestAIMove(fen, this.data.difficulty)
      .then((res: any) => {
        this.setData({ offlineMode: false });
        if (!res?.data?.bestMove) {
          // 后端正常但未返回走法，走本地
          this.playLocalAIMove(fen);
          return;
        }
        this.applyAIMove(res.data.bestMove, fen);
      })
      .catch((err: any) => {
        // 后端不可用（真机未配置合法域名 / 服务器未启动）→ 降级本地AI
        console.warn('AI request failed, fallback to local engine:', err && err.message);
        this.playLocalAIMove(fen);
      });
  },

  /**
   * 应用一步 AI 走法（UCI），服务器与本地引擎共用
   */
  applyAIMove(bestMove: string, fenBefore: string) {
    const chess = this._chess;
    try {
      const move = chess.move({
        from: bestMove.slice(0, 2),
        to: bestMove.slice(2, 4),
        promotion: bestMove.length > 4 ? bestMove.slice(4) : 'q',
      });

      if (move) {
        this._lightMoves.push({
          from: move.from,
          to: move.to,
          san: move.san,
          promotion: move.promotion || '',
          piece: move.piece,
          captured: move.captured || '',
        });

        this.updateBoardState();
        this.setData({
          moveHistory: this._lightMoves.slice(),
          isAIThinking: false,
        });
        this.saveGameIfNeeded();

        if (!this.data.offlineMode) {
          setTimeout(() => {
            api.getAiMoveExplanation(fenBefore, bestMove, 10)
              .then((exp: any) => {
                if (exp?.data?.explanation) {
                  const history = this.data.moveHistory;
                  if (history.length > 0) {
                    history[history.length - 1].aiExplanation = exp.data.explanation;
                    this.setData({ moveHistory: history });
                  }
                }
              })
              .catch(() => {});
          }, 200);
        }

        if (chess.isGameOver()) {
          this.handleGameOver();
        } else {
          this.triggerAnalysis();
        }
      } else {
        this.setData({ isAIThinking: false });
      }
    } catch (e) {
      console.error('AI move error:', e);
      this.setData({ isAIThinking: false });
    }
  },

  /**
   * 本地 AI 引擎降级：后端请求失败时离线对弈
   */
  playLocalAIMove(fen: string) {
    if (!this.data.offlineMode) {
      this.setData({ offlineMode: true });
      util.showToast('服务器暂不可用，已切换本地AI（离线模式）');
    }
    const uci = localAI.getLocalAIMove(fen, this.data.difficulty);
    if (!uci) {
      this.setData({ isAIThinking: false });
      return;
    }
    // 稍作延迟模拟思考，避免界面突变
    setTimeout(() => this.applyAIMove(uci, fen), 300);
  },

  // ===== 局面分析 =====
  triggerAnalysis() {
    this.clearAnalysisTimer();
    this._analysisTimer = setTimeout(() => {
      const chess = this._chess;
      const fen = chess.fen();

      api.analyzePosition({
        fen,
        depth: this.data.settings.analysisDepth || 10,
        multiPv: this.data.settings.analysisMultiPv || 3,
        pgn: chess.pgn(),
      })
        .then((res: any) => {
          if (res?.data) {
            const candidates = (res.data.candidates || []).map((c: any, i: number) => ({
              ...c,
              rank: i + 1,
              score: typeof c.score === 'number' ? c.score : 0,
              scoreFormatted: util.formatScore(c.score),
              scoreColor: util.getScoreColor(c.score),
              // 字符串数组转带唯一键对象，避免 wx:key 重复告警
              pros: util.keyedList(c.pros, 'p' + (i + 1)),
              cons: util.keyedList(c.cons, 'c' + (i + 1)),
              tactics: util.keyedList(c.tactics, 't' + (i + 1)),
              line: util.keyedList(c.line, 'l' + (i + 1)),
            }));
            this.setData({
              analysis: candidates,
              analysisError: '',
              openingName: res.data.openingName || '',
              openingNameCN: res.data.openingNameCN || '',
              ecoCode: res.data.ecoCode || '',
            });
          }
        })
        .catch((err: any) => {
          const msg = err && err.message ? err.message : '分析失败';
          const friendly = msg.indexOf('url not in domain list') !== -1 || msg.indexOf('fail') !== -1
            ? '离线模式：引擎分析不可用（走子与本地AI不受影响）'
            : msg;
          this.setData({ analysisError: friendly });
        });
    }, 500);
  },

  clearAnalysisTimer() {
    if (this._analysisTimer) {
      clearTimeout(this._analysisTimer);
      this._analysisTimer = null;
    }
  },

  // ===== 推演模式 =====
  onStartExploration(e: any) {
    const uci = e.detail?.uci || e.currentTarget?.dataset?.uci;
    this.startExploration(uci);
  },

  onPlayContinuation(e: any) {
    const uci = e.detail?.uci || e.currentTarget?.dataset?.uci;
    this.startExploration(uci);
  },

  startExploration(uci: string) {
    const chess = new Chess.Chess(this._chess.fen());
    this._explorationChess = chess;

    const steps: any[] = [];
    if (uci) {
      try {
        const move = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci.slice(4) : 'q',
        });
        if (move) {
          steps.push({
            fen: chess.fen(),
            san: move.san,
            uci: move.from + move.to,
          });
        }
      } catch (e) {}
    }

    this.setData({
      explorationMode: 'manual',
      explorationSteps: steps,
      explorationStepIndex: steps.length > 0 ? 0 : -1,
      explorationFen: steps.length > 0 ? steps[0].fen : this._chess.fen(),
    });
  },

  handleExplorationMove(square: string) {
    const chess = this._explorationChess || new Chess.Chess(this._chess.fen());
    const from = this.data.selectedSquare;

    if (!from) {
      const piece = chess.get(square);
      if (piece) {
        const moves = chess.moves({ square, verbose: true });
        this.setData({
          selectedSquare: square,
          legalMoves: moves.map((m: any) => m.to),
        });
      }
      return;
    }

    if (this.data.legalMoves.includes(square)) {
      try {
        const move = chess.move({ from, to: square, promotion: 'q' });
        if (move) {
          const steps = [...this.data.explorationSteps, {
            fen: chess.fen(),
            san: move.san,
            uci: move.from + move.to,
          }];
          this._explorationChess = chess;
          this.setData({
            explorationSteps: steps,
            explorationStepIndex: steps.length - 1,
            explorationFen: chess.fen(),
            selectedSquare: '',
            legalMoves: [],
          });
        }
      } catch (e) {}
    } else {
      const piece = chess.get(square);
      if (piece) {
        const moves = chess.moves({ square, verbose: true });
        this.setData({
          selectedSquare: square,
          legalMoves: moves.map((m: any) => m.to),
        });
      }
    }
  },

  exitExploration() {
    this._explorationChess = null;
    this.setData({
      explorationMode: '',
      explorationSteps: [],
      explorationStepIndex: -1,
      explorationFen: '',
    });
    this.updateBoardState();
  },

  /** 推演上一步 */
  explorationPrev() {
    const idx = this.data.explorationStepIndex;
    if (idx <= 0) return;
    this.explorationGoToStep(idx - 1);
  },

  /** 推演下一步 */
  explorationNext() {
    const steps = this.data.explorationSteps;
    const idx = this.data.explorationStepIndex;
    if (idx >= steps.length - 1) return;
    this.explorationGoToStep(idx + 1);
  },

  /** 跳到推演的指定步骤 */
  explorationGoToStep(index: number) {
    const steps = this.data.explorationSteps;
    if (index < 0 || index >= steps.length) return;
    this.setData({
      explorationStepIndex: index,
      explorationFen: steps[index].fen,
    });
  },

  // ===== 重演模式 =====
  onGoToMove(e: any) {
    const index = e.detail?.index;
    if (index !== undefined && index >= 0) {
      this.goToMove(index);
    }
  },

  onPanelSwitch(e: any) {
    const panel = e.currentTarget.dataset.panel;
    if (panel) this.setData({ activePanel: panel });
  },

  onScrollToCandidate(e: any) {
    const rank = e.detail.rank;
    if (this.data.showHintsFull) {
      this.setData({ scrollTargetHints: 'hints-candidate-' + rank });
      setTimeout(() => {
        this.setData({ scrollTargetHints: '' });
      }, 500);
    } else {
      const analysisPanel = this.selectComponent('#analysis-panel');
      if (analysisPanel && analysisPanel.scrollToCandidate) {
        analysisPanel.scrollToCandidate(rank);
      }
    }
  },

  replayPrev() {
    if (this.data.replayIndex > 0) {
      this.goToMove(this.data.replayIndex - 1);
    } else if (this.data.replayIndex === 0) {
      this.exitReplay();
    }
  },

  replayNext() {
    if (this.data.replayIndex < this.data.moveHistory.length - 1) {
      this.goToMove(this.data.replayIndex + 1);
    } else {
      this.exitReplay();
    }
  },

  goToMove(index: number) {
    const chess = new Chess.Chess();
    const history = this.data.moveHistory;

    for (let i = 0; i <= index && i < history.length; i++) {
      const m = history[i];
      try {
        chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      } catch (e) {
        break;
      }
    }

    this.setData({
      fen: chess.fen(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      replayIndex: index,
      isReplay: true,
    });
  },

  exitReplay() {
    this.setData({
      replayIndex: -1,
      isReplay: false,
    });
    this.updateBoardState();
  },

  // ===== 游戏控制 =====
  onNewGame() {
    wx.showActionSheet({
      itemList: ['执白（先手）', '执黑（后手）'],
      success: (res: any) => {
        const playerSide = res.tapIndex === 0 ? 'white' : 'black';
        this.startNewGame(playerSide);
      },
    });
  },

  startNewGame(playerSide: string) {
    this.clearTimer();

    this._chess = new Chess.Chess();
    this._lightMoves = [];

    const timeControl = this.data.timeControlMode;
    let initTime = this.data.initialTime;

    this.setData({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      pgn: '',
      turn: 'w',
      playerSide: playerSide === 'white' ? 'w' : 'b',
      aiSide: playerSide === 'white' ? 'b' : 'w',
      difficulty: app.globalData.settings?.aiDifficulty || 5,
      isAIThinking: false,
      gameStarted: true,
      gameOver: false,
      result: 'playing',
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      moveHistory: [],
      moveReviews: {},
      analysis: [],
      analysisError: '',
      openingName: '',
      openingNameCN: '',
      ecoCode: '',
      selectedSquare: '',
      legalMoves: [],
      replayIndex: -1,
      isReplay: false,
      explorationMode: '',
      whiteTime: initTime,
      blackTime: initTime,
      timerActiveSide: '',
      timerRunning: false,
      showGameOver: false,
    });

    if (playerSide === 'black') {
      this.requestAIMove();
    } else {
      this.triggerAnalysis();
    }
  },

  onUndo() {
    this.setData({ showMoreMenu: false });
    const chess = this._chess;
    const history = chess.history({ verbose: true });
    if (history.length === 0) return;

    try {
      chess.undo();
      this._lightMoves.pop();
      if (chess.history().length > 0) {
        chess.undo();
        this._lightMoves.pop();
      }
    } catch (e) {}

    this.updateBoardState();
    this.setData({ showGameOver: false, gameOver: false, result: 'playing' });
    this.triggerAnalysis();
  },

  onFlipBoard() {
    this.setData({ showMoreMenu: false, boardFlipped: !this.data.boardFlipped });
    const settings = { ...this.data.settings, boardFlipped: !this.data.settings.boardFlipped };
    app.globalData.settings = settings;
    app.saveSettings();
  },

  onResign() {
    this.setData({ showMoreMenu: false });
    wx.showModal({
      title: '确认认输？',
      content: '确定要认输吗？',
      success: (res: any) => {
        if (res.confirm) {
          const result = this.data.playerSide === 'w' ? 'black' : 'white';
          this.setData({
            result,
            resultLabel: util.translateResult(result),
            gameOver: true,
            showGameOver: true,
          });
        }
      },
    });
  },

  onToggleHints() {
    this.setData({ showMoreMenu: false });
    const settings = { ...this.data.settings, showHints: !this.data.settings.showHints };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
    if (settings.showHints) {
      this.triggerAnalysis();
      this.setData({ showHintsFull: true });
    } else {
      this.setData({ showHintsFull: false });
    }
  },

  onCloseHintsFull() {
    this.setData({ showHintsFull: false });
    const settings = { ...this.data.settings, showHints: false };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  onToggle3D() {
    this.setData({ showMoreMenu: false });
    const settings = { ...this.data.settings, pieceStyle3d: !this.data.settings.pieceStyle3d };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  onExportPGN() {
    this.setData({ showMoreMenu: false });
    const pgn = this._chess.pgn();
    if (!pgn) {
      util.showToast('没有对局可导出');
      return;
    }
    wx.setClipboardData({
      data: pgn,
      success: () => util.showToast('PGN已复制到剪贴板', 'success'),
    });
  },

  // ===== 右上角下拉菜单 =====
  onMoreTap() {
    this.setData({ showMoreMenu: !this.data.showMoreMenu });
  },

  onShareGame() {
    this.setData({ showMoreMenu: false });
    const pgn = this._chess ? this._chess.pgn() : '';
    if (!pgn) {
      util.showToast('没有对局可分享');
      return;
    }
    wx.setClipboardData({
      data: pgn,
      success: () => util.showToast('对局PGN已复制，可粘贴分享', 'success'),
    });
  },

  onAnalysisFull() {
    this.setData({ showMoreMenu: false, activePanel: 'analysis' });
    this.triggerAnalysis();
  },

  onDifficultyChange(e: any) {
    const difficulty = parseInt(e.detail.value);
    const settings = { ...this.data.settings, aiDifficulty: difficulty };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings, difficulty });
  },

  // ===== 时间控制 =====
  onTimeClick() {
    this.setData({ showTimeOptions: !this.data.showTimeOptions });
  },

  onTimeSelect(e: any) {
    const idx = parseInt(e.currentTarget.dataset.index);
    const preset = TIME_PRESETS[idx];
    this.setData({
      timeControlMode: preset.mode,
      initialTime: preset.time,
      timeIncrement: preset.inc,
      currentTimeLabel: preset.label,
      whiteTime: preset.time,
      blackTime: preset.time,
      showTimeOptions: false,
    });
  },

  startTimer() {
    this.clearTimer();
    if (this.data.timeControlMode === 'none') return;

    this.setData({ timerRunning: true, timerActiveSide: this.data.turn });

    this._timerInterval = setInterval(() => {
      if (!this.data.timerRunning) return;

      const side = this.data.turn;
      const key = side === 'w' ? 'whiteTime' : 'blackTime';
      const currentTime = this.data[key];
      const newTime = Math.max(0, currentTime - 1);

      this.setData({ [key]: newTime, timerActiveSide: side });

      if (newTime <= 0) {
        this.clearTimer();
        const winner = side === 'w' ? 'black' : 'white';
        this.setData({
          result: winner,
          resultLabel: util.translateResult(winner),
          gameOver: true,
          showGameOver: true,
          timerRunning: false,
        });
      }
    }, 1000);
  },

  clearTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this.setData({ timerRunning: false });
  },

  // ===== 游戏状态管理 =====
  getBoardData(chess: any) {
    return {
      fen: chess.fen(),
      pgn: chess.pgn(),
      turn: chess.turn(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      gameOver: chess.isGameOver(),
      moveHistory: this._lightMoves.slice(),
      replayIndex: -1,
      isReplay: false,
    };
  },

  updateBoardState() {
    const chess = this._chess;
    this.setData(this.getBoardData(chess));
  },

  handleGameOver() {
    const chess = this._chess;
    let result = 'playing';

    if (chess.isCheckmate()) {
      result = chess.turn() === 'w' ? 'black' : 'white';
    } else if (chess.isStalemate() || chess.isDraw()) {
      result = 'draw';
    }

    this.setData({
      gameOver: true,
      result,
      resultLabel: util.translateResult(result),
      showGameOver: true,
      isAIThinking: false,
    });

    this.clearTimer();
  },

  onGameOverUndo() {
    this.onUndo();
  },

  onGameOverNewGame() {
    this.onNewGame();
  },

  saveGameIfNeeded() {
    const user = app.globalData.user;
    if (user && this._chess.history().length > 0) {
      const pgn = this._chess.pgn();
      api.saveGame({
        pgn,
        white: this.data.playerSide === 'w' ? (app.globalData.user?.username || '我') : 'AI',
        black: this.data.playerSide === 'b' ? (app.globalData.user?.username || '我') : 'AI',
        difficulty: this.data.difficulty,
      }).catch(() => {});
    }
  },

  // ===== 手动分析（已移除详细分析按钮，保留备用） =====
  onShowDetailedAnalysis() {
    const fen = this._chess.fen();
    if (!fen) return;

    wx.showLoading({ title: '分析中...' });
    api.getDetailedAnalysis(fen, this.data.settings.analysisDepth || 10, 3)
      .then((res: any) => {
        wx.hideLoading();
        if (res?.data?.detailedAnalysis) {
          wx.showModal({
            title: '详细分析',
            content: res.data.detailedAnalysis,
            showCancel: false,
            confirmText: '关闭',
          });
        }
      })
      .catch(() => {
        wx.hideLoading();
        util.showToast('分析失败');
      });
  },
});export {}

/**
 * Lichess 对局辅助模块（与网页版 pvpStore 的行为保持一致）
 *
 * 两个核心能力：
 * 1. UCI 走法序列重放：Lichess 每步推送的是完整 UCI 序列（权威、含悔棋回退），
 *    不含 FEN/SAN/PGN，必须本地用 chess.js 重建局面与着法列表。
 * 2. 棋钟锚点：Lichess 只在走棋时推 wtime/btime，两次走棋之间由本地按真实
 *    流逝时间外推，并对传播延迟做补偿。
 */

const Chess = require('./chessjs');

/** 应用一步 UCI 走法（非法走法抛异常，由调用方决定如何回退） */
function applyUciMove(chess: any, uci: string): any {
  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  });
}

export interface ReplayedMove {
  uci: string;
  san: string;
  from: string;
  to: string;
  /** 被吃子力类型（无吃子为 undefined），供教练闲聊判断局面 */
  captured?: string;
  /** 该步走完后是否形成将军/将杀 */
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export interface ReplayResult {
  fen: string;
  pgn: string;
  moves: ReplayedMove[];
  turn: 'w' | 'b';
}

/**
 * 增量重放缓存：记录已重放的最长 UCI 前缀及其棋局实例。
 * Lichess 每步棋都会推完整走法序列，若每次都从第 1 步重放是 O(n²)；
 * 新序列与缓存前缀一致时只需追加应用新增着法（悔棋/换局时自动全量重建）。
 */
let replayCache: { uciList: string[]; chess: any; moves: ReplayedMove[] } | null = null;

/** 清空重放缓存（新对局开始时调用） */
export function resetReplayCache(): void {
  replayCache = null;
}

/** 把 chess.js 的走法对象整理为展示/闲聊所需的字段 */
function toReplayedMove(chess: any, uci: string, mv: any): ReplayedMove {
  return {
    uci,
    san: mv && mv.san ? mv.san : '',
    from: mv && mv.from ? mv.from : uci.slice(0, 2),
    to: mv && mv.to ? mv.to : uci.slice(2, 4),
    captured: mv && mv.captured ? mv.captured : undefined,
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
  };
}

/** 从头完整重放（不走缓存），并以其结果替换缓存 */
function replayUciMovesFull(uciList: string[]): ReplayResult | null {
  const chess = new Chess.Chess();
  const moves: ReplayedMove[] = [];
  for (const uci of uciList) {
    try {
      const mv = applyUciMove(chess, uci);
      moves.push(toReplayedMove(chess, uci, mv));
    } catch {
      return null;
    }
  }
  replayCache = { uciList: uciList.slice(), chess, moves };
  return { fen: chess.fen(), pgn: chess.pgn(), moves: moves.slice(), turn: chess.turn() };
}

/**
 * 用 chess.js 从 UCI 序列重建（FEN/PGN/带 SAN 的着法列表）；命中前缀缓存时增量应用。
 * 序列非法（与 Lichess 侧不同步）时返回 null，调用方应忽略本次推送。
 */
export function replayUciMoves(uciList: string[]): ReplayResult | null {
  const cached = replayCache;
  if (
    cached &&
    uciList.length >= cached.uciList.length &&
    cached.uciList.every((u, i) => u === uciList[i])
  ) {
    // 前缀命中：仅追加应用新增着法（若中途出现非法走法则整体重建，保证缓存一致）
    for (let i = cached.uciList.length; i < uciList.length; i++) {
      try {
        const mv = applyUciMove(cached.chess, uciList[i]);
        cached.moves.push(toReplayedMove(cached.chess, uciList[i], mv));
        cached.uciList.push(uciList[i]);
      } catch {
        return replayUciMovesFull(uciList);
      }
    }
    return {
      fen: cached.chess.fen(),
      pgn: cached.chess.pgn(),
      moves: cached.moves.slice(),
      turn: cached.chess.turn(),
    };
  }
  return replayUciMovesFull(uciList);
}

// ===== Lichess 棋钟锚点（本地走秒 + 传播延迟补偿） =====

export interface LichessClockAnchor {
  activeSide: 'white' | 'black';
  whiteMs: number;
  blackMs: number;
  /** 锚点建立时刻（Date.now()） */
  anchoredAt: number;
}

export interface TimerState {
  whiteTime: number;
  blackTime: number;
  isRunning: boolean;
  activeSide: 'white' | 'black';
}

let clockAnchor: LichessClockAnchor | null = null;

/** 清空棋钟锚点（新对局开始时调用） */
export function resetClockAnchor(): void {
  clockAnchor = null;
}

export function hasClockAnchor(): boolean {
  return !!clockAnchor;
}

/**
 * 取得当前锚点快照（乐观走子前保存，失败回滚时还原）。
 * 直接返回内部对象副本，避免调用方持有引用后被后续同步改写。
 */
export function snapshotClockAnchor(): LichessClockAnchor | null {
  return clockAnchor ? { ...clockAnchor } : null;
}

/** 还原锚点快照（传 null 等价于清空） */
export function restoreClockAnchor(snapshot: LichessClockAnchor | null): void {
  clockAnchor = snapshot ? { ...snapshot } : null;
}

/** 从锚点推导当前双方剩余毫秒（活动方按真实流逝时间扣减） */
function settleAnchorMs(a: LichessClockAnchor): { whiteMs: number; blackMs: number } {
  const elapsed = Math.max(0, Date.now() - a.anchoredAt);
  return {
    whiteMs: a.activeSide === 'white' ? Math.max(0, a.whiteMs - elapsed) : a.whiteMs,
    blackMs: a.activeSide === 'black' ? Math.max(0, a.blackMs - elapsed) : a.blackMs,
  };
}

/** 由锚点生成展示用 TimerState（秒） */
export function timerStateFromAnchor(a: LichessClockAnchor): TimerState {
  const s = settleAnchorMs(a);
  return {
    whiteTime: Math.floor(s.whiteMs / 1000),
    blackTime: Math.floor(s.blackMs / 1000),
    isRunning: true,
    activeSide: a.activeSide,
  };
}

/** 当前锚点对应的展示用 TimerState（无锚点返回 null） */
export function currentTimerState(): TimerState | null {
  return clockAnchor ? timerStateFromAnchor(clockAnchor) : null;
}

/** 用已有 TimerState（秒）建立锚点 */
export function anchorFromTimerState(ts: TimerState | null | undefined): void {
  if (!ts) {
    clockAnchor = null;
    return;
  }
  const activeSide: 'white' | 'black' = ts.activeSide === 'black' ? 'black' : 'white';
  clockAnchor = {
    activeSide,
    whiteMs: Math.max(0, ts.whiteTime) * 1000,
    blackMs: Math.max(0, ts.blackTime) * 1000,
    anchoredAt: Date.now(),
  };
}

/**
 * 权威棋钟同步时建立锚点（含传播延迟补偿）。
 *
 * 补偿量 =（本机收到时刻 - 后端转发时刻 tServer）+ 估计的 Lichess→后端单程延迟 lagMs，
 * 只从活动方（正在走秒的一方）扣除；整体钳制在 [0, 5000]ms，防止时钟偏差造成大错。
 */
export function buildAuthoritativeAnchor(
  wtimeMs: number,
  btimeMs: number,
  activeSide: 'white' | 'black',
  tServer?: number,
  lagMs?: number
): void {
  const staleness = Math.min(5000, Math.max(0, (tServer ? Date.now() - tServer : 0) + (lagMs || 0)));
  clockAnchor = {
    activeSide,
    whiteMs: Math.max(0, wtimeMs - (activeSide === 'white' ? staleness : 0)),
    blackMs: Math.max(0, btimeMs - (activeSide === 'black' ? staleness : 0)),
    anchoredAt: Date.now(),
  };
}

/**
 * 乐观走子后推进锚点：走子方结算已用时间并加上加秒，走秒切到对方，重新起算。
 * 无锚点时不做处理（交由权威同步建立）。
 */
export function advanceAnchorForLocalMove(nextTurn: 'w' | 'b', incrementSeconds: number): void {
  if (!clockAnchor) return;
  const settled = settleAnchorMs(clockAnchor);
  const moverSide: 'white' | 'black' = nextTurn === 'w' ? 'black' : 'white';
  const incMs = Math.max(0, incrementSeconds || 0) * 1000;
  clockAnchor = {
    activeSide: nextTurn === 'w' ? 'white' : 'black',
    whiteMs: moverSide === 'white' ? settled.whiteMs + incMs : settled.whiteMs,
    blackMs: moverSide === 'black' ? settled.blackMs + incMs : settled.blackMs,
    anchoredAt: Date.now(),
  };
}

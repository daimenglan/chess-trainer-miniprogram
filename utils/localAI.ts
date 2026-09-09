/**
 * 本地 AI 引擎（离线降级用）
 * 当后端 API 不可用时（如真机预览未配置合法域名），
 * 使用 chess.js 做 alpha-beta 搜索，保证对弈可继续。
 */
const Chess = require('./chessjs');

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

/**
 * 局面评估（白方视角，正数利于白方）
 */
function evaluate(chess: any): number {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      let v = PIECE_VALUES[p.type] || 0;
      // 中心控制加成
      v += (Math.min(f, 7 - f) + Math.min(r, 7 - r)) * 2;
      // 兵推进加成
      if (p.type === 'p') {
        const rank = 8 - r; // r=0 是第8行
        v += p.color === 'w' ? (rank - 1) * 5 : (8 - rank) * 5;
      }
      score += p.color === 'w' ? v : -v;
    }
  }
  return score;
}

/**
 * negamax + alpha-beta 剪枝（返回值相对当前走棋方）
 */
function negamax(chess: any, depth: number, alpha: number, beta: number): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return -100000 - depth; // 当前方被将杀，晚杀分更高
    return 0; // 和棋
  }
  if (depth <= 0) {
    const e = evaluate(chess);
    return chess.turn() === 'w' ? e : -e;
  }
  const moves = chess.moves({ verbose: true }) as any[];
  // 吃子优先排序，提升剪枝效率
  moves.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
  let best = -Infinity;
  let a = alpha;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -a);
    chess.undo();
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) break;
  }
  return best;
}

/**
 * 获取本地 AI 走法（UCI 格式）
 * @param fen 当前局面
 * @param difficulty 1-10 难度，映射搜索深度与随机性
 */
function getLocalAIMove(fen: string, difficulty: number): string {
  const chess = new (Chess as any).Chess(fen);
  const moves = chess.moves({ verbose: true }) as any[];
  if (!moves || moves.length === 0) return '';

  const d = Math.max(1, Math.min(10, difficulty || 5));
  // 深度映射：低难度浅搜 + 高随机，高难度深搜
  const depth = d <= 2 ? 1 : d <= 6 ? 2 : 3;
  const randomness = d <= 3 ? 60 : d <= 6 ? 25 : 5;

  let bestScore = -Infinity;
  let candidates: string[] = [];
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, Infinity);
    chess.undo();
    const noisy = score + (Math.random() - 0.5) * randomness * 2;
    if (noisy > bestScore + 1) {
      bestScore = noisy;
      candidates = [m.from + m.to + (m.promotion || '')];
    } else if (Math.abs(noisy - bestScore) <= 1 && candidates.length < 4) {
      candidates.push(m.from + m.to + (m.promotion || ''));
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || '';
}

module.exports = { getLocalAIMove };

/**
 * 国际象棋走法描述工具
 * 转换 UCI 走法为中文描述
 */

import { Chess } from './chessjs';

const PIECE_NAMES: Record<string, string> = {
  p: '兵', n: '马', b: '象', r: '车', q: '后', k: '王',
};

/**
 * 在 FEN 局面下执行 UCI 走法，返回中文描述
 */
function describeMove(fen: string, uci: string): { pieceName: string; san: string; piece: string } {
  let san = `${uci.slice(0, 2)}-${uci.slice(2, 4)}`;
  let pieceName = '';
  let piece: string = '';

  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const p = chess.get(from);
    if (p) {
      piece = p.type;
      pieceName = PIECE_NAMES[p.type] || '';
    }
    const m = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: (uci.length > 4 ? uci.slice(4) : 'q') as 'q' | 'r' | 'b' | 'n',
    });
    if (m) san = m.san;
  } catch (e) {
    // 非法走法时保留 from-to 形式
  }

  return { pieceName, san, piece };
}

/**
 * 将 UCI 走法序列转换为 SAN 序列
 */
function uciToSanLine(fen: string, uciMoves: string[], limit: number = 6): string[] {
  const sans: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of uciMoves.slice(0, limit)) {
      if (!uci || uci.length < 4) break;
      const m = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci.length > 4 ? uci.slice(4) : 'q') as 'q' | 'r' | 'b' | 'n',
      });
      if (!m) break;
      sans.push(m.san);
      if (chess.isGameOver()) break;
    }
  } catch (e) {
    // 序列中断
  }
  return sans;
}

/**
 * 获取棋盘上某格子的棋子描述
 */
function getPieceAt(fen: string, square: string): { type: string; color: string; name: string; symbol: string } | null {
  try {
    const chess = new Chess(fen);
    const p = chess.get(square);
    if (!p) return null;
    return {
      type: p.type,
      color: p.color,
      name: PIECE_NAMES[p.type] || '',
      symbol: p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export {
  PIECE_NAMES,
  describeMove,
  uciToSanLine,
  getPieceAt,
};
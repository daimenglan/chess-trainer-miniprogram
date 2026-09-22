"use strict";
/**
 * 国际象棋走法描述工具
 * 转换 UCI 走法为中文描述
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIECE_NAMES = void 0;
exports.describeMove = describeMove;
exports.uciToSanLine = uciToSanLine;
exports.getPieceAt = getPieceAt;
exports.normalizePgn = normalizePgn;
exports.stripPgnHeaders = stripPgnHeaders;
const chessjs_1 = require("./chessjs");
const PIECE_NAMES = {
    p: '兵', n: '马', b: '象', r: '车', q: '后', k: '王',
};
exports.PIECE_NAMES = PIECE_NAMES;
/**
 * 在 FEN 局面下执行 UCI 走法，返回中文描述
 */
function describeMove(fen, uci) {
    let san = `${uci.slice(0, 2)}-${uci.slice(2, 4)}`;
    let pieceName = '';
    let piece = '';
    try {
        const chess = new chessjs_1.Chess(fen);
        const from = uci.slice(0, 2);
        const p = chess.get(from);
        if (p) {
            piece = p.type;
            pieceName = PIECE_NAMES[p.type] || '';
        }
        const m = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: (uci.length > 4 ? uci.slice(4) : 'q'),
        });
        if (m)
            san = m.san;
    }
    catch (e) {
        // 非法走法时保留 from-to 形式
    }
    return { pieceName, san, piece };
}
/**
 * 将 UCI 走法序列转换为 SAN 序列
 */
function uciToSanLine(fen, uciMoves, limit = 6) {
    const sans = [];
    try {
        const chess = new chessjs_1.Chess(fen);
        for (const uci of uciMoves.slice(0, limit)) {
            if (!uci || uci.length < 4)
                break;
            const m = chess.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: (uci.length > 4 ? uci.slice(4) : 'q'),
            });
            if (!m)
                break;
            sans.push(m.san);
            if (chess.isGameOver())
                break;
        }
    }
    catch (e) {
        // 序列中断
    }
    return sans;
}
/**
 * 规范化 PGN 文本，兼容非标准格式：
 * - 统一换行符，去除 BOM 与零宽字符
 * - 头部标签块与走法之间补空行（后端生成的部分 PGN 缺少空行，
 *   chess.js 的头部正则会匹配失败并把 [Tag] 当作走法抛错）
 * - 只有走法没有头部时补全最小头部
 */
function normalizePgn(raw) {
    if (typeof raw !== 'string')
        return '';
    let pgn = raw
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
    if (!pgn)
        return '';
    const isTagLine = (line) => /^\s*\[[^\]]*\]\s*$/.test(line);
    const lines = pgn.split('\n');
    if (isTagLine(lines[0] || '')) {
        // 跳过头部标签块（允许标签之间夹杂空行）
        let i = 0;
        while (i < lines.length && (isTagLine(lines[i]) || lines[i].trim() === ''))
            i++;
        const headerLines = lines.slice(0, i).filter((l) => l.trim() !== '');
        const moveLines = lines.slice(i);
        while (moveLines.length > 0 && moveLines[0].trim() === '')
            moveLines.shift();
        pgn = headerLines.join('\n') + '\n\n' + moveLines.join('\n');
    }
    else {
        pgn = '[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n' + pgn;
    }
    return pgn.trim();
}
/**
 * 去掉 PGN 头部标签，只保留走法文本（解析兜底用）
 */
function stripPgnHeaders(pgn) {
    if (typeof pgn !== 'string')
        return '';
    const lines = pgn.split('\n');
    const out = [];
    let inHeader = true;
    for (const line of lines) {
        if (inHeader && (line.trim() === '' || /^\s*\[[^\]]*\]\s*$/.test(line)))
            continue;
        inHeader = false;
        out.push(line);
    }
    return out.join('\n').trim();
}
/**
 * 获取棋盘上某格子的棋子描述
 */
function getPieceAt(fen, square) {
    try {
        const chess = new chessjs_1.Chess(fen);
        const p = chess.get(square);
        if (!p)
            return null;
        return {
            type: p.type,
            color: p.color,
            name: PIECE_NAMES[p.type] || '',
            symbol: p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase(),
        };
    }
    catch {
        return null;
    }
}

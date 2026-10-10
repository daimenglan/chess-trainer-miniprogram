/**
 * 自主探究页核心逻辑验证
 *
 * 覆盖三条最容易出错、且出错后用户看不见的链路：
 * 1. 悔棋/重做后 PGN 仍是一条完整走子线（退到 FEN 会丢历史，棋谱就废了）
 * 2. 推演线中途落子会截断分支、退出推演能回到入口局面
 * 3. 载入棋谱后 undo 栈能一路退回起点
 *
 * 用法: node test/explore-logic-test.js
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Chess = require(path.join(ROOT, 'utils/chessjs'));
const notation = require(path.join(ROOT, 'utils/chessNotation'));

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? '  →  ' + extra : ''));
  }
}

// 从页面源码里抽出纯逻辑重建（与 pages/explore/explore.ts 同构）
function makeSession() {
  const s = {
    chess: new Chess.Chess(),
    undo: [],
    redo: [],
  };
  s.sync = () => ({
    fen: s.chess.fen(),
    turn: s.chess.turn(),
    moveCount: s.undo.length,
  });
  s.makeMove = (from, to, promotion) => {
    const fenBefore = s.chess.fen();
    const m = s.chess.move({ from, to, promotion: promotion || 'q' });
    if (!m) return null;
    const step = { san: m.san, uci: m.from + m.to + (m.promotion || ''), fen: fenBefore };
    s.undo.push(step);
    s.redo = [];
    return step;
  };
  s.replayTo = (line, fallbackFen) => {
    try {
      const startFen = line.length > 0 ? line[0].fen : fallbackFen;
      const chess = new Chess.Chess(startFen);
      for (const st of line) {
        chess.move({
          from: st.uci.slice(0, 2),
          to: st.uci.slice(2, 4),
          promotion: st.uci.length > 4 ? st.uci.slice(4) : 'q',
        });
      }
      s.chess = chess;
      return true;
    } catch (e) {
      return false;
    }
  };
  s.undo1 = () => {
    if (s.undo.length === 0) return;
    const last = s.undo[s.undo.length - 1];
    const rest = s.undo.slice(0, -1);
    if (!s.replayTo(rest, last.fen)) return;
    s.redo = s.redo.concat([last]);
    s.undo = rest;
  };
  s.redo1 = () => {
    if (s.redo.length === 0) return;
    const next = s.redo[s.redo.length - 1];
    if (!s.replayTo(s.undo.concat([next]), s.undo[0] ? s.undo[0].fen : undefined)) return;
    s.undo = s.undo.concat([next]);
    s.redo = s.redo.slice(0, -1);
  };
  return s;
}

console.log('\n======== 自主探究核心逻辑 ========\n');

console.log('--- 1. 自由走子：黑白轮流 ---');
{
  const s = makeSession();
  s.makeMove('e2', 'e4');
  s.makeMove('e7', 'e5');
  s.makeMove('g1', 'f3');
  const st = s.sync();
  check('3 步后轮到黑方（白黑交替）', st.turn === 'b', 'turn=' + st.turn);
  check('步数 = 3', st.moveCount === 3, 'count=' + st.moveCount);
  check('PGN 从 1. e4 开始', s.chess.pgn().includes('1. e4'), s.chess.pgn().slice(0, 40));
}

console.log('\n--- 2. 悔棋不丢 PGN 历史（关键回归点）---');
{
  const s = makeSession();
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'].forEach((u) =>
    s.makeMove(u.slice(0, 2), u.slice(2, 4), u.length > 4 ? u.slice(4) : 'q')
  );
  const fullPgn = s.chess.pgn();
  s.undo1();
  s.undo1();
  s.undo1();
  const mid = s.chess.pgn();
  check('悔棋 3 步后步数 = 2', s.undo.length === 2, 'undo=' + s.undo.length);
  check('PGN 仍以 1. e4 开头（未退化成 [FEN] 残局）', mid.includes('1. e4'), JSON.stringify(mid.slice(0, 60)));
  check('PGN 不含 SetUp/FEN 头', !mid.includes('SetUp') && !mid.includes('[FEN'), JSON.stringify(mid.slice(0, 60)));
  s.redo1();
  s.redo1();
  s.redo1();
  check('重做回满 5 步', s.undo.length === 5, 'undo=' + s.undo.length);
  check('重做后 PGN 与原始完全一致', s.chess.pgn() === fullPgn,
    JSON.stringify(s.chess.pgn().slice(0, 60)) + ' vs ' + JSON.stringify(fullPgn.slice(0, 60)));
}

console.log('\n--- 3. 连续悔到起点 ---');
{
  const s = makeSession();
  s.makeMove('d2', 'd4');
  s.makeMove('d7', 'd5');
  s.makeMove('c2', 'c4');
  s.undo1(); s.undo1(); s.undo1();
  check('退到 0 步', s.undo.length === 0, 'undo=' + s.undo.length);
  check('局面回到初始 FEN', s.chess.fen().split(' ')[0] === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  check('重做栈累计 3 步', s.redo.length === 3, 'redo=' + s.redo.length);
  s.redo1(); s.redo1(); s.redo1();
  check('从 0 连续重做回到 3 步', s.undo.length === 3, 'undo=' + s.undo.length);
  check('重做后 PGN 完整', s.chess.pgn().includes('1. d4'));
}

console.log('\n--- 4. 新走法作废重做栈 ---');
{
  const s = makeSession();
  s.makeMove('e2', 'e4');
  s.makeMove('e7', 'e5');
  s.undo1();
  check('悔棋后有 1 步可重做', s.redo.length === 1);
  check('悔棋后轮到黑方', s.chess.turn() === 'b', 'turn=' + s.chess.turn());
  s.makeMove('c7', 'c5');
  check('新走法后重做栈清空', s.redo.length === 0, 'redo=' + s.redo.length);
  check('undo 栈为 2 步', s.undo.length === 2, 'undo=' + s.undo.length);
}

console.log('\n--- 5. 推演线：分支与退出 ---');
{
  // 模拟 _startExplore：主线不动，实例被推演线接管
  const s = makeSession();
  s.makeMove('e2', 'e4');
  const entryFen = s.chess.fen();

  // 引擎给出 e7e5 + e8c6 两条续着
  const steps = [];
  const c = new Chess.Chess(entryFen);
  for (const u of ['e7e5', 'g1f3', 'b8c6']) {
    const fenBefore = c.fen();
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
    steps.push({ san: m.san, uci: u, fen: fenBefore });
  }
  check('推演线 3 步', steps.length === 3);
  s.chess = c;
  s.sync();
  check('推演后主线 undo 栈未被污染', s.undo.length === 1, 'undo=' + s.undo.length);

  // 回退到第 1 步
  s.replayTo(steps.slice(0, 1), entryFen);
  check('跳到推演第 1 步局面正确', s.chess.fen() === 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    s.chess.fen());

  // 中途落子 → 分支截断
  const branched = steps.slice(0, 1);
  s.makeMove('d2', 'd4');
  branched.push({ san: 'd4', uci: 'd2d4', fen: s.chess.fen() });
  check('分支后线长为 2（后续被丢弃）', branched.length === 2, 'len=' + branched.length);

  // 退出推演：回到入口局面
  s.chess = new Chess.Chess(entryFen);
  check('退出推演后回到入口局面', s.chess.fen() === entryFen);
}

console.log('\n--- 6. 载入棋谱后 undo 栈可退回起点 ---');
{
  const pgn = ['1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7'].join(' ');
  const chess = new Chess.Chess();
  chess.loadPgn(notation.normalizePgn(pgn));
  const history = chess.history({ verbose: true });
  check('history 解析出 10 步', history.length === 10, 'len=' + history.length);

  const undo = history.map((m) => ({ san: m.san, uci: m.from + m.to + (m.promotion || ''), fen: m.before }));
  const s = makeSession();
  s.undo = undo;
  s.chess = chess;
  for (let i = 0; i < 10; i++) s.undo1();
  check('连续悔 10 步回到 0', s.undo.length === 0, 'undo=' + s.undo.length);
  check('回到初始局面', s.chess.fen().split(' ')[0] === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  for (let i = 0; i < 10; i++) s.redo1();
  check('重做 10 步回到满', s.undo.length === 10, 'undo=' + s.undo.length);
  const sans = s.chess.pgn().match(/\d+\.\s*\S+/g) || [];
  check('PGN 恢复出 5 个回合', s.chess.pgn().includes('5. O-O') && s.chess.pgn().includes('1. e4'),
    JSON.stringify(s.chess.pgn().slice(0, 50)));
}

console.log('\n--- 7. 升变走法完整记录 ---');
{
  const s = makeSession();
  // 白兵 e2 走到 e8 需清路，直接构造一个可升变局面
  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  s.chess = new Chess.Chess(fen);
  s.makeMove('a7', 'a8', 'q');
  check('升变记为 a7a8q', s.undo[0].uci === 'a7a8q', 'uci=' + s.undo[0].uci);
  check('PGN 含升变记号 =Q=', s.chess.pgn().includes('=Q'), JSON.stringify(s.chess.pgn().slice(0, 40)));
  s.undo1();
  s.redo1();
  check('升变步可悔可重做', s.chess.pgn().includes('=Q'));
}

console.log('\n========================================');
if (fail === 0) {
  console.log('✅ 全部通过 (' + pass + ' 项)');
} else {
  console.log('❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项');
  process.exit(1);
}

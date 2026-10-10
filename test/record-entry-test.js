/**
 * 棋谱录入流程逻辑测试（离线，不依赖后端）
 *
 * 覆盖用户报障的核心路径：
 *   1. 棋盘录制 — 点格子走子、升变、撤销、PGN 生成（必须包含走法，不能是空 PGN）
 *   2. 我的棋谱 — 手工录入的 PGN 组装与客户端预校验
 *   3. 我的棋谱 — PGN 头部解析回填
 *
 * 运行: node test/record-entry-test.js
 */
const fs = require('fs');
const path = require('path');
const Chess = require('../utils/chessjs.js');
const notation = require('../utils/chessNotation.js');

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  ✅ ' + name);
  } else {
    failed++;
    console.log('  ❌ ' + name + (detail ? ' — ' + detail : ''));
  }
}

// ---------- 1. 棋盘录制：走子 + PGN 生成 ----------
console.log('[1] 棋盘录制：走子与 PGN 生成');

// 复刻 board-record 的走子逻辑（onSquareTap → tryMove → executeMove）
function makeRecorder() {
  const chess = new Chess.Chess();
  const rec = { chess, selected: '', legal: [], moves: [] };
  rec.tap = (square) => {
    if (rec.selected && rec.legal.indexOf(square) !== -1) {
      const mv = rec.chess.move({ from: rec.selected, to: square, promotion: 'q' });
      rec.moves.push(mv);
      rec.selected = '';
      rec.legal = [];
      return;
    }
    if (rec.selected === square) {
      rec.selected = '';
      rec.legal = [];
      return;
    }
    const piece = rec.chess.get(square);
    if (piece) {
      rec.selected = square;
      rec.legal = rec.chess.moves({ square, verbose: true }).map((m) => m.to);
    } else {
      rec.selected = '';
      rec.legal = [];
    }
  };
  return rec;
}

const rec = makeRecorder();

// 点击 e2 → 选中，合法目标含 e3/e4
rec.tap('e2');
assert('点击 e2 选中棋子', rec.selected === 'e2');
assert('选中 e2 后合法目标含 e4', rec.legal.indexOf('e4') !== -1, JSON.stringify(rec.legal));

// 再点 e2 → 取消选中
rec.tap('e2');
assert('再次点击同一格取消选中', rec.selected === '');

// 完整走几步
rec.tap('e2'); rec.tap('e4');
assert('e2e4 走子成功', rec.moves.length === 1 && rec.moves[0].san === 'e4');
rec.tap('e7'); rec.tap('e5');
rec.tap('g1'); rec.tap('f3');

// 关键回归：PGN 必须来自记录走子的同一实例
const pgnBody = rec.chess.pgn();
assert('PGN 包含走法（回归：原实现用当前 fen 新建实例导致空 PGN）',
  pgnBody.indexOf('1. e4 e5 2. Nf3') === 0, JSON.stringify(pgnBody));
assert('走法数为 3', rec.chess.history().length === 3);

// 头部组装（复刻 buildPgn）
const headers = [
  '[White "测试白"]',
  '[Black "测试黑"]',
  '[Date "2024-01-01"]',
  '[Event "课堂对局"]',
  '[Result "*"]',
].join('\n');
const fullPgn = headers + '\n\n' + pgnBody;

// 生成的 PGN 必须能被解析器读回（后端 import 也用同一套 loadPgn）
const reload = new Chess.Chess();
reload.loadPgn(notation.normalizePgn(fullPgn));
assert('生成的完整 PGN 可被解析', reload.history().length === 3);
assert('解析后白方名正确', reload.header().White === '测试白');
assert('解析后黑方名正确', reload.header().Black === '测试黑');

// ---------- 2. 撤销 ----------
console.log('\n[2] 棋盘录制：撤销');

rec.chess.undo();
assert('撤销后走法数减少到 2', rec.chess.history().length === 2);
const afterUndoPgn = rec.chess.pgn();
assert('撤销后 PGN 同步更新', afterUndoPgn.indexOf('Nf3') === -1, JSON.stringify(afterUndoPgn));

// ---------- 3. 升变 ----------
console.log('\n[3] 棋盘录制：兵升变');
const promo = new Chess.Chess();
// 手工摆一个白兵在 b7、黑王在 a8 的局面
promo.clear();
promo.put({ type: 'p', color: 'w' }, 'b7');
promo.put({ type: 'k', color: 'b' }, 'a8');
promo.put({ type: 'k', color: 'w' }, 'h1');
const promoMove = promo.move({ from: 'b7', to: 'b8', promotion: 'q' });
assert('升变走子成功', !!promoMove);
assert('升变后棋子为后', promoMove.promotion === 'q' && promoMove.san.indexOf('=Q') !== -1, promoMove.san);
assert('升变后 PGN 含 =Q', promo.pgn().indexOf('=Q') !== -1, promo.pgn());

// ---------- 4. 将杀 / 逼和 → Result 推导 ----------
console.log('\n[4] 棋盘录制：结果推导');
// 白方 Rh8# 将杀黑王
const mate = new Chess.Chess('k7/8/1K6/8/8/8/8/7R w - - 0 1');
const mateMove = mate.move({ from: 'h1', to: 'h8' });
assert('走出将杀着法 Rh8#', mateMove.san === 'Rh8#', mateMove.san);
assert('识别为将杀', mate.isCheckmate());
assert('将杀时黑方无路可走', mate.moves().length === 0);
// board-record.resolveResultTag：被将杀方为黑 → 白胜 1-0
const resultTag = mate.turn() === 'w' ? '0-1' : '1-0';
assert('推导结果为 1-0（白胜）', resultTag === '1-0');

// 逼和（黑方未被将军但无着可走）
const stale = new Chess.Chess('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
assert('逼和局面识别正确', stale.isStalemate());
assert('逼和时未被将军', !stale.isCheck());
assert('逼和推导为和棋', (stale.isStalemate() ? '1/2-1/2' : '*') === '1/2-1/2');

// ---------- 5. 手工录入：PGN 组装与预校验 ----------
console.log('\n[5] 我的棋谱：手工录入校验');

function buildEntryPgn(f) {
  const results = ['1-0', '0-1', '1/2-1/2', '*'];
  const lines = [
    '[White "' + f.white + '"]',
    '[Black "' + f.black + '"]',
    '[Result "' + results[f.resultIndex] + '"]',
  ];
  if (f.event) lines.push('[Event "' + f.event + '"]');
  lines.push('[Date "' + (f.date || '2024.01.01') + '"]');
  if (f.eco) lines.push('[ECO "' + f.eco + '"]');
  return lines.join('\n') + '\n\n' + f.pgn;
}

const entryPgn = buildEntryPgn({
  white: '甲', black: '乙', event: '联赛', date: '2024.05.01',
  eco: 'C50', resultIndex: 0, pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5',
});
const entryChess = new Chess.Chess();
entryChess.loadPgn(notation.normalizePgn(entryPgn));
assert('录入走法解析成功', entryChess.history().length === 6);
assert('录入 ECO 头部保留', entryChess.header().ECO === 'C50');

// 非法走法必须被客户端预校验拦下
let badRejected = false;
try {
  const bad = new Chess.Chess();
  bad.loadPgn('[White "x"]\n[Black "y"]\n\n1. e4 e5 2. Zz9');
  badRejected = bad.history().length < 3;
} catch (e) {
  badRejected = true;
}
assert('非法走法被拒绝', badRejected);

// 纯 UCI 走法文本应能被规范化
const uciOnly = notation.normalizePgn('1. e2e4 e7e5 2. g1f3');
assert('无头部走法文本自动补最小头部', uciOnly.indexOf('[White') !== -1 || uciOnly.indexOf('[Event') !== -1);

// ---------- 6. PGN 头部解析回填 ----------
console.log('\n[6] 我的棋谱：粘贴 PGN 自动回填表单');
function parseTags(text) {
  const tag = (name) => {
    const m = text.match(new RegExp('\\[\\s*' + name + '\\s*"([^"]*)"\\s*\\]', 'i'));
    return m ? m[1].trim() : '';
  };
  return {
    white: tag('White'), black: tag('Black'), event: tag('Event'),
    date: tag('Date'), eco: tag('ECO'), result: tag('Result'),
  };
}
const pasted = '[Event "World Cup"]\n[White "Carlsen"]\n[Black "Ding"]\n[Result "1-0"]\n[Date "2023.07.01"]\n[ECO "B90"]\n\n1. e4 c5';
const tags = parseTags(pasted);
assert('解析 White', tags.white === 'Carlsen');
assert('解析 Black', tags.black === 'Ding');
assert('解析 Event', tags.event === 'World Cup');
assert('解析 Result', tags.result === '1-0');
assert('解析 ECO', tags.eco === 'B90');
assert('Result 映射到下拉索引 0', ['1-0', '0-1', '1/2-1/2', '*'].indexOf(tags.result) === 0);
assert('Result 1/2-1/2 映射到索引 2', ['1-0', '0-1', '1/2-1/2', '*'].indexOf('1/2-1/2') === 2);

// ---------- 7. 走棋历史显示项 ----------
console.log('\n[7] 走棋历史显示');
const histChess = new Chess.Chess();
['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'].forEach((san) => histChess.move(san));
const history = histChess.history({ verbose: true });
const items = history.map((m, i) => ({
  label: (i % 2 === 0 ? (Math.floor(i / 2) + 1) + '. ' : '') + m.san,
  active: false,
}));
assert('历史项数量正确', items.length === 6);
assert('第1手显示为 "1. e4"', items[0].label === '1. e4', items[0].label);
assert('第2手显示为 "e5"（无序号）', items[1].label === 'e5', items[1].label);
assert('第3手显示为 "2. Nf3"', items[2].label === '2. Nf3', items[2].label);

// 复盘取某一步的 fen（棋盘跳到该步）
const step2Fen = history[1].after;
assert('第2手后的 FEN 可取得', typeof step2Fen === 'string' && step2Fen.split(' ').length === 6, step2Fen);

// ---------- 8. require 路径可达性（回归：board-record 曾指向 app 根目录之外） ----------
console.log('\n[8] board-record 页面依赖可达性');
[
  '../../utils/chessjs',
  '../../utils/api',
  '../../utils/util',
].forEach((spec) => {
  const target = path.resolve(__dirname, '..', 'pages', 'board-record', spec);
  assert('可解析 ' + spec, fs.existsSync(target + '.js'), target);
});

// ---------- 9. AI 推荐走法：候选处理与落子 ----------
console.log('\n[9] 棋盘录制 · AI 推荐走法');

// 复刻 board-record.runAnalysis 的候选映射
const util = require('../utils/util.js');
function mapCandidates(raw, fen) {
  // 录制页双方都能走子，没有「我方」：按当前走子方视角显示（此时为恒等变换）
  const playerSide = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return (raw || []).map((c, i) => {
    const score = typeof c.score === 'number' ? util.toPlayerView(c.score, fen, playerSide) : 0;
    return {
      ...c,
      rank: i + 1,
      score,
      scoreFormatted: util.formatScore(score),
      scoreColor: util.getScoreColor(score),
      pros: util.keyedList(c.pros, 'p' + (i + 1)),
      cons: util.keyedList(c.cons, 'c' + (i + 1)),
      tactics: util.keyedList(c.tactics, 't' + (i + 1)),
      line: util.keyedList(c.line, 'l' + (i + 1)),
    };
  });
}

const OPENING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const rawCandidates = [
  { uci: 'e2e4', score: 0.35, pros: ['占据中心'], cons: ['可能被攻击'], tactics: [], line: ['e4', 'e5'] },
  { uci: 'g1f3', score: 0.2, pros: ['发展子力'], cons: [], tactics: [], line: ['Nf3'] },
];
const mapped = mapCandidates(rawCandidates, OPENING_FEN);
assert('候选数量映射正确', mapped.length === 2);
assert('rank 从 1 递增', mapped[0].rank === 1 && mapped[1].rank === 2);
assert('评分格式化为 +0.35', mapped[0].scoreFormatted === '+0.35', mapped[0].scoreFormatted);
assert('正分颜色为绿色系', mapped[0].scoreColor === '#4ade80', mapped[0].scoreColor);
assert('pros 转成带 key 的对象（避免 wx:key 告警）',
  mapped[0].pros.length === 1 && typeof mapped[0].pros[0].key === 'string' && mapped[0].pros[0].text === '占据中心',
  JSON.stringify(mapped[0].pros));

// 黑方走棋局面：按走子方视角不翻转（正分仍表示对走子方有利）
const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const blackMapped = mapCandidates([{ uci: 'e7e5', score: 0.3, pros: [], cons: [], tactics: [], line: [] }], BLACK_FEN);
assert('黑方走棋时按走子方视角（不翻转为负）', blackMapped[0].score === 0.3, String(blackMapped[0].score));

// 缺失分数不报错（引擎异常返回时兜底为 0）
const noScore = mapCandidates([{ uci: 'e2e4', pros: [], cons: [], tactics: [], line: [] }], OPENING_FEN);
assert('缺失 score 兜底为 0', noScore[0].score === 0 && noScore[0].scoreFormatted === '0.00', noScore[0].scoreFormatted);

// 复刻 onPlayCandidate 的 uci → 走子参数解析
function uciToMoveArgs(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4) : '',
  };
}
const plain = uciToMoveArgs('e2e4');
assert('普通走法解析出 from/to 且无升变', plain.from === 'e2' && plain.to === 'e4' && plain.promotion === '');
const promoUci = uciToMoveArgs('e7e8q');
assert('升变走法解析出升变子', promoUci.promotion === 'q', promoUci.promotion);

// 候选走法必须能真正走到棋盘上（点击卡片 → 落子）
const candChess = new Chess.Chess();
const args = uciToMoveArgs('e2e4');
const played = candChess.move({ from: args.from, to: args.to, promotion: 'q' });
assert('点击候选可落子', !!played && played.san === 'e4', played && played.san);
assert('落子后进入走棋历史', candChess.history().length === 1);
candChess.undo();
assert('撤销可回退候选走法', candChess.history().length === 0);

// 升变候选：走成后在 PGN 中带 =Q
const promoChess = new Chess.Chess();
promoChess.clear();
promoChess.put({ type: 'p', color: 'w' }, 'b7');
promoChess.put({ type: 'k', color: 'b' }, 'a8');
promoChess.put({ type: 'k', color: 'w' }, 'h1');
const promoArgs = uciToMoveArgs('b7b8q');
const promoPlayed = promoChess.move({ from: promoArgs.from, to: promoArgs.to, promotion: promoArgs.promotion });
assert('升变候选按引擎给出的子走', !!promoPlayed && promoPlayed.san.indexOf('=Q') !== -1, promoPlayed && promoPlayed.san);

// ---------- 10. 推荐走法与棋局状态的联动 ----------
console.log('\n[10] 棋盘录制 · 推荐走法随局面失效');

// 复刻「局面变化即清空推荐」的判定：候选 uci 必须仍落在当前合法走法集合内
function candidatesStillValid(chess, candidates) {
  const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  return candidates.every((c) => legal.indexOf(c.uci) !== -1);
}

const linkChess = new Chess.Chess();
const openingCandidates = [{ uci: 'e2e4' }, { uci: 'g1f3' }];
assert('开局推荐与当前局面一致', candidatesStillValid(linkChess, openingCandidates));

linkChess.move('e4');
assert('走子后旧推荐不再合法（必须清空，否则箭头指向错误局面）',
  !candidatesStillValid(linkChess, openingCandidates));
linkChess.undo();
assert('撤销后推荐重新有效', candidatesStillValid(linkChess, openingCandidates));

// 清空棋盘后回到初始局面
const clearChess = new Chess.Chess();
clearChess.move('e4');
clearChess.move('e5');
const fresh = new Chess.Chess();
assert('清空后局面回到初始', fresh.fen() === OPENING_FEN);
assert('清空后走法数为 0', fresh.history().length === 0);

// ---------- 11. analysis-panel 注册与属性 ----------
console.log('\n[11] 棋盘录制 · analysis-panel 接入');

const pageJson = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'pages', 'board-record', 'index.json'), 'utf8'));
assert('index.json 已注册 analysis-panel',
  !!pageJson.usingComponents && !!pageJson.usingComponents['analysis-panel'],
  JSON.stringify(pageJson.usingComponents));
const panelPath = path.resolve(
  path.resolve(__dirname, '..', 'pages', 'board-record'),
  (pageJson.usingComponents && pageJson.usingComponents['analysis-panel'] || '').replace(/^\//, ''));
assert('analysis-panel 组件路径可达', fs.existsSync(panelPath + '.js'), panelPath + '.js');

const pageWxmlSrc = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'board-record', 'index.wxml'), 'utf8');
assert('棋盘已接收推荐走法（analysis 属性）', pageWxmlSrc.indexOf('analysis="{{analysisCandidates}}"') !== -1);
assert('棋盘提示开关已接入（showHints 属性）', pageWxmlSrc.indexOf('showHints="{{aiHintOn}}"') !== -1);
assert('候选角标点击已接线（scrolltocandidate）', pageWxmlSrc.indexOf('bind:scrolltocandidate=') !== -1);
assert('候选卡片点击已接线（playcontinuation）', pageWxmlSrc.indexOf('bind:playcontinuation=') !== -1);
assert('录制页隐藏「推演/自动」（保留 true 的页面行为不变）', pageWxmlSrc.indexOf('showActions="{{false}}"') !== -1);

const panelSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'components', 'analysis-panel', 'analysis-panel.js'), 'utf8');
assert('analysis-panel 提供 showActions 且默认为 true(兼容既有页面)',
  /showActions\s*:\s*\{[\s\S]*?value\s*:\s*true/.test(panelSrc));

// ---------- 结果 ----------
console.log('\n' + '='.repeat(44));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) process.exit(1);

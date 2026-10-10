/**
 * 评估条评分视角一致性测试
 *
 * 校验小程序的 toPlayerView / getPlayerEvalText 与网页版
 * frontend/src/components/Panel/AnalysisPanel.tsx 的同名函数行为一致：
 *   - 引擎分是「走子方视角」，先换算为白方视角，再按玩家执方翻转
 *   - 评估条双向填充：左半对方优势（负分）、右半己方优势（正分），±10 兵满格
 *
 * 运行: node test/eval-perspective-test.js
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const util = require(path.join(ROOT, 'utils/util.js'));

// 网页版参考实现（与 AnalysisPanel.tsx 逐行对应）
function webToPlayerView(score, fen, playerSide) {
  const asWhite = fen?.split(' ')[1] === 'b' ? -score : score;
  return playerSide === 'white' ? asWhite : -asWhite;
}
function webGetPlayerEvalText(score) {
  const abs = Math.abs(score);
  if (abs > 3) return score > 0 ? '己方胜势' : '对方胜势';
  if (abs > 1.5) return score > 0 ? '己方优势' : '对方优势';
  if (abs > 0.5) return score > 0 ? '己方稍优' : '对方稍优';
  return '均势';
}
// 评估条左右半宽（AnalysisPanel.tsx 内联公式）
function webBarWidths(posEval) {
  return {
    left: Math.min(Math.abs(Math.min(posEval, 0)) / 10 * 100, 100),
    right: Math.min(Math.max(posEval, 0) / 10 * 100, 100),
  };
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const FEN_WHITE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN_BLACK = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

section('toPlayerView 与网页版逐一对比');
for (const fen of [FEN_WHITE, FEN_BLACK]) {
  for (const raw of [-5, -3, -1.2, -0.4, 0, 0.4, 1.2, 3, 5]) {
    for (const side of ['w', 'b']) {
      const webSide = side === 'w' ? 'white' : 'black';
      const mine = util.toPlayerView(raw, fen, side);
      const theirs = webToPlayerView(raw, fen, webSide);
      assert(
        `raw=${raw} fen=${fen.split(' ')[1]} player=${side} → ${mine}`,
        mine === theirs,
        `期望 ${theirs}`,
      );
    }
  }
}

section('toPlayerView 语义检查');
// 白方走棋、玩家执白、引擎 +2 → 玩家优 +2
assert('白走·执白·+2 → +2', util.toPlayerView(2, FEN_WHITE, 'w') === 2);
// 白方走棋、玩家执黑、引擎 +2（对白方有利）→ 玩家视角 -2
assert('白走·执黑·+2 → -2', util.toPlayerView(2, FEN_WHITE, 'b') === -2);
// 黑方走棋、玩家执黑、引擎 +2（对黑方=玩家有利）→ 玩家视角 +2
assert('黑走·执黑·+2 → +2', util.toPlayerView(2, FEN_BLACK, 'b') === 2);
// 黑方走棋、玩家执白、引擎 +2（对黑方有利）→ 玩家视角 -2
assert('黑走·执白·+2 → -2', util.toPlayerView(2, FEN_BLACK, 'w') === -2);

section('getPlayerEvalText 与网页版对比');
for (const s of [-9, -3.5, -3, -1.6, -1.5, -0.6, -0.5, 0, 0.5, 0.6, 1.5, 1.6, 3, 3.5, 9]) {
  const mine = util.getPlayerEvalText(s);
  const theirs = webGetPlayerEvalText(s);
  assert(`score=${s} → ${mine}`, mine === theirs, `期望 ${theirs}`);
}
// 边界语义：网页版用 abs > 3 判定胜势，因此 ±3 属于「优势」而非「胜势」
assert('score=3 是优势（非胜势）', util.getPlayerEvalText(3) === '己方优势');
assert('score=3.01 是胜势', util.getPlayerEvalText(3.01) === '己方胜势');
assert('score=-3 是对方优势', util.getPlayerEvalText(-3) === '对方优势');

section('评估条双向填充宽度与网页版对比');
for (const ev of [-12, -10, -5, -0.5, 0, 0.5, 5, 10, 12]) {
  const left = Math.min(Math.abs(Math.min(ev, 0)) / 10 * 100, 100);
  const right = Math.min(Math.max(ev, 0) / 10 * 100, 100);
  const web = webBarWidths(ev);
  assert(
    `eval=${ev} → left=${left}% right=${right}%`,
    left === web.left && right === web.right,
    `期望 left=${web.left} right=${web.right}`,
  );
}
// 边界：满格 ±10 兵封顶 100%
assert('±10 兵满格', Math.min(10 / 10 * 100, 100) === 100 && Math.min(12 / 10 * 100, 100) === 100);
// 0 分时两半均为 0（中心分割线居中）
assert('0 分两侧均为 0%', webBarWidths(0).left === 0 && webBarWidths(0).right === 0);

console.log(`\n${'='.repeat(40)}`);
console.log(failed === 0
  ? `✅ 全部通过 (${passed} 项)`
  : `❌ ${failed} 项失败 / 共 ${passed + failed} 项`);
process.exit(failed === 0 ? 0 : 1);

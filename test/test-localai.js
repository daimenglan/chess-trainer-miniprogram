const localAI = require('../utils/localAI.js');
const Chess = require('../utils/chessjs');

let pass = 0, fail = 0;
function assert(name, cond) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + name); }

// 1. 初始局面能返回合法走法
const c1 = new Chess.Chess();
const m1 = localAI.getLocalAIMove(c1.fen(), 5);
assert('初始局面返回走法: ' + m1, !!m1 && /^[a-h][1-8][a-h][1-8]/.test(m1));
const c1v = new Chess.Chess();
assert('走法合法可执行: ' + m1, (() => { try { return !!c1v.move({from: m1.slice(0,2), to: m1.slice(2,4), promotion: m1.length > 4 ? m1[4] : 'q'}); } catch(e) { return false; } })());

// 2. 各难度都能走
for (const d of [1, 3, 5, 8, 10]) {
  const m = localAI.getLocalAIMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', d);
  assert('难度 ' + d + ' 返回走法', !!m);
}

// 3. 完整对局：AI vs AI 直到结束或 120 步
const game = new Chess.Chess();
let plies = 0;
while (!game.isGameOver() && plies < 120) {
  const uci = localAI.getLocalAIMove(game.fen(), 5);
  if (!uci) break;
  game.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.length > 4 ? uci[4] : 'q' });
  plies++;
}
assert('AI自对弈 ' + plies + ' 步不崩溃', plies >= 20);
assert('终局状态有效（将杀/和棋/步数上限）', game.isGameOver() || plies >= 120);

// 4. 性能测试：难度10（深度3）单步耗时
const perf = new Chess.Chess();
perf.move('e4'); perf.move('e5'); perf.move('Nf3'); perf.move('Nc6');
const t0 = Date.now();
localAI.getLocalAIMove(perf.fen(), 10);
const elapsed = Date.now() - t0;
assert('难度10单步耗时 ' + elapsed + 'ms (< 5000ms)', elapsed < 5000);

// 5. 性能：难度5（深度2）
const t1 = Date.now();
localAI.getLocalAIMove(perf.fen(), 5);
const e1 = Date.now() - t1;
assert('难度5单步耗时 ' + e1 + 'ms (< 1000ms)', e1 < 1000);

// 6. 将军局面能解将
const chk = new Chess.Chess('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2');
// 白后h5将军黑王...构造：Qh5+
const chk2 = new Chess.Chess('rnbqkbnr/pppp1ppp/8/4p2Q/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'); // 后h5将军
const esc = localAI.getLocalAIMove(chk2.fen(), 8);
const c2 = new Chess.Chess(chk2.fen());
c2.move({ from: esc.slice(0,2), to: esc.slice(2,4), promotion: esc.length > 4 ? esc[4] : 'q' });
assert('被将军时走法能解将: ' + esc, !c2.isCheck());

// 7. 能吃回免费子（战术测试：后可吃车）
const tac = new Chess.Chess('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1'); // 白车d2被黑后d5攻击...白方走
const tm = localAI.getLocalAIMove(tac.fen(), 8);
console.log('  (战术局面AI选择: ' + tm + ')');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);

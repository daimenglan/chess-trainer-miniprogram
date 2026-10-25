/**
 * 习题流程自动化测试 — 使用 chess.js 验证每一步走法合法性
 * 运行: node test/puzzle-flow-test.js
 */
const Chess = require('../utils/chessjs.js');

// Mock wx
global.wx = {
  showToast: function() {}, showLoading: function() {}, hideLoading: function() {},
  showModal: function() { return Promise.resolve({ confirm: true }); },
  setStorageSync: function() {}, getStorageSync: function() { return null; }, removeStorageSync: function() {},
  getSystemInfoSync: function() { return { windowWidth: 375, windowHeight: 667, platform: 'devtools' }; },
  createSelectorQuery: function() { return { select: function() { return { boundingClientRect: function(cb) { cb({ width: 600, height: 600 }); return { exec: function() {} }; }, fields: function() { return { exec: function() {} }; } }; } }; },
  request: function() { return Promise.resolve({ data: {}, statusCode: 200 }); },
  navigateTo: function() {}, switchTab: function() {}, redirectTo: function() {},
};
global.getApp = function() { return { globalData: { baseUrl: 'http://localhost:3001', user: { userId: 1, username: 'test' }, token: 'test-token', settings: { theme: 'blueWhite', boardColorPreset: 'blueWhite', pieceStyle3d: false, boardFlipped: false, soundEnabled: true, showHints: false, analysisDepth: 10, analysisMultiPv: 3, aiDifficulty: 5 }, analysis: [], analysisError: null, boardUpdateKey: 0 }, saveSettings: function() {}, getDefaultSettings: function() { return {}; }, setToken: function() {} }; };

// ===== 验证 FEN 中的所有走法是否合法 =====
function verifySolution(fen, allMoves) {
  try {
    var c = new Chess.Chess(fen);
    for (var i = 0; i < allMoves.length; i++) {
      var m = c.move({ from: allMoves[i].slice(0,2), to: allMoves[i].slice(2,4), promotion: allMoves[i].length > 4 ? allMoves[i].slice(4) : 'q' });
      if (!m) return 'Move ' + i + ' (' + allMoves[i] + ') illegal';
    }
    return null;
  } catch(e) { return 'Error: ' + e.message; }
}

// ===== 验证通过的标准习题 =====
var PUZZLES = {};

// 1. 白方一步将杀: Qxf7#
(function() {
  var fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  var allMoves = ['h5f7'];
  var err = verifySolution(fen, allMoves);
  if (err) throw new Error('Puzzle 1: ' + err);
  PUZZLES.scholarMate = { fen: fen, orientation: 'white', userMoves: ['h5f7'], oppMoves: [] };
})();

// 2. 白方 Bxf7+ 叉子
(function() {
  var fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
  var allMoves = ['c4f7'];
  var err = verifySolution(fen, allMoves);
  if (err) throw new Error('Puzzle 2: ' + err);
  PUZZLES.bxf7Fork = { fen: fen, orientation: 'white', userMoves: ['c4f7'], oppMoves: ['e8f7'] };
})();

// 3. 白方两步: Bxf7+ Kxf7 Ng5+
(function() {
  var fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
  var allMoves = ['c4f7', 'e8f7', 'f3g5'];
  var err = verifySolution(fen, allMoves);
  if (err) throw new Error('Puzzle 3: ' + err);
  PUZZLES.twoStepWhite = { fen: fen, orientation: 'white', userMoves: ['c4f7', 'f3g5'], oppMoves: ['e8f7'] };
})();

// 4. 黑方先走: Nxe4 (叉子)
(function() {
  var fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N5/PPPP1PPP/R1BQKB1R b KQkq - 2 4';
  var allMoves = ['f6e4', 'c3e4'];
  var err = verifySolution(fen, allMoves);
  if (err) throw new Error('Puzzle 4: ' + err);
  PUZZLES.nxe4Fork = { fen: fen, orientation: 'black', userMoves: ['f6e4'], oppMoves: ['c3e4'] };
})();

// 5. 黑方两步: Nxe4 (白方应 Nxe4) Qh4
(function() {
  var fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N5/PPPP1PPP/R1BQKB1R b KQkq - 2 4';
  var allMoves = ['f6e4', 'c3e4', 'd8h4'];
  var err = verifySolution(fen, allMoves);
  if (err) throw new Error('Puzzle 5: ' + err);
  PUZZLES.twoStepBlack = { fen: fen, orientation: 'black', userMoves: ['f6e4', 'd8h4'], oppMoves: ['c3e4'] };
})();

console.log('所有习题 FEN 验证通过 ✅\n');

// ===== 模拟 API（solution 只含用户走法，oppMoves 是自动应招） =====
var mockApi = {
  puzzles: [], nextId: 1,

  addPuzzle: function(fen, orientation, userMoves, oppMoves) {
    var id = this.nextId++;
    // 构建完整走法序列: [user1, opp1, user2, opp2, ...]
    var allMoves = [];
    for (var i = 0; i < userMoves.length; i++) {
      allMoves.push(userMoves[i]);
      if (i < oppMoves.length) allMoves.push(oppMoves[i]);
    }
    this.puzzles.push({ id: id, fen: fen, orientation: orientation, userMoves: userMoves.slice(), oppMoves: oppMoves.slice(), allMoves: allMoves, moves: [], failed: false, completed: false });
    return id;
  },

  startPuzzle: function(filters) {
    for (var i = 0; i < this.puzzles.length; i++) {
      var p = this.puzzles[i];
      if (!p.completed) {
        return { data: { attemptId: 'attempt_' + p.id, puzzle: { id: p.id, difficulty: 1200, phase: 'middlegame', pieceCount: 8, themes: ['fork'] }, fen: p.fen, orientation: p.orientation, stepIndex: p.moves.length, totalSteps: p.allMoves.length, attemptsLeft: p.failed ? 2 : 3 } };
      }
    }
    return { data: null };
  },

  submitPuzzleMove: function(attemptId, uci) {
    var p = null;
    for (var i = 0; i < this.puzzles.length; i++) { if ('attempt_' + this.puzzles[i].id === attemptId) { p = this.puzzles[i]; break; } }
    if (!p) return { data: null };

    // 检查是否完成
    if (p.moves.length >= p.allMoves.length) {
      return { data: { legal: true, correct: false, completed: true, result: 1, message: '已完成', ratingChange: 0, newRating: 1200 } };
    }

    // 检查合法性
    var chess = new Chess.Chess(p.fen);
    for (var i = 0; i < p.moves.length; i++) {
      try { chess.move({ from: p.moves[i].slice(0,2), to: p.moves[i].slice(2,4), promotion: p.moves[i].length > 4 ? p.moves[i].slice(4) : 'q' }); } catch(e) { return { data: { legal: false, correct: false } }; }
    }
    try {
      var testMove = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.length > 4 ? uci.slice(4) : 'q' });
      if (!testMove) return { data: { legal: false, correct: false, message: '非法走法' } };
    } catch(e) { return { data: { legal: false, correct: false, message: '非法走法' } }; }

    // 检查是否正确（对比 allMoves 的当前位置）
    var expectedUci = p.allMoves[p.moves.length];
    if (uci !== expectedUci) {
      p.failed = true;
      // 错误走法不推进 moves 序列，只减少尝试次数
      return { data: { legal: true, correct: false, attemptsLeft: p.failed ? 2 : 3, message: '不正确，再想想' } };
    }

    // 正确走法
    p.moves.push(uci);

    // 自动走对手的应招
    var opponentMoveUci = '';
    if (p.moves.length < p.allMoves.length) {
      opponentMoveUci = p.allMoves[p.moves.length];
      // 检查 opponentMove 是否走的是用户方的子（即不是用户应走的下一步）
      // 如果这个走法颜色与orientation不同，就是对手应招
      try { chess.move({ from: opponentMoveUci.slice(0,2), to: opponentMoveUci.slice(2,4), promotion: opponentMoveUci.length > 4 ? opponentMoveUci.slice(4) : 'q' }); } catch(e) {}
      p.moves.push(opponentMoveUci);
    }

    var nextFen = chess.fen();

    // 计算用户完成步数
    var userCompleted = 0;
    for (var i = 0; i < p.moves.length; i++) {
      if (i % 2 === 0) userCompleted++;
    }
    // 用户应走的步数
    var userTotal = 0;
    for (var i = 0; i < p.allMoves.length; i++) {
      if (i % 2 === 0) userTotal++;
    }
    var completed = userCompleted >= userTotal;

    var resultData = { legal: true, correct: true, opponentMoveUci: opponentMoveUci, nextFen: nextFen, attemptsLeft: 3 };
    if (completed) { resultData.completed = true; resultData.result = 2; resultData.ratingChange = 15; resultData.newRating = 1215; resultData.solutionMoves = p.allMoves.slice(); resultData.message = undefined; }
    else { resultData.completed = false; resultData.message = '正确！'; }
    return { data: resultData };
  },

  requestHint: function(attemptId) {
    var p = null;
    for (var i = 0; i < this.puzzles.length; i++) { if ('attempt_' + this.puzzles[i].id === attemptId) { p = this.puzzles[i]; break; } }
    if (!p || p.moves.length >= p.allMoves.length) return { data: null };
    var uci = p.allMoves[p.moves.length];
    return { data: { from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci.length > 4 ? uci.slice(4) : '', san: uci } };
  },

  reset: function() { this.puzzles = []; this.nextId = 1; }
};

// ===== 测试引擎 =====
var passed = 0, failed = 0, total = 0;
function assert(name, cond, detail) { total++; if (!detail) detail = ''; if (cond) { passed++; console.log('  ✅ ' + name); } else { failed++; console.log('  ❌ ' + name + ' ' + detail); } }
function section(title) { console.log('\n' + '='.repeat(60) + '\n' + title); }

// ==================================================================
section('1. Chess.js 基本走子');
var c = new Chess.Chess();
assert('初始白方', c.turn() === 'w');
assert('e2e4 合法', !!c.move({from:'e2',to:'e4'}));
assert('走子后黑方', c.turn() === 'b');
assert('e4 白兵', c.get('e4')?.color === 'w');
assert('e7 黑兵', c.get('e7')?.color === 'b');

section('2. 白方先走 1 步');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.scholarMate.fen, 'white', PUZZLES.scholarMate.userMoves, PUZZLES.scholarMate.oppMoves);
var res = mockApi.startPuzzle({});
assert('orientation=white', res.data.orientation === 'white');
assert('用户执白', new Chess.Chess(res.data.fen).turn() === 'w');
var sr = mockApi.submitPuzzleMove(res.data.attemptId, 'h5f7');
assert('h5f7 正确', sr.data.legal && sr.data.correct && sr.data.completed === true);

section('3. 白方 Bxf7+ 叉子');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.bxf7Fork.fen, 'white', PUZZLES.bxf7Fork.userMoves, PUZZLES.bxf7Fork.oppMoves);
res = mockApi.startPuzzle({});
sr = mockApi.submitPuzzleMove(res.data.attemptId, 'c4f7');
assert('c4f7 正确', sr.data.legal && sr.data.correct && sr.data.completed === true);
assert('对手应有应招', sr.data.opponentMoveUci === 'e8f7');

section('4. 白方两步');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.twoStepWhite.fen, 'white', PUZZLES.twoStepWhite.userMoves, PUZZLES.twoStepWhite.oppMoves);
res = mockApi.startPuzzle({});
var r1 = mockApi.submitPuzzleMove(res.data.attemptId, 'c4f7');
assert('第1步 c4f7 正确', r1.data.legal && r1.data.correct && r1.data.completed === false);
assert('对手应招 Kxf7', r1.data.opponentMoveUci === 'e8f7');
var r2 = mockApi.submitPuzzleMove(res.data.attemptId, 'f3g5');
assert('第2步 f3g5 正确', r2.data.legal && r2.data.correct && r2.data.completed === true);

section('5. 黑方先走 1 步 (Nxe4)');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.nxe4Fork.fen, 'black', PUZZLES.nxe4Fork.userMoves, PUZZLES.nxe4Fork.oppMoves);
res = mockApi.startPuzzle({});
assert('orientation=black', res.data.orientation === 'black');

// 自动走黑方第一步
var hint = mockApi.requestHint(res.data.attemptId);
assert('黑方第一步 hint=f6e4', hint.data && hint.data.from + hint.data.to === 'f6e4');
var initSub = mockApi.submitPuzzleMove(res.data.attemptId, hint.data.from + hint.data.to);
assert('黑方 Nxe4 正确', initSub.data.legal && initSub.data.correct && initSub.data.completed === true);
assert('对手应招 Nc3xe4', initSub.data.opponentMoveUci === 'c3e4');

section('6. 黑方两步 (Nxe4 ... Qh4)');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.twoStepBlack.fen, 'black', PUZZLES.twoStepBlack.userMoves, PUZZLES.twoStepBlack.oppMoves);
res = mockApi.startPuzzle({});
assert('orientation=black', res.data.orientation === 'black');

hint = mockApi.requestHint(res.data.attemptId);
var initSub2 = mockApi.submitPuzzleMove(res.data.attemptId, hint.data.from + hint.data.to);
assert('黑方第1步 Nxe4 正确', initSub2.data.legal && initSub2.data.correct && initSub2.data.completed === false);
assert('对手应招 Nc3xe4', initSub2.data.opponentMoveUci === 'c3e4');

var r2b = mockApi.submitPuzzleMove(res.data.attemptId, 'd8h4');
assert('黑方第2步 Qh4 正确', r2b.data.legal && r2b.data.correct && r2b.data.completed === true);

section('7. 错误走法');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.bxf7Fork.fen, 'white', PUZZLES.bxf7Fork.userMoves, PUZZLES.bxf7Fork.oppMoves);
res = mockApi.startPuzzle({});
var wrong = mockApi.submitPuzzleMove(res.data.attemptId, 'e1g1');
assert('错误走法不正确', wrong.data.legal && wrong.data.correct === false);
assert('尝试次数减少', wrong.data.attemptsLeft <= 2);
var correct = mockApi.submitPuzzleMove(res.data.attemptId, 'c4f7');
assert('再走正确可接受', correct.data.legal && correct.data.correct);

section('8. 非法走法');
mockApi.reset();
mockApi.addPuzzle('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', ['e2e4'], []);
res = mockApi.startPuzzle({});
var ill = mockApi.submitPuzzleMove(res.data.attemptId, 'e1e2');
assert('e1e2 非法', ill.data.legal === false);

section('9. 提示');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.bxf7Fork.fen, 'white', PUZZLES.bxf7Fork.userMoves, PUZZLES.bxf7Fork.oppMoves);
res = mockApi.startPuzzle({});
hint = mockApi.requestHint(res.data.attemptId);
assert('提示 from=c4', hint.data.from === 'c4');
assert('提示 to=f7', hint.data.to === 'f7');
assert('提示含 san', typeof hint.data.san === 'string');

section('10. 将杀检测');
var mate = new Chess.Chess();
mate.move({from:'f2',to:'f3'}); mate.move({from:'e7',to:'e5'});
mate.move({from:'g2',to:'g4'}); mate.move({from:'d8',to:'h4'});
assert('白方被将杀', mate.isCheckmate() && mate.isGameOver());

section('11. 棋子颜色选取');
var cc = new Chess.Chess();
assert('e2 白兵', cc.get('e2')?.color === 'w');
assert('e7 黑兵', cc.get('e7')?.color === 'b');

section('12. 最后一步箭头');
cc.move({from:'e2',to:'e4'});
var hist = cc.history({verbose:true});
assert('from=e2', hist[0].from === 'e2');
assert('to=e4', hist[0].to === 'e4');

section('13. 提示箭头');
mockApi.reset();
mockApi.addPuzzle(PUZZLES.bxf7Fork.fen, 'white', PUZZLES.bxf7Fork.userMoves, PUZZLES.bxf7Fork.oppMoves);
res = mockApi.startPuzzle({});
hint = mockApi.requestHint(res.data.attemptId);
assert('箭头 from=c4', hint.data.from === 'c4');
assert('箭头 to=f7', hint.data.to === 'f7');

section('\n===== 测试总结 =====');
console.log('总计: ' + total + '  |  通过: ' + passed + '  |  失败: ' + failed);
process.exit(failed > 0 ? 1 : 0);
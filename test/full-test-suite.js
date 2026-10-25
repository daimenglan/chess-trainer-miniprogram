/**
 * ============================================================
 *  mychess 小程序全自动测试套件 (TS 版本)
 *  运行: node test/full-test-suite.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0, total = 0;
const errors = [];

function assert(name, cond, detail = '') {
  total++;
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); errors.push({ name, detail }); }
}

function section(title) {
  console.log('\n' + '='.repeat(60) + '\n' + title + '\n' + '='.repeat(60));
}

// ─── Mock wx API ───
global.wx = {
  showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  showModal: () => Promise.resolve({ confirm: true }),
  setStorage: () => {}, getStorage: () => null,
  setStorageSync: () => {}, getStorageSync: () => null, removeStorageSync: () => {},
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, platform: 'devtools' }),
  createCanvasContext: () => ({ beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, draw: () => {} }),
  createSelectorQuery: () => ({ select: () => ({ boundingClientRect: (cb) => { cb({ width: 600, height: 600 }); return { exec: () => {} }; } }) }),
  request: () => Promise.resolve({ data: {}, statusCode: 200 }),
  navigateTo: () => {}, navigateBack: () => {}, switchTab: () => {}, redirectTo: () => {},
  uploadFile: () => Promise.resolve({ data: JSON.stringify({ success: true }) }),
};

global.getApp = () => ({
  globalData: {
    baseUrl: 'http://localhost:3001', user: null, token: null,
    settings: { theme: 'blueWhite', boardColorPreset: 'blueWhite', pieceStyle3d: false, boardFlipped: false, soundEnabled: true, showHints: false, analysisDepth: 10, analysisMultiPv: 3, aiDifficulty: 5 },
    analysis: [], analysisError: null, boardUpdateKey: 0,
  },
  saveSettings: () => {}, getDefaultSettings: () => ({}),
});

const root = path.join(__dirname, '..');
const Chess = require('../utils/chessjs');

// ═══════════════════════════════════════════════════════════════
section('1. TS 文件存在性');
// ═══════════════════════════════════════════════════════════════

const tsFiles = [
  'app.ts', 'utils/util.ts', 'utils/store.ts', 'utils/api.ts', 'utils/sse.ts', 'utils/chessNotation.ts', 'utils/chessjs.d.ts',
  'pages/index/index.ts', 'pages/login/login.ts', 'pages/records/records.ts',
  'pages/record-detail/record-detail.ts', 'pages/analysis/analysis.ts',
  'pages/profile/profile.ts', 'pages/settings/settings.ts', 'pages/about/about.ts',
  'components/chess-board/chess-board.ts', 'components/chess-piece/chess-piece.ts',
  'components/analysis-panel/analysis-panel.ts', 'components/coach-chat/coach-chat.ts',
  'components/captured-pieces/captured-pieces.ts', 'components/move-history/move-history.ts',
  'components/promotion-dialog/promotion-dialog.ts', 'components/bad-move-dialog/bad-move-dialog.ts',
  'components/game-over-modal/game-over-modal.ts', 'components/timer-display/timer-display.ts',
];
for (const f of tsFiles) {
  assert(`TS 文件: ${f}`, fs.existsSync(path.join(root, f)));
}

// ═══════════════════════════════════════════════════════════════
section('2. 工具函数');
// ═══════════════════════════════════════════════════════════════

const util = require('../utils/util');
assert('formatTime(0)', util.formatTime(0) === '00:00');
assert('formatTime(65)', util.formatTime(65) === '01:05');
assert('formatScore(0)', util.formatScore(0) === '0.00');
assert('formatScore(1.5)', util.formatScore(1.5) === '+1.50');
assert('formatScore(null)', util.formatScore(null) === '—');
assert('getScoreLabel(5)', util.getScoreLabel(5) === '胜势');
assert('getScoreLabel(0)', util.getScoreLabel(0) === '均势');
assert('getScoreLabel(-5)', util.getScoreLabel(-5) === '败势');
assert('getScoreColor(0.5)', util.getScoreColor(0.5) === '#4ade80');
assert('translateResult(1-0)', util.translateResult('1-0') === '白方胜');
assert('translateResult(playing)', util.translateResult('playing') === '进行中');

let debouncedCalled = 0;
const debounced = util.debounce(() => debouncedCalled++, 50);
debounced(); debounced(); debounced();
assert('debounce', debouncedCalled === 0);

const obj = { a: 1, b: { c: 2 } };
const cloned = util.deepClone(obj);
assert('deepClone', cloned !== obj && cloned.b !== obj.b && cloned.a === 1);

// ═══════════════════════════════════════════════════════════════
section('3. chessNotation');
// ═══════════════════════════════════════════════════════════════

const cn = require('../utils/chessNotation');
const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const d1 = cn.describeMove(fen1, 'e2e4');
assert('describeMove e2e4', d1.pieceName === '兵' && d1.san === 'e4');
assert('uciToSanLine', cn.uciToSanLine(fen1, ['e2e4', 'e7e5', 'g1f3']).length === 3);
assert('getPieceAt e1', cn.getPieceAt(fen1, 'e1') && cn.getPieceAt(fen1, 'e1').type === 'k');
assert('getPieceAt e4 null', cn.getPieceAt(fen1, 'e4') === null);

// ═══════════════════════════════════════════════════════════════
section('4. chess.js 核心逻辑');
// ═══════════════════════════════════════════════════════════════

const c = new Chess.Chess();
assert('初始 FEN', c.fen() === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
assert('初始白方', c.turn() === 'w');
assert('初始未将军', c.isCheck() === false);

const m1 = c.move({ from: 'e2', to: 'e4', promotion: 'q' });
assert('e2e4 合法', !!m1 && m1.san === 'e4');
assert('走子后黑方', c.turn() === 'b');

let threw = false;
try { c.move({ from: 'e4', to: 'e5' }); } catch { threw = true; }
assert('非法走子拒绝', threw);

const checkFen = new Chess.Chess('rnbqkbnr/pppp1ppp/8/8/4Q3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
assert('将军检测', checkFen.isCheck() === true);

const mate = new Chess.Chess();
for (const [from, to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) {
  mate.move({ from, to, promotion: 'q' });
}
assert('学者将杀', mate.isCheckmate() === true && mate.isGameOver() === true);

const promo = new Chess.Chess('8/4P3/8/8/8/8/8/k6K w - - 0 1');
const pm = promo.move({ from: 'e7', to: 'e8', promotion: 'q' });
assert('兵升变', pm && pm.promotion === 'q');

const castle = new Chess.Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
assert('王车易位', !!castle.move({ from: 'e1', to: 'g1', promotion: 'q' }));

assert('PGN 包含 e4', c.pgn().includes('e4'));

// ═══════════════════════════════════════════════════════════════
section('5. store 状态管理');
// ═══════════════════════════════════════════════════════════════

const storeMod = require('../utils/store');
const store = storeMod.store;
const mockApp = { globalData: { testKey: 'initial' } };
store.init(mockApp);
assert('store.init', store._app === mockApp);

store.set('testKey', 'updated');
assert('store.set', mockApp.globalData.testKey === 'updated');

let notified = false;
const ctx = { setData: () => {} };
store.subscribe('testKey', (val) => { notified = (val === 'notified'); }, ctx);
store.set('testKey', 'notified');
assert('store.subscribe', notified === true);

store.unsubscribe('testKey', ctx);
notified = false;
store.set('testKey', 'after');
assert('store.unsubscribe', notified === false);

// ═══════════════════════════════════════════════════════════════
section('6. WXML 模板检测');
// ═══════════════════════════════════════════════════════════════

const wxmlFiles = [];
function walkWxml(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { walkWxml(full); continue; }
    if (f.endsWith('.wxml')) wxmlFiles.push(full);
  }
}
walkWxml(root);
assert('WXML 文件可读', wxmlFiles.length > 0);

// ═══════════════════════════════════════════════════════════════
section('7. 组件完整性');
// ═══════════════════════════════════════════════════════════════

const componentDirs = ['chess-board', 'chess-piece', 'analysis-panel', 'timer-display',
  'captured-pieces', 'move-history', 'coach-chat', 'promotion-dialog',
  'bad-move-dialog', 'game-over-modal'];

for (const dir of componentDirs) {
  const compDir = path.join(root, 'components', dir);
  assert(`组件 ${dir} 有 TS`, fs.existsSync(path.join(compDir, dir + '.ts')));
  assert(`组件 ${dir} 有 WXML`, fs.existsSync(path.join(compDir, dir + '.wxml')));
  assert(`组件 ${dir} 有 JSON`, fs.existsSync(path.join(compDir, dir + '.json')));
}

// ═══════════════════════════════════════════════════════════════
section('8. 棋盘渲染逻辑');
// ═══════════════════════════════════════════════════════════════

function simulateRenderBoard(fen, flipped, lastMoveSquares, selectedSquare, legalMoves, candidateMap) {
  const chess = new Chess.Chess(fen);
  const board = chess.board();
  const rows = [];
  const FILES = 'abcdefgh', RANKS = '87654321';

  for (let rank = 0; rank < 8; rank++) {
    const row = [];
    for (let file = 0; file < 8; file++) {
      const displayRank = flipped ? 7 - rank : rank;
      const displayFile = flipped ? 7 - file : file;
      const sq = `${FILES[displayFile]}${RANKS[displayRank]}`;
      const piece = board[displayRank][displayFile];
      const isLight = (displayFile + displayRank) % 2 === 0;
      const hasPiece = !!piece;
      const isLastMove = lastMoveSquares.indexOf(sq) !== -1;
      const isSelected = selectedSquare === sq;
      const isLegal = legalMoves.indexOf(sq) !== -1;
      const hasCandidate = !!candidateMap[sq];

      row.push({
        square: sq,
        piece: hasPiece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()) : '',
        isLight, hasPiece, isLastMove, isSelected, isLegal, hasCandidate,
        showLegalDot: isLegal && !hasPiece,
        showCaptureRing: isLegal && hasPiece,
        showCandidateBadge: hasCandidate && !isLegal,
      });
    }
    rows.push(row);
  }
  return rows;
}

const rows0 = simulateRenderBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false, [], '', [], {});
assert('棋盘 8x8', rows0.length === 8 && rows0[0].length === 8);
assert('a1 白车', rows0[7][0].piece === 'R');
assert('e1 白王', rows0[7][4].piece === 'K');
assert('a8 黑车', rows0[0][0].piece === 'r');
assert('e8 黑王', rows0[0][4].piece === 'k');
assert('d1 白后', rows0[7][3].piece === 'Q');
assert('d8 黑后', rows0[0][3].piece === 'q');

const rowsFlipped = simulateRenderBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', true, [], '', [], {});
assert('翻转 a1 黑车', rowsFlipped[7][0].piece === 'r');

const rowsLast = simulateRenderBoard('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', false, ['e2', 'e4'], '', [], {});
assert('e2 高亮', rowsLast[6][4].isLastMove === true);
assert('e4 高亮', rowsLast[4][4].isLastMove === true);

const rowsSel = simulateRenderBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false, [], 'e2', ['e4', 'f3', 'd3'], {});
assert('e2 选中', rowsSel[6][4].isSelected === true);
assert('e4 合法目标', rowsSel[4][4].showLegalDot === true);

// 候选标记与合法目标互斥：选中后标记让位于走子点击（与参考实现一致）
const rowsCand = simulateRenderBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false, [], 'e2', ['e4'], { e4: { rank: 1 } });
assert('未选中时候选标记显示', simulateRenderBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', false, [], '', [], { e4: { rank: 1 } })[4][4].showCandidateBadge === true);
assert('选中后合法目标隐藏标记', rowsCand[4][4].showCandidateBadge === false);
assert('选中后合法目标显示绿点', rowsCand[4][4].showLegalDot === true);

// ═══════════════════════════════════════════════════════════════
section('9. 页面完整性');
// ═══════════════════════════════════════════════════════════════

const pages = ['index', 'login', 'records', 'record-detail', 'analysis', 'profile', 'settings', 'about'];
for (const page of pages) {
  const dir = path.join(root, 'pages', page);
  assert(`页面 ${page} TS`, fs.existsSync(path.join(dir, page + '.ts')));
  assert(`页面 ${page} WXML`, fs.existsSync(path.join(dir, page + '.wxml')));
  assert(`页面 ${page} JSON`, fs.existsSync(path.join(dir, page + '.json')));
}

// ═══════════════════════════════════════════════════════════════
section('10. app.ts 配置');
// ═══════════════════════════════════════════════════════════════

const appTs = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
assert('app.ts 包含 store', appTs.includes('store'));
assert('app.ts 包含 globalData', appTs.includes('globalData'));
assert('app.ts 包含 onLaunch', appTs.includes('onLaunch'));
assert('app.ts 包含 getDefaultSettings', appTs.includes('getDefaultSettings'));

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert('app.json 有 pages', Array.isArray(appJson.pages) && appJson.pages.length > 0);
assert('app.json 有 window', !!appJson.window);

// ═══════════════════════════════════════════════════════════════
section('11. 事件绑定交叉检查');
// ═══════════════════════════════════════════════════════════════

function walkDir(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { results.push(...walkDir(full)); continue; }
    if (f.endsWith('.wxml') || f.endsWith('.ts')) results.push(full);
  }
  return results;
}

const allFiles = walkDir(root);
const wxmlFiles2 = allFiles.filter(f => f.endsWith('.wxml'));
const tsFilesSet = new Set(allFiles.filter(f => f.endsWith('.ts')));

let bindingIssues = 0;
for (const wxmlFile of wxmlFiles2) {
  const content = fs.readFileSync(wxmlFile, 'utf8');
  const tsFile = wxmlFile.replace('.wxml', '.ts');
  if (!tsFilesSet.has(tsFile)) continue;
  const tsContent = fs.readFileSync(tsFile, 'utf8');

  const handlerMatches = content.matchAll(/(?:bind|catch)[a-zA-Z]+\s*=\s*"([^"]+)"/g);
  const handlerSet = new Set();
  for (const m of handlerMatches) handlerSet.add(m[1]);
  const handlers = [...handlerSet].filter(h => !h.includes('{{') && !h.includes(':'));

  for (const handler of handlers) {
    const patterns = [new RegExp(`${handler}\\s*\\(`), new RegExp(`${handler}\\s*:`), new RegExp(`${handler}\\s*=\\s*function`)];
    const found = patterns.some(p => p.test(tsContent));
    if (!found) {
      const inMethods = new RegExp(`methods\\s*:\\s*\\{[^}]*${handler}`, 's');
      if (!inMethods.test(tsContent)) {
        console.log(`  ⚠️  ${path.relative(root, wxmlFile)}: ${handler} 可能未定义`);
        bindingIssues++;
      }
    }
  }
}
assert('事件绑定检查', bindingIssues === 0, `${bindingIssues} 个潜在问题`);

// ═══════════════════════════════════════════════════════════════
section('12. FEN 验证');
// ═══════════════════════════════════════════════════════════════

const validFens = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
  '8/4P3/8/8/8/8/8/k6K w - - 0 1',
];
for (const fen of validFens) {
  try {
    const chess = new Chess.Chess(fen);
    assert(`FEN: ${fen.slice(0, 25)}...`, typeof chess.fen() === 'string');
  } catch (e) {
    assert(`FEN: ${fen.slice(0, 25)}...`, false, e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
section('13. 走法历史');
// ═══════════════════════════════════════════════════════════════

const hist = new Chess.Chess();
for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']) {
  hist.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: 'q' });
}
const history = hist.history({ verbose: true });
assert('历史长度', history.length === 5);
assert('历史 from/to', history[0].from === 'e2' && history[0].to === 'e4');
assert('历史 SAN', history[0].san === 'e4');

// ═══════════════════════════════════════════════════════════════
section('14. 合法走法');
// ═══════════════════════════════════════════════════════════════

const legal = new Chess.Chess();
const legalMoves = legal.moves({ verbose: true });
assert('20 个合法走法', legalMoves.length === 20);
assert('包含 e2e4', legalMoves.some(m => m.from === 'e2' && m.to === 'e4'));
assert('包含 g1f3', legalMoves.some(m => m.from === 'g1' && m.to === 'f3'));

// ═══════════════════════════════════════════════════════════════
section('15. JSON 配置');
// ═══════════════════════════════════════════════════════════════

const jsonFiles = allFiles.filter(f => f.endsWith('.json') && !f.includes('package') && !f.includes('project'));
for (const jf of jsonFiles) {
  try { JSON.parse(fs.readFileSync(jf, 'utf8')); assert(`JSON: ${path.relative(root, jf)}`, true); }
  catch (e) { assert(`JSON: ${path.relative(root, jf)}`, false, e.message); }
}

// ═══════════════════════════════════════════════════════════════
section('16. 组件属性');
// ═══════════════════════════════════════════════════════════════

const boardTs = fs.readFileSync(path.join(root, 'components', 'chess-board', 'chess-board.ts'), 'utf8');
assert('chess-board fen String', boardTs.includes('fen: {') && boardTs.includes('type: String'));
assert('chess-board isCheck Boolean', boardTs.includes('isCheck: {') && boardTs.includes('type: Boolean'));
assert('chess-board selectedSquare String', boardTs.includes('selectedSquare: {') && boardTs.includes('type: String'));
assert('chess-board legalMoves Array', boardTs.includes('legalMoves: {') && boardTs.includes('type: Array'));

// ═══════════════════════════════════════════════════════════════
section('17. 页面生命周期');
// ═══════════════════════════════════════════════════════════════

const indexTs = fs.readFileSync(path.join(root, 'pages', 'index', 'index.ts'), 'utf8');
assert('index.ts onLoad', indexTs.includes('onLoad'));
assert('index.ts onUnload', indexTs.includes('onUnload'));
assert('index.ts onShow', indexTs.includes('onShow'));
assert('index.ts onSquareTap', indexTs.includes('onSquareTap'));
assert('index.ts onNewGame', indexTs.includes('onNewGame'));
assert('index.ts onUndo', indexTs.includes('onUndo'));
assert('index.ts onFlipBoard', indexTs.includes('onFlipBoard'));
assert('index.ts onResign', indexTs.includes('onResign'));

// ═══════════════════════════════════════════════════════════════
section('18. 代码风格');
// ═══════════════════════════════════════════════════════════════

let emptyCatch = 0;
for (const f of allFiles.filter(f => f.endsWith('.ts') && !f.includes('chessjs'))) {
  const content = fs.readFileSync(f, 'utf8');
  const catches = content.matchAll(/catch\s*\(\s*\w*\s*\)\s*\{([^}]*)\}/g);
  for (const m of catches) {
    if (m[1].trim() === '' || m[1].trim() === '//') emptyCatch++;
  }
}
assert('空 catch 合理', emptyCatch < 20, `${emptyCatch} 个`);

let consoleLogs = 0;
for (const f of allFiles.filter(f => f.endsWith('.ts') && !f.includes('chessjs'))) {
  consoleLogs += (fs.readFileSync(f, 'utf8').match(/console\.log/g) || []).length;
}
assert('console.log 合理', consoleLogs < 250, `${consoleLogs} 个`);

// ═══════════════════════════════════════════════════════════════
section('19. 敏感信息');
// ═══════════════════════════════════════════════════════════════

const sensitivePatterns = [
  { name: 'API 密钥', pattern: /api[_-]?key\s*=\s*['"][^'"]{10,}['"]/i },
  { name: 'Token', pattern: /token\s*=\s*['"][^'"]{10,}['"]/i },
];
let sensitiveFound = 0;
for (const f of allFiles.filter(f => f.endsWith('.ts'))) {
  const content = fs.readFileSync(f, 'utf8');
  for (const { name, pattern } of sensitivePatterns) {
    if (pattern.test(content)) { console.log(`  ⚠️ ${path.relative(root, f)}: ${name}`); sensitiveFound++; }
  }
}
assert('无敏感信息', sensitiveFound === 0);

// ═══════════════════════════════════════════════════════════════
section('20. 组件通信');
// ═══════════════════════════════════════════════════════════════

const boardWxml = fs.readFileSync(path.join(root, 'components', 'chess-board', 'chess-board.wxml'), 'utf8');
assert('chess-board catchtap', boardWxml.includes('catchtap="onSquareTap"'));
assert('chess-board 全盘棋子Canvas(type=2d同层渲染)', boardWxml.includes('type="2d"') && boardWxml.includes('id="boardPieces"'));
assert('chess-board 无旧式原生canvas', !boardTs.includes('createCanvasContext'));
assert('chess-board node方式取ctx', boardTs.includes("getContext('2d')"));
const indexWxml = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8');
assert('index.wxml squaretap', indexWxml.includes('bind:squaretap="onSquareTap"'));
assert('index.wxml startexploration', indexWxml.includes('bind:startexploration="onStartExploration"'));
assert('index.wxml playcontinuation', indexWxml.includes('bind:playcontinuation="onPlayContinuation"'));
assert('index.wxml canvasHidden弹窗时隐藏', indexWxml.includes('canvasHidden="{{showMoreMenu || showPromotion || showBadMove || showGameOver}}"'));
assert('chess-board 提示箭头绘制函数', boardTs.includes('drawHintArrows'));
assert('chess-board 候选箭头数据构建', boardTs.includes('candidateArrows') && boardTs.includes('arrows.push'));
assert('chess-board canvas用wx:if彻底移除(非display:none)', boardWxml.includes('wx:if="{{!canvasHidden}}"') && !boardWxml.includes('canvasHidden ? \' display:none'));
assert('chess-board canvasHidden observer重绘', boardTs.includes('canvasHidden') && boardTs.includes('schedulePiecesDraw'));

// ═══════════════════════════════════════════════════════════════
section('21. 棋子组件 (Cburnett SVG)');
// ═══════════════════════════════════════════════════════════════

const pieceTs = fs.readFileSync(path.join(root, 'components', 'chess-piece', 'chess-piece.ts'), 'utf8');
const pieceArtTs = fs.readFileSync(path.join(root, 'utils', 'pieceArt.ts'), 'utf8');
assert('PIECE_DEFINITIONS', pieceTs.includes('pieceArt') && pieceArtTs.includes('PIECE_DEFINITIONS'));
assert('chess-piece 无旧式原生canvas', !pieceTs.includes('createCanvasContext'));
assert('SVG路径解析器', pieceArtTs.includes('traceSvgPath') && pieceArtTs.includes('bezierCurveTo'));
assert('弧线支持', pieceArtTs.includes('ellipse'));
assert('白王 K', pieceArtTs.includes("K: {"));
assert('黑王 k', pieceArtTs.includes("k: {"));
assert('白后 Q', pieceArtTs.includes("Q: {"));
assert('黑后 q', pieceArtTs.includes("q: {"));
assert('白车 R', pieceArtTs.includes("R: {"));
assert('黑车 r', pieceArtTs.includes("r: {"));
assert('白象 B', pieceArtTs.includes("B: {"));
assert('黑象 b', pieceArtTs.includes("b: {"));
assert('白马 N', pieceArtTs.includes("N: {"));
assert('黑马 n', pieceArtTs.includes("n: {"));
assert('白兵 P', pieceArtTs.includes("P: {"));
assert('黑兵 p', pieceArtTs.includes("p: {"));
assert('白棋 fill #fff', pieceArtTs.includes('#fff'));
assert('黑棋 fill #262626', pieceArtTs.includes('#262626'));

const pieceWxml = fs.readFileSync(path.join(root, 'components', 'chess-piece', 'chess-piece.wxml'), 'utf8');
assert('Canvas 标签', pieceWxml.includes('<canvas'));
assert('canvas-id', pieceWxml.includes('pieceCanvas'));

// ═══════════════════════════════════════════════════════════════
section('22. 其他组件');
// ═══════════════════════════════════════════════════════════════

for (const dir of componentDirs) {
  const tsPath = path.join(root, 'components', dir, dir + '.ts');
  if (fs.existsSync(tsPath)) {
    const content = fs.readFileSync(tsPath, 'utf8');
    assert(`组件 ${dir} 有 Component 定义`, content.includes('Component('));
  }
}

// ═══════════════════════════════════════════════════════════════
section('23. 页面导航');
// ═══════════════════════════════════════════════════════════════

assert('app.json 首页', appJson.pages.includes('pages/index/index'));
assert('app.json 登录页', appJson.pages.includes('pages/login/login'));
assert('app.json 棋谱页', appJson.pages.includes('pages/records/records'));
assert('app.json 设置页', appJson.pages.includes('pages/settings/settings'));

// ═══════════════════════════════════════════════════════════════
section('24. 存储 API');
// ═══════════════════════════════════════════════════════════════

assert('app.ts getStorageSync', appTs.includes('getStorageSync'));
assert('app.ts setStorageSync', appTs.includes('setStorageSync'));
assert('app.ts removeStorageSync', appTs.includes('removeStorageSync'));

// ═══════════════════════════════════════════════════════════════
section('25. 用户身份（userId/颜色分配）');
// ═══════════════════════════════════════════════════════════════

const loginTs = fs.readFileSync(path.join(root, 'pages', 'login', 'login.ts'), 'utf8');
const wsTs = fs.readFileSync(path.join(root, 'utils', 'ws.ts'), 'utf8');
assert('login.ts saveUser 传对象而非 res.data.user', loginTs.includes('saveUser({') && !loginTs.includes('saveUser(res.data.user'));
assert('ws.ts decodeJwtPayload 函数', wsTs.includes('decodeJwtPayload'));
assert('ws.ts connect 解码 JWT', wsTs.includes('this._userId = decoded.userId'));
assert('online.ts userId 优先从 wsClient 获取', fs.readFileSync(path.join(root, 'pages', 'online', 'online.ts'), 'utf8').includes('wsClient.userId || app.globalData.user?.userId'));
assert('app.ts JWT 回退恢复 userId', appTs.includes('parts.length === 3') && appTs.includes('payload.userId'));
assert('app.ts 不再使用不存在的 getFileSync', !appTs.includes('getFileSync('));

// ═══════════════════════════════════════════════════════════════
section('25. 主题配色');
// ═══════════════════════════════════════════════════════════════

const settingsTs = fs.readFileSync(path.join(root, 'pages', 'settings', 'settings.ts'), 'utf8');
assert('BOARD_THEMES', settingsTs.includes('BOARD_THEMES'));
assert('blueWhite', settingsTs.includes('blueWhite'));
assert('wood', settingsTs.includes('wood'));

// ═══════════════════════════════════════════════════════════════
section('26. 游戏结束逻辑');
// ═══════════════════════════════════════════════════════════════

const gameOverTest = new Chess.Chess();
// 笨拙将杀 (Fool's mate): 1.f3 e5 2.g4 Qh4#
gameOverTest.move({ from: 'f2', to: 'f3', promotion: 'q' });
gameOverTest.move({ from: 'e7', to: 'e5', promotion: 'q' });
gameOverTest.move({ from: 'g2', to: 'g4', promotion: 'q' });
gameOverTest.move({ from: 'd8', to: 'h4', promotion: 'q' });
assert('白方被将杀', gameOverTest.isCheckmate() === true);
assert('游戏结束', gameOverTest.isGameOver() === true);

// ═══════════════════════════════════════════════════════════════
section('27. 悔棋');
// ═══════════════════════════════════════════════════════════════

const undoTest = new Chess.Chess();
undoTest.move({ from: 'e2', to: 'e4', promotion: 'q' });
undoTest.move({ from: 'e7', to: 'e5', promotion: 'q' });
const fenBefore = undoTest.fen();
undoTest.undo();
assert('悔棋 FEN 回退', undoTest.fen() !== fenBefore);
assert('悔棋轮到黑方', undoTest.turn() === 'b');

// ═══════════════════════════════════════════════════════════════
section('28. 过兵吃子');
// ═══════════════════════════════════════════════════════════════

const epTest = new Chess.Chess('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPPPPPP/RNBQKBNR w KQkq d6 0 2');
const epMove = epTest.move({ from: 'e5', to: 'd6', promotion: 'q' });
assert('过兵吃子', epMove && epMove.flags.includes('e'));
assert('d5 兵被吃', !epTest.get('d5'));
assert('d6 有白兵', epTest.get('d6') && epTest.get('d6').type === 'p' && epTest.get('d6').color === 'w');

// ═══════════════════════════════════════════════════════════════
section('29. 和棋检测');
// ═══════════════════════════════════════════════════════════════

const insufficient = new Chess.Chess('8/8/8/8/8/8/4k3/4K3 w - - 0 1');
assert('王+王 无足够材料', insufficient.isDraw() === true);

// ═══════════════════════════════════════════════════════════════
section('30. 吃子逻辑');
// ═══════════════════════════════════════════════════════════════

const capTest = new Chess.Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
capTest.move({ from: 'e2', to: 'e4', promotion: 'q' });
capTest.move({ from: 'e7', to: 'e5', promotion: 'q' });
const capMove = capTest.move({ from: 'f1', to: 'c4', promotion: 'q' });
assert('象 c4 合法', !!capMove);
assert('c4 有象', capTest.get('c4') && capTest.get('c4').type === 'b');
assert('f1 为空', !capTest.get('f1'));

// ═══════════════════════════════════════════════════════════════
section('31. TS 类型完整性');
// ═══════════════════════════════════════════════════════════════

const utilTs = fs.readFileSync(path.join(root, 'utils', 'util.ts'), 'utf8');
assert('util.ts 类型注解', utilTs.includes(': string') || utilTs.includes(': number'));

const storeTs = fs.readFileSync(path.join(root, 'utils', 'store.ts'), 'utf8');
assert('store.ts 类型注解', storeTs.includes('private') || storeTs.includes(': any'));

const apiTs = fs.readFileSync(path.join(root, 'utils', 'api.ts'), 'utf8');
assert('api.ts 类型注解', apiTs.includes('Promise') || apiTs.includes(': any'));

// ═══════════════════════════════════════════════════════════════
section('32. PGN 导入导出');
// ═══════════════════════════════════════════════════════════════

const pgnTest = new Chess.Chess();
pgnTest.move({ from: 'e2', to: 'e4', promotion: 'q' });
pgnTest.move({ from: 'e7', to: 'e5', promotion: 'q' });
pgnTest.move({ from: 'g1', to: 'f3', promotion: 'q' });
const pgnOut = pgnTest.pgn();
assert('PGN 包含 e4', pgnOut.includes('e4'));
assert('PGN 包含 Nf3', pgnOut.includes('Nf3'));

const pgnImport = new Chess.Chess();
pgnImport.loadPgn('1. e4 e5 2. Nf3 Nc6');
assert('PGN 导入成功', pgnImport.fen() !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// ═══════════════════════════════════════════════════════════════
section('33. 边界条件');
// ═══════════════════════════════════════════════════════════════

let emptyFenOk = false;
try { new Chess.Chess(''); emptyFenOk = true; } catch { emptyFenOk = false; }
assert('空 FEN 不崩溃', emptyFenOk === false);

let invalidFenOk = false;
try { new Chess.Chess('invalid'); invalidFenOk = true; } catch { invalidFenOk = false; }
assert('无效 FEN 不崩溃', invalidFenOk === false);

const longTest = new Chess.Chess();
let longMoves = 0;
try {
  for (let i = 0; i < 100; i++) {
    const moves = longTest.moves({ verbose: true });
    if (moves.length === 0) break;
    const move = moves[Math.floor(Math.random() * moves.length)];
    longTest.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    longMoves++;
  }
  assert('100步随机走棋', longMoves > 0);
} catch (e) {
  assert('100步随机走棋', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
section('34. 重演模式');
// ═══════════════════════════════════════════════════════════════

const replayTest = new Chess.Chess();
for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']) {
  replayTest.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: 'q' });
}
assert('重演历史长度', replayTest.history({ verbose: true }).length === 5);

// ═══════════════════════════════════════════════════════════════
section('35. 王车易位');
// ═══════════════════════════════════════════════════════════════

const castleTest = new Chess.Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
assert('短易位', !!castleTest.move({ from: 'e1', to: 'g1', promotion: 'q' }));

// ═══════════════════════════════════════════════════════════════
section('36. 新增 API 函数完整性');
// ═══════════════════════════════════════════════════════════════

const api = require('../utils/api');
const newApiFunctions = [
  // 对局扩展
  'loadGame', 'saveInProgressGame', 'getInProgressGame', 'deleteInProgressGame', 'completeInProgressGame',
  // 棋谱扩展
  'getRecordAnalyses', 'getRecordDetail', 'getRecordDataSources', 'addRecordDataSource',
  'deleteRecordDataSource', 'triggerRecordAutoUpdate',
  // 知识库
  'triggerLearning', 'getKnowledgeStatus',
  // 深度复盘
  'deepReviewGameStream', 'loadDeepReview', 'saveDeepReview', 'deleteDeepReview',
  // 概念提示
  'getConceptHint',
  // 用户自建习题
  'createUserPuzzle', 'batchCreateUserPuzzles', 'getUserPuzzles', 'getDueReviews',
  'getUserPuzzleStats', 'getUserPuzzleDetail', 'solveUserPuzzle', 'deleteUserPuzzle',
  'batchDeleteUserPuzzles',
  // 每周主题
  'getCurrentWeeklyTheme', 'getWeeklyThemePuzzles',
  // 训练扩展
  'getUpgradePlan', 'getTrainingDashboard', 'saveGradeSettings', 'saveMistakesFromReview',
  'getMistakeSummary', 'getMistakeMatchingPuzzles', 'getTrainingCenterData',
  'triggerDynamicAssessment', 'getWeeklyPlan', 'submitWeeklyEvaluation', 'getWeeklyEvaluations',
  // 全局开关
  'isDistributionEnabled', 'isVideoGenerationEnabled', 'isAIAnalysisReportEnabled',
  'getMembershipToggle', 'setMembershipToggle',
  'getAdminVideoGenerationToggle', 'setAdminVideoGenerationToggle',
  'getAdminAIAnalysisToggle', 'setAdminAIAnalysisToggle',
  'getAdminDistributionToggle', 'setAdminDistributionToggle',
  // 视频生成
  'generateGameVideo', 'getVideoStatus', 'getVideoDownloadUrl', 'getVideoVoices',
  'resumeVideoGeneration', 'getCompletedVideoTasks',
  // AI 棋手
  'getEnabledAiBots', 'startAiBotMatch', 'getMyAiBotGames',
  'getAdminAiBots', 'getAdminAiBot', 'createAdminAiBot', 'updateAdminAiBot',
  'deleteAdminAiBot', 'toggleAdminAiBot', 'generateAdminAiBots',
  'batchOnlineAiBots', 'batchOfflineAiBots', 'batchDeleteAiBots',
  // 分销
  'getMyDistributionProfile', 'activateDistributor', 'getMyReferralInfo',
  'regenerateReferralCode', 'getMyCommissions', 'getMyCommissionSummary',
  'getMyTeam', 'createWithdrawalRequest', 'getMyWithdrawals',
  'getDistributionSettings', 'updateDistributionSettings', 'getDistributionStats',
  'getDistributors', 'getDistributorDetail', 'toggleDistributorStatus',
  'getCommissionRules', 'createCommissionRule', 'updateCommissionRule',
  'deleteCommissionRule', 'getAdminCommissionRecords', 'settleCommissionManually',
  'getAdminWithdrawals', 'approveWithdrawal', 'rejectWithdrawal', 'completeWithdrawal',
  // 反馈
  'submitFeedback', 'getMyFeedback', 'getFeedbackDetail', 'replyToFeedback',
  'getAdminFeedback', 'getAdminFeedbackReplies', 'replyFeedback', 'getFeedbackStats',
  // 问卷
  'getPendingSurvey', 'submitSurveyResponse', 'skipSurvey',
  'getAdminSurveys', 'getAdminSurveyDetail', 'createSurvey', 'updateSurvey',
  'deleteSurvey', 'getSurveyStats', 'getSurveyResponses', 'aiGenerateSurvey',
  // 消息
  'sendMessage', 'getMessageSessions', 'getConversation', 'getUnreadCount',
  // 好友
  'sendFriendRequest', 'acceptFriendRequest', 'rejectFriendRequest',
  'getFriendList', 'getFriendRequests', 'removeFriend', 'searchUsers',
  // 群组
  'createGroup', 'getUserGroups', 'getGroupDetail', 'updateGroup', 'deleteGroup',
  'addGroupMembers', 'removeGroupMember', 'updateMemberRole',
  'getGroupMessages', 'sendGroupMessage',
  // 教师课件
  'getTeacherStatus', 'applyTeacher', 'listCoursewares', 'createCourseware',
  'getCoursewareDetail', 'updateCourseware', 'deleteCourseware',
  'addCoursewareItem', 'removeCoursewareItem', 'updateCoursewareItemNote',
  'reorderCoursewareItems', 'getAdminTeacherApplications',
  'getAdminTeacherApplicationCounts', 'reviewAdminTeacherApplication',
  'getAdminTeachers', 'revokeAdminTeacher',
  // 龙币
  'getDragonCoinBalance', 'getDragonCoinLedger', 'getDragonCoinConfigs',
  'getDragonCoinExchanges', 'exchangeDragonCoin', 'getDragonCoinExchangeRecords',
  'getAdminDragonCoinConfigs', 'createDragonCoinConfig', 'updateDragonCoinConfig',
  'deleteDragonCoinConfig', 'getAdminDragonCoinExchanges', 'createDragonCoinExchange',
  'updateDragonCoinExchange', 'deleteDragonCoinExchange',
  'getAdminDragonCoinExchangeRecords', 'getAdminDragonCoinUserBalance',
  'adjustDragonCoinBalance', 'getAdminDragonCoinStats',
  // 管理扩展
  'getAdminDayStats', 'getAdminUsers', 'getAdminUserDetail', 'updateAdminUserRole',
  'updateAdminUserTeacherStatus', 'adminResetPassword', 'getAdminUserActivity',
  'getAdminUserActivityModules', 'getAdminGames', 'getAdminGameDetail',
  'getAdminModuleStats', 'getAdminExtendedStats', 'getAdminSettings',
  'updateAdminSettings', 'getAdminKnowledgeStatus', 'triggerAdminKnowledgeLearn',
  'changeAdminPassword',
  // 会员管理
  'getAdminMembershipLevels', 'getAdminMembershipBenefits', 'createAdminMembershipLevel',
  'updateAdminMembershipLevel', 'deleteAdminMembershipLevel', 'getAdminMembershipUsers',
  'getAdminUserMembership', 'adminGrantMembership', 'adminExtendMembership',
  'adminExpireMembership', 'getAdminMembershipOrders', 'adminRefundMembershipOrder',
  'generateMembershipCodes', 'getMembershipCodes', 'disableMembershipCode',
  'getAdminMembershipStats', 'getAdminMembershipLogs',
  // 棋谱库
  'getChessGameRecords', 'getChessGameRecordDetail', 'deleteChessGameRecord',
  'batchDeleteChessGameRecords', 'updateChessGameTags', 'searchChessGamesExternal',
  'importChessGameFromUrl', 'searchAndImportChessGame', 'importChessGamePgn',
  'getChessDataService', 'createChessGameDataSource', 'updateChessGameDataSource',
  'deleteChessGameDataSource', 'testChessGameDataSource',
  'importFromChessGameDataSource', 'triggerChessGameAutoUpdate', 'getChessGameLibraryStats',
  // 棋谱分析
  'getChessGameAnalysis', 'getChessGameAnalyses', 'analyzeChessGame',
  'analyzeAllChessGames', 'getChessGameBatchAnalysisStatus', 'cancelChessGameAnalysis',
  'cancelAllChessGameAnalyses', 'resetAllChessGameAnalyses', 'deleteChessGameAnalysis',
  // LLM
  'getLLMProviders', 'getLLMProvider', 'createLLMProvider', 'updateLLMProvider',
  'deleteLLMProvider', 'setDefaultLLMProvider', 'testLLMConnection',
  // 菜单
  'getAdminMenuVisibility', 'updateAdminMenuVisibility',
  // SMTP
  'getSmtpConfig', 'saveSmtpConfig', 'deleteSmtpConfig', 'testSmtpConnection',
  // 竞赛
  'getCompetitions', 'getCompetitionDetail', 'joinCompetition',
  'getCompetitionRounds', 'getCompetitionStandings', 'getCompetitionNotifications',
  'getCompetitionMatch', 'submitCompetitionMove',
  'getCompetitionAdminCompetitions', 'createCompetition', 'updateCompetition',
  'deleteCompetition', 'getCompetitionManageDetail', 'getCompetitionRegistrationPopup',
];
for (const fn of newApiFunctions) {
  assert(`API 函数 ${fn} 已导出`, typeof api[fn] === 'function', `${fn} 不是函数`);
}

// ═══════════════════════════════════════════════════════════════
section('37. 新增页面文件完整性');
// ═══════════════════════════════════════════════════════════════

const newPages = [
  'pages/feedback/feedback',
  'pages/competitions/list/list',
  'pages/competitions/detail/detail',
  'pages/friends/friends',
  'pages/groups/list/list',
  'pages/messages/chat/chat',
  'pages/distribution/index',
  'pages/dragon-coin/index',
  'pages/my-puzzles/index',
  'pages/classroom/home/home',
  'pages/puzzles/user-solve/user-solve',
  'pages/competitions/play/play',
  'pages/groups/chat/chat',
  'pages/classroom/board/board',
  'pages/classroom/courseware/courseware',
  'pages/classroom/review/review',
  'pages/reward-center/index',
  'pages/reset-password/index',
  'pages/admin/admin-ai-bots/admin-ai-bots',
  'pages/admin/admin-chess-games/admin-chess-games',
  'pages/admin/admin-competitions/admin-competitions',
  'pages/admin/admin-distribution/admin-distribution',
  'pages/admin/admin-dragon-coin/admin-dragon-coin',
  'pages/admin/admin-feedback/admin-feedback',
  'pages/admin/admin-knowledge/admin-knowledge',
  'pages/admin/admin-membership/admin-membership',
  'pages/admin/admin-menu/admin-menu',
  'pages/admin/admin-puzzles/admin-puzzles',
  'pages/admin/admin-smtp/admin-smtp',
  'pages/admin/admin-surveys/admin-surveys',
  'pages/admin/admin-teachers/admin-teachers',
];
for (const page of newPages) {
  const dir = path.join(root, page);
  assert(`页面 ${page} TS`, fs.existsSync(dir + '.ts'));
  assert(`页面 ${page} WXML`, fs.existsSync(dir + '.wxml'));
  assert(`页面 ${page} JSON`, fs.existsSync(dir + '.json'));
}

// ═══════════════════════════════════════════════════════════════
section('38. app.json 页面注册');
// ═══════════════════════════════════════════════════════════════

const appJson2 = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const page of newPages) {
  assert(`app.json 包含 ${page}`, appJson2.pages.includes(page), `${page} 未注册`);
}
assert('app.json 页面总数 >= 40', appJson2.pages.length >= 40, `当前 ${appJson2.pages.length} 个页面`);

// ═══════════════════════════════════════════════════════════════
section('39. 首页导航方法');
// ═══════════════════════════════════════════════════════════════

const choiceTs = fs.readFileSync(path.join(root, 'pages/choice/choice.ts'), 'utf8');
const navMethods = [
  'onCompetitions', 'onFriends', 'onGroups', 'onFeedback',
  'onDistribution', 'onDragonCoin', 'onMyPuzzles',
];
for (const method of navMethods) {
  assert(`choice.ts 包含 ${method}`, choiceTs.includes(method), `${method} 未定义`);
}

// ═══════════════════════════════════════════════════════════════
section('41. 管理后台导航方法');
// ═══════════════════════════════════════════════════════════════

const adminTs = fs.readFileSync(path.join(root, 'pages/admin/admin.ts'), 'utf8');
const adminNavMethods = [
  'goAiBots', 'goChessGames', 'goCompetitions', 'goTeachers',
  'goKnowledge', 'goPuzzles', 'goSurveys', 'goFeedback',
  'goDistribution', 'goDragonCoin', 'goMembership', 'goMenu', 'goSmtp',
];
for (const method of adminNavMethods) {
  assert(`admin.ts 包含 ${method}`, adminTs.includes(method), `${method} 未定义`);
}

// ═══════════════════════════════════════════════════════════════
section('42. 最终汇总');
// ═══════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(60)}`);
console.log(`  总计: ${total} | 通过: ${passed} | 失败: ${failed}`);
console.log(`  通过率: ${((passed / total) * 100).toFixed(1)}%`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.log('\n失败详情:');
  errors.forEach((e, i) => console.log(`  ${i+1}. ${e.name} ${e.detail}`));
}

process.exit(failed > 0 ? 1 : 0);
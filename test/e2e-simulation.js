/**
 * 小程序对弈逻辑端到端模拟测试
 * 模拟 pages/index.js 的完整流程：走子验证 → AI回应 → 局面分析 → 对局保存
 * 运行: node test/e2e-simulation.js
 */
const Chess = require('../utils/chessjs.js');
const http = require('http');

const BASE = 'http://localhost:3001';
const TOKEN = process.env.TEST_TOKEN || '';

// 模拟小程序的 wx.request（Promise 化）
function request(method, url, data, useAuth = false) {
  return new Promise((resolve, reject) => {
    const body = method === 'GET' ? null : JSON.stringify(data || {});
    const headers = { 'Content-Type': 'application/json' };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (useAuth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

    const req = http.request(BASE + url, { method, headers, timeout: 30000 }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

(async () => {
  console.log('====== 小程序对弈逻辑端到端模拟 ======\n');

  // === 1. chess.js 走子验证（小程序客户端逻辑） ===
  console.log('[1] chess.js 客户端走子验证');
  const chess = new Chess.Chess();
  const move1 = chess.move({ from: 'e2', to: 'e4', promotion: 'q' });
  assert('玩家走子 e2e4', move1 && move1.san === 'e4');
  assert('走子后轮到黑方', chess.turn() === 'b');
  const illegal = (() => { try { chess.move({ from: 'e4', to: 'e5' }); return true; } catch { return false; } })();
  assert('非法走子被拒绝（e4→e5 不合法）', !illegal);

  // === 2. AI 走子（模拟 requestAIMove） ===
  console.log('\n[2] AI 走子 API');
  const aiRes = await request('POST', '/api/ai-move', { fen: chess.fen(), difficulty: 5 });
  assert('AI 返回走法', aiRes.body?.success && aiRes.body?.data?.bestMove?.length >= 4,
    JSON.stringify(aiRes.body).slice(0, 100));
  const aiMove = aiRes.body.data.bestMove;
  const applied = chess.move({
    from: aiMove.slice(0, 2), to: aiMove.slice(2, 4),
    promotion: aiMove.length > 4 ? aiMove.slice(4) : 'q',
  });
  assert('AI 走法可应用', !!applied);

  // === 3. 局面分析（模拟 triggerAnalysis） ===
  console.log('\n[3] 局面分析 API');
  const analyzeRes = await request('POST', '/api/analyze', {
    fen: chess.fen(), depth: 8, multiPv: 3, movetime: 300,
  });
  const candidates = analyzeRes.body?.data?.candidates;
  assert('返回候选走法', Array.isArray(candidates) && candidates.length > 0);
  assert('候选含优缺点/战术', candidates[0].pros && Array.isArray(candidates[0].tactics));
  assert('候选含续着', Array.isArray(candidates[0].continuation));

  // === 4. 走法质量检查（模拟 checkMoveQuality） ===
  console.log('\n[4] 走法质量分析 API（不良走法检测）');
  const moveAnalysis = await request('POST', '/api/analyze-move', {
    fen: chess.fen(), uci: 'h2h4', depth: 10, movetime: 500,
  });
  assert('返回走法评分', moveAnalysis.body?.success && typeof moveAnalysis.body?.data?.score === 'number');
  assert('返回最佳走法对比', typeof moveAnalysis.body?.data?.lossVsBest === 'number');

  // === 5. 保存对局（模拟 saveGameIfNeeded） ===
  console.log('\n[5] 保存对局 API');
  const saveRes = await request('POST', '/api/games', {
    pgn: chess.pgn(),
    white: 'player', black: 'ai',
    result: '*', difficulty: 5,
  });
  assert('对局保存成功', saveRes.body?.success === true, JSON.stringify(saveRes.body).slice(0, 100));

  // === 6. 对局列表（模拟 loadMyGames） ===
  console.log('\n[6] 对局列表 API');
  const listRes = await request('GET', '/api/games');
  assert('对局列表返回', listRes.body?.success && Array.isArray(listRes.body?.data));

  // === 7. 将杀检测（完整短局） ===
  console.log('\n[7] 将杀检测（学者将杀四步局）');
  const mate = new Chess.Chess();
  for (const [from, to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) {
    mate.move({ from, to, promotion: 'q' });
  }
  assert('四步后白方被将杀', mate.isCheckmate() === true && mate.isGameOver() === true);

  console.log('\n====== 结果: ' + passed + ' 通过 / ' + failed + ' 失败 ======');
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
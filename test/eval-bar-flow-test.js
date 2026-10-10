/**
 * 评估条组件数据流测试
 *
 * 加载真实的 components/analysis-panel/analysis-panel.js，验证观察器
 * 输出的评估条数据符合网页版 AnalysisPanel 的规则：
 *   - 双向条：左半对方优势（红）、右半己方优势（绿），±10 兵满格
 *   - 副文案为「{走棋方}走棋 · {己方/对方}占优」
 *   - 分析清空（走子后）时评估条归零
 *
 * 运行: node test/eval-bar-flow-test.js
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');

let componentDef = null;
global.Component = (def) => { componentDef = def; };
global.getApp = () => ({ globalData: { settings: { uiTheme: 'dark' } } });
global.wx = {};

// analysis-panel 顶层 require 了 utils/api，这里替换成空实现避免真实网络依赖
const apiPath = require.resolve(path.join(ROOT, 'utils/api.js'));
require.cache[apiPath] = {
  id: apiPath, filename: apiPath, loaded: true,
  exports: { getOpeningEncyclopedia: () => Promise.resolve({}) },
};

require(path.join(ROOT, 'components/analysis-panel/analysis-panel.js'));

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

/** 构造组件实例，注入真实的 data 与 methods */
function makeInst(props = {}) {
  const inst = {
    properties: Object.assign({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playerSide: 'w',
      turn: 'w',
      analysis: [],
      ecoCode: '',
      openingName: '',
    }, props),
    data: JSON.parse(JSON.stringify(componentDef.data)),
    setData(patch) { Object.assign(this.data, patch); },
  };
  for (const [k, v] of Object.entries(componentDef.methods || {})) inst[k] = v.bind(inst);
  inst.observer = componentDef.observers['analysis, turn, playerSide, fen'];
  return inst;
}

/** 父页面传入的候选已按玩家视角归一化 */
function cand(score, uci = 'e2e4') {
  return { uci, score, pros: [], cons: [], tactics: [], continuation: [] };
}

section('白方走棋 · 玩家执白 · +3（己方优势）');
let it = makeInst();
it.observer.call(it, [cand(3)]);
assert('evaluation = +3', it.data.evaluation === 3, `实际 ${it.data.evaluation}`);
assert('右侧绿条 30%', it.data.evaluationBarRightWidth === 30, `实际 ${it.data.evaluationBarRightWidth}`);
assert('左侧红条 0%', it.data.evaluationBarLeftWidth === 0, `实际 ${it.data.evaluationBarLeftWidth}`);
assert('副文案「白方走棋 · 己方优势」', it.data.evaluationSubText === '白方走棋 · 己方优势', `实际 ${it.data.evaluationSubText}`);
assert('分数显示 +3.00', it.data.evaluationFormatted === '+3.00', `实际 ${it.data.evaluationFormatted}`);

section('白方走棋 · 玩家执黑 · 归一化后 -3（对方优势）');
it = makeInst({ playerSide: 'b' });
it.observer.call(it, [cand(-3)]);
assert('evaluation = -3', it.data.evaluation === -3, `实际 ${it.data.evaluation}`);
assert('左侧红条 30%', it.data.evaluationBarLeftWidth === 30, `实际 ${it.data.evaluationBarLeftWidth}`);
assert('右侧绿条 0%', it.data.evaluationBarRightWidth === 0, `实际 ${it.data.evaluationBarRightWidth}`);
assert('副文案「白方走棋 · 对方优势」', it.data.evaluationSubText === '白方走棋 · 对方优势', `实际 ${it.data.evaluationSubText}`);

section('黑方走棋的副文案');
it = makeInst({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1' });
it.observer.call(it, [cand(0.2)]);
assert('以「黑方走棋」开头', it.data.evaluationSubText.startsWith('黑方走棋'), `实际 ${it.data.evaluationSubText}`);

section('分析清空时评估条归零（走子后）');
it = makeInst();
it.observer.call(it, [cand(3)]);
it.observer.call(it, []);
assert('evaluation 归零', it.data.evaluation === 0, `实际 ${it.data.evaluation}`);
assert('左右条均归零', it.data.evaluationBarLeftWidth === 0 && it.data.evaluationBarRightWidth === 0);
assert('候选列表清空', it.data.candidates.length === 0);
assert('副文案回落为均势', it.data.evaluationSubText.endsWith('均势'), `实际 ${it.data.evaluationSubText}`);

section('极端分数封顶 100%');
it = makeInst();
it.observer.call(it, [cand(25)]);
assert('+25 → 右条 100%', it.data.evaluationBarRightWidth === 100, `实际 ${it.data.evaluationBarRightWidth}`);
it = makeInst();
it.observer.call(it, [cand(-25)]);
assert('-25 → 左条 100%', it.data.evaluationBarLeftWidth === 100, `实际 ${it.data.evaluationBarLeftWidth}`);

section('候选走法标签格式');
it = makeInst();
it.observer.call(it, [cand(0.5, 'e2e4'), cand(-0.2, 'd2d4')]);
assert('生成 2 条候选', it.data.candidates.length === 2, `实际 ${it.data.candidates.length}`);
assert('第 1 条 rank=1', it.data.candidates[0].rank === 1);
assert('第 2 条 rank=2', it.data.candidates[1].rank === 2);
assert('标签含起止格 e2→e4', it.data.candidates[0].label.includes('e2→e4'), `实际 ${it.data.candidates[0].label}`);

console.log(`\n${'='.repeat(40)}`);
console.log(failed === 0
  ? `✅ 全部通过 (${passed} 项)`
  : `❌ ${failed} 项失败 / 共 ${passed + failed} 项`);
process.exit(failed === 0 ? 0 : 1);

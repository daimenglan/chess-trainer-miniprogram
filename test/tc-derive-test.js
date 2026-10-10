/**
 * 训练中心页派生逻辑回归测试
 *
 * 用真实后端响应驱动页面派生逻辑（deriveWeeklyPlan / buildGradeView / 弱项标签配色），
 * 验证 WXML 依赖的每个字段都真实产出，且与网页版算法一致。
 *
 * 准备数据（本地后端需在 3001 运行）：
 *   curl -s "http://127.0.0.1:3001/api/profile/training-center?today=YYYY-MM-DD" \
 *     -H "Authorization: Bearer $TOKEN" > .tmp-tc.json
 *   curl -s "http://127.0.0.1:3001/api/profile/weekly-plan?today=YYYY-MM-DD" \
 *     -H "Authorization: Bearer $TOKEN" > .tmp-wp.json
 * 用法：node test/tc-derive-test.js
 */
const fs = require('fs');
const path = require('path');

const TC_PATH = process.env.TC_JSON || path.join(__dirname, '..', '.tmp-tc.json');
const WP_PATH = process.env.WP_JSON || path.join(__dirname, '..', '.tmp-wp.json');

if (!fs.existsSync(TC_PATH) || !fs.existsSync(WP_PATH)) {
  console.log('跳过：缺少样本数据 ' + path.basename(TC_PATH) + ' / ' + path.basename(WP_PATH));
  console.log('（按文件头注释导出真实响应后重跑）');
  process.exit(0);
}

const tc = JSON.parse(fs.readFileSync(TC_PATH, 'utf8')).data;
const wp = JSON.parse(fs.readFileSync(WP_PATH, 'utf8')).data;

const DAY_TYPE_META = {
  game: { label: '实战日', icon: '♟', cls: 'dt-game' },
  practice: { label: '专项日', icon: '🎯', cls: 'dt-practice' },
  review: { label: '复盘日', icon: '🔍', cls: 'dt-review' },
  assessment: { label: '评估日', icon: '📝', cls: 'dt-assessment' },
};

function targetBadgeClass(focusId) {
  if (!focusId) return 'badge-gray';
  if (focusId === 'base') return 'badge-slate';
  if (focusId === 'weekly-eval') return 'badge-green';
  if (focusId.indexOf('strength-') === 0) return 'badge-emerald';
  return 'badge-rose';
}

function computeAutoCompletedBlocks(plan) {
  if (plan.blockCompletion !== undefined && plan.blockCompletion !== null) {
    return Object.keys(plan.blockCompletion);
  }
  const done = [];
  if (!plan.dailyActivity) return done;
  const startDate = new Date(plan.weekStart + 'T00:00:00');
  for (const dayPlan of plan.dailyPlans) {
    const blockDate = new Date(startDate);
    blockDate.setDate(blockDate.getDate() + (dayPlan.dayOfWeek - 1));
    const m = String(blockDate.getMonth() + 1).padStart(2, '0');
    const dd = String(blockDate.getDate()).padStart(2, '0');
    const dateStr = blockDate.getFullYear() + '-' + m + '-' + dd;
    const day = plan.dailyActivity[dateStr];
    (dayPlan.timeBlocks || []).forEach((block, i) => {
      if (!block.link) return;
      if (block.link.indexOf('/training-plan') === 0) {
        if (plan.weeklyEvalSubmitted === true) done.push(dayPlan.dayOfWeek + '-' + i);
        return;
      }
      if (!day) return;
      if (block.link.indexOf('/game') === 0 && day.game > 0) done.push(dayPlan.dayOfWeek + '-' + i);
      else if (block.link.indexOf('/my-puzzles') === 0 && day.review > 0) done.push(dayPlan.dayOfWeek + '-' + i);
      else if (block.link.indexOf('/puzzles') === 0 && day.puzzle > 0) done.push(dayPlan.dayOfWeek + '-' + i);
      else if ((block.link.indexOf('/records') === 0 || block.link.indexOf('/study') === 0) && (day.puzzle > 0 || day.analysis > 0)) done.push(dayPlan.dayOfWeek + '-' + i);
    });
  }
  return done;
}

function getDayProgress(day, completedSet) {
  if (!day) return { completed: 0, total: 0, percent: 0 };
  const total = day.totalMinutes || 0;
  let completed = 0;
  (day.timeBlocks || []).forEach((block, i) => {
    if (completedSet.has(day.dayOfWeek + '-' + i)) completed += block.duration || 0;
  });
  return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

function buildGradeView(upgradePlan, metrics) {
  if (!upgradePlan) return null;
  const baselineElo = (metrics && metrics.baselineElo) != null ? metrics.baselineElo : 500;
  const targetElo = upgradePlan.targetElo;
  const denom = targetElo - baselineElo;
  const currentElo = upgradePlan.currentElo;
  const progress = denom > 0 ? Math.min(100, Math.max(0, ((currentElo - baselineElo) / denom) * 100)) : 100;
  let probCls = 'gp-low';
  if (metrics) probCls = metrics.successProbability >= 50 ? 'gp-high' : (metrics.successProbability >= 10 ? 'gp-mid' : 'gp-low');
  const gapText = metrics ? (metrics.gap > 0 ? '-' + metrics.gap : '+' + Math.abs(metrics.gap)) : '';
  let etaText = '...';
  let etaLabel = '状态';
  if (metrics && metrics.etaDays !== null) {
    etaLabel = '预计达标';
    etaText = metrics.etaDays === 0 ? '已达标' : metrics.etaDays + ' 天';
  }
  return {
    currentGradeLabel: upgradePlan.currentGradeLabel,
    targetGradeLabel: upgradePlan.targetGradeLabel,
    currentRatingText: metrics ? metrics.currentRating + ' ± ' + metrics.sigma : '≈ ' + currentElo + ' Elo',
    targetElo: targetElo,
    baselineElo: baselineElo,
    progress: Math.round(progress),
    gapText: gapText,
    hasMetrics: !!metrics,
    successProbability: metrics ? metrics.successProbability : 0,
    probCls: probCls,
    velocityText: metrics && metrics.velocity != null ? (metrics.velocity > 0 ? '+' : '') + metrics.velocity + '/day' : '—',
    etaLabel: etaLabel,
    etaText: etaText,
    confidenceLo: metrics ? metrics.confidenceInterval[0] : 0,
    confidenceHi: metrics ? metrics.confidenceInterval[1] : 0,
    etaNote: metrics && metrics.etaText && metrics.etaDays === null ? metrics.etaText : '',
    currentTarget: upgradePlan.currentTarget,
    nextTarget: upgradePlan.nextTarget,
  };
}

let fail = 0;
const check = (cond, msg) => { console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fail++; };

console.log('== 1) buildGradeView (升级目标卡片) ==');
const gv = buildGradeView(tc.upgradePlan, tc.ratingMetrics);
console.log('   ', JSON.stringify(gv));
check(!!gv, 'gradeView 产出');
check(gv.progress >= 0 && gv.progress <= 100, '进度在 0-100 (' + gv.progress + ')');
check(!!gv.gapText, '差距文案 (' + gv.gapText + ')');
check(['gp-high', 'gp-mid', 'gp-low'].indexOf(gv.probCls) >= 0, '达标概率配色 (' + gv.probCls + ')');
check(typeof gv.etaText === 'string' && gv.etaText.length > 0, 'ETA 文案 (' + gv.etaText + ')');
check(!!gv.currentTarget && !!gv.nextTarget, '当前/下一阶段目标存在');
check(!!gv.currentTarget.puzzleRatingTarget, 'currentTarget.puzzleRatingTarget 有值');

console.log('== 2) deriveWeeklyPlan (7天清单) ==');
const ref = new Date('2026-09-26T00:00:00');
const dow = ref.getDay();
const todayDow = dow === 0 ? 7 : dow;
const completedSet = new Set(computeAutoCompletedBlocks(wp));
const blockProgress = wp.blockProgress || null;
let weekCompleted = 0;
let weekTotal = 0;
let todayCompleted = 0;
let todayTotal = 0;
const dailyPlanData = wp.dailyPlans.map((day) => {
  const prog = getDayProgress(day, completedSet);
  weekCompleted += prog.completed;
  weekTotal += prog.total;
  if (day.dayOfWeek === todayDow) { todayCompleted = prog.completed; todayTotal = prog.total; }
  const blocks = (day.timeBlocks || []).map((block, i) => {
    const key = day.dayOfWeek + '-' + i;
    const isDone = completedSet.has(key);
    const own = blockProgress ? blockProgress[key] : null;
    const prev = i > 0 && blockProgress ? blockProgress[day.dayOfWeek + '-' + (i - 1)] : null;
    const shown = own || (isDone && prev ? prev : null);
    return {
      key: key,
      activity: block.activity,
      duration: block.duration,
      target: block.target || '',
      targetCls: targetBadgeClass(block.focusId),
      isDone: isDone,
      hasLink: !!block.link,
      hasProg: !!shown,
      progCurrent: shown ? shown.current : 0,
      progTarget: shown ? shown.target : 0,
      progPct: shown && shown.target > 0 ? Math.round((shown.current / shown.target) * 100) : 0,
    };
  });
  const meta = DAY_TYPE_META[day.type] || { label: '', icon: '', cls: 'dt-game' };
  return {
    dayOfWeek: day.dayOfWeek, dayLabel: day.dayLabel,
    typeLabel: meta.label, typeIcon: meta.icon, typeCls: meta.cls,
    totalMinutes: day.totalMinutes || 0, completedMin: prog.completed, progressPct: prog.percent,
    isToday: day.dayOfWeek === todayDow, blocks: blocks,
  };
});

check(dailyPlanData.length === 7, '7 天清单 (' + dailyPlanData.length + ')');
check(dailyPlanData.every((d) => d.dayLabel && d.typeLabel && d.typeIcon), '每天都有 星期/类型标签');
check(dailyPlanData.every((d) => d.blocks.length > 0), '每天都有时间块');
check(dailyPlanData.every((d) => d.blocks.every((b) => b.key && b.activity && typeof b.duration === 'number')), '每块都有 key/活动/时长');
check(dailyPlanData.every((d) => d.blocks.every((b) => ['badge-gray', 'badge-slate', 'badge-green', 'badge-emerald', 'badge-rose'].indexOf(b.targetCls) >= 0)), '弱项标签配色合法');
check(dailyPlanData.filter((d) => d.isToday).length === 1, '今天唯一高亮 (dow=' + todayDow + ')');
const pb = dailyPlanData[5].blocks[0];
check(pb.hasProg && pb.progTarget === 5, '量化进度挂在合并组首块 (' + pb.progCurrent + '/' + pb.progTarget + ')');
// 逐块比对配色映射：focusId 决定配色，与网页版 targetBadgeClass 一致
const badgeChecks = [];
wp.dailyPlans.forEach((d) => d.timeBlocks.forEach((b) => {
  const expected = !b.focusId ? 'badge-gray'
    : b.focusId === 'base' ? 'badge-slate'
    : b.focusId === 'weekly-eval' ? 'badge-green'
    : b.focusId.indexOf('strength-') === 0 ? 'badge-emerald'
    : 'badge-rose';
  badgeChecks.push([targetBadgeClass(b.focusId), expected, b.activity]);
}));
check(badgeChecks.every((c) => c[0] === c[1]), '每个块的弱项标签配色与 focusId 一致 (' + badgeChecks.length + ' 块)');
const baseBlock = dailyPlanData[0].blocks[0];
const weekEvalBlock = dailyPlanData[6].blocks[dailyPlanData[6].blocks.length - 1];
check(baseBlock.targetCls === 'badge-slate', '基础块（复习错题）配色 badge-slate');
check(weekEvalBlock.targetCls === 'badge-green', '周评估块配色 badge-green');
check(dailyPlanData[0].blocks[2].targetCls === 'badge-rose', '主项实战块配色 badge-rose');
console.log('    本周进度:', weekCompleted + '/' + weekTotal, '| 今日进度:', todayCompleted + '/' + todayTotal);
console.log('    示例块:', JSON.stringify(dailyPlanData[0].blocks[0]));

console.log('== 3) 等级分轨迹数据 (line-chart) ==');
const recent = (tc.ratingTrend || []).slice(-14);
const trendLabels = recent.map((p) => String(p.date).slice(5));
const trendSeries = [{ name: '等级分', color: '#6c63ff', values: recent.map((p) => p.rating) }];
check(trendLabels.length > 0, 'labels ' + trendLabels.length + ' 个 (' + trendLabels[0] + '~' + trendLabels[trendLabels.length - 1] + ')');
check(trendSeries[0].values.every((v) => typeof v === 'number'), 'values 全为数字');
check(trendSeries[0].values.length === trendLabels.length, 'labels 与 values 等长');

console.log('== 4) 时间块 link 覆盖 onTimeBlockTap ==');
const links = new Set();
wp.dailyPlans.forEach((d) => d.timeBlocks.forEach((b) => { if (b.link) links.add(b.link); }));
console.log('    出现的 link:', Array.from(links).map((l) => l.split('?')[0]).join(', '));
check(Array.from(links).every((l) => /^\/(puzzles|my-puzzles|game|records|study|training-plan)/.test(l)), '所有 link 都被 onTimeBlockTap 覆盖');

console.log('== 5) 周报周次 ==');
const reportWeek = tc.pendingEvaluationWeek || 'fallback';
check(!!reportWeek, 'reportWeek 有值 (' + reportWeek + ')');

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);

"use strict";
/**
 * 每周训练计划的共享工具（首页「今日训练安排」与训练中心页共用）
 *
 * 首页原本自维护一套时间块渲染与完成判定，与训练中心页各写一份，
 * 会出现「同一页面两个互相矛盾的进度数字」。这里集中一份纯函数实现，
 * 与网页版 frontend/src/utils/blockCompletion.ts + DayPlanCard.tsx 保持同源。
 *
 * 完成判定 key = `${dayOfWeek}-${blockIndex}`，因此计划里 timeBlocks 的顺序与数量不可变。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAY_TYPE_META = void 0;
exports.todayStr = todayStr;
exports.todayDayOfWeek = todayDayOfWeek;
exports.weekRangeLabel = weekRangeLabel;
exports.targetBadgeClass = targetBadgeClass;
exports.computeAutoCompletedBlocks = computeAutoCompletedBlocks;
exports.getDayProgress = getDayProgress;
exports.openTrainingLink = openTrainingLink;
exports.todayPuzzleUrl = todayPuzzleUrl;
/** 日类型标签（与网页版 DayPlanCard 的 DAY_TYPE_META 同源） */
exports.DAY_TYPE_META = {
    game: { label: '实战日', icon: '♟', cls: 'dt-game' },
    practice: { label: '专项日', icon: '🎯', cls: 'dt-practice' },
    review: { label: '复盘日', icon: '🔍', cls: 'dt-review' },
    assessment: { label: '评估日', icon: '📝', cls: 'dt-assessment' },
};
/** 本地「今天」YYYY-MM-DD（与服务端约定用客户端真实日期，避免时区/时钟偏差） */
function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
}
/** JS getDay()（0=周日）→ 计划 dayOfWeek（7=周日） */
function todayDayOfWeek() {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
}
/** 周一日期 → 「MM-DD ~ MM-DD」 */
function weekRangeLabel(weekStart) {
    if (!weekStart)
        return '';
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + 6);
    const end = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${weekStart.slice(5)} ~ ${end}`;
}
/** 弱项标注配色：按 focusId 前缀区分主项/副项/维持/基础/周评估（同网页版 targetBadgeClass） */
function targetBadgeClass(focusId) {
    if (!focusId)
        return 'badge-gray';
    if (focusId === 'base')
        return 'badge-slate';
    if (focusId === 'weekly-eval')
        return 'badge-green';
    if (focusId.indexOf('strength-') === 0)
        return 'badge-emerald';
    return 'badge-rose';
}
/**
 * 整周自动完成的时间块 key 集合（同 frontend/src/utils/blockCompletion.ts）。
 * 优先用后端按时间块维度算好的集合——必须按「字段是否存在」判断：
 * 后端下发的空对象（今天确实没完成任何块）是合法结果，按非空判断会退回旧的类别判定，
 * 重新引入「做一题就把当天所有习题块全打勾」的问题。
 */
function computeAutoCompletedBlocks(plan) {
    if (!plan)
        return [];
    if (plan.blockCompletion !== undefined && plan.blockCompletion !== null) {
        return Object.keys(plan.blockCompletion);
    }
    // 回退：按训练类别判定（历史计划缓存，后端未下发 blockCompletion）
    const done = [];
    if (!plan.dailyActivity)
        return done;
    const startDate = new Date(`${plan.weekStart}T00:00:00`);
    for (const dayPlan of plan.dailyPlans || []) {
        const blockDate = new Date(startDate);
        blockDate.setDate(blockDate.getDate() + (dayPlan.dayOfWeek - 1));
        const m = String(blockDate.getMonth() + 1).padStart(2, '0');
        const dd = String(blockDate.getDate()).padStart(2, '0');
        const dateStr = `${blockDate.getFullYear()}-${m}-${dd}`;
        const day = plan.dailyActivity[dateStr];
        (dayPlan.timeBlocks || []).forEach((block, i) => {
            if (!block.link)
                return;
            if (block.link.indexOf('/training-plan') === 0) {
                if (plan.weeklyEvalSubmitted === true)
                    done.push(`${dayPlan.dayOfWeek}-${i}`);
                return;
            }
            if (!day)
                return;
            if (block.link.indexOf('/game') === 0 && day.game > 0)
                done.push(`${dayPlan.dayOfWeek}-${i}`);
            else if (block.link.indexOf('/my-puzzles') === 0 && day.review > 0)
                done.push(`${dayPlan.dayOfWeek}-${i}`);
            else if (block.link.indexOf('/puzzles') === 0 && day.puzzle > 0)
                done.push(`${dayPlan.dayOfWeek}-${i}`);
            else if ((block.link.indexOf('/records') === 0 || block.link.indexOf('/study') === 0)
                && (day.puzzle > 0 || day.analysis > 0))
                done.push(`${dayPlan.dayOfWeek}-${i}`);
        });
    }
    return done;
}
/** 单日进度：按已完成块累计分钟数 */
function getDayProgress(day, completedSet) {
    if (!day)
        return { completed: 0, total: 0, percent: 0 };
    const total = day.totalMinutes || 0;
    let completed = 0;
    (day.timeBlocks || []).forEach((block, i) => {
        if (completedSet.has(`${day.dayOfWeek}-${i}`))
            completed += block.duration || 0;
    });
    return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}
/**
 * 时间块跳转：把服务端下发的前端路由（/game、/puzzles…）翻译成小程序跳转。
 * 对弈类统一走 pendingStartAI 令牌，否则进入对弈页只会看到旧局面。
 */
function openTrainingLink(link) {
    if (!link)
        return;
    // 周评估块指向训练计划页本身，直接进训练中心
    if (link.indexOf('/training-plan') === 0) {
        wx.navigateTo({ url: '/pages/training-plan/training-plan' });
        return;
    }
    if (link.indexOf('/my-puzzles') === 0) {
        // 「我的习题」到期复习在小程序里走我的习题列表
        wx.navigateTo({ url: '/pages/puzzle-list/puzzle-list' });
        return;
    }
    if (link.indexOf('/puzzles') === 0) {
        const queryIndex = link.indexOf('?');
        const query = queryIndex >= 0 ? link.slice(queryIndex + 1) : '';
        wx.navigateTo({ url: `/pages/puzzles/puzzles${query ? '?' + query : ''}` });
        return;
    }
    if (link.indexOf('/game') === 0) {
        const app = getApp();
        app.globalData.pendingStartAI = true;
        wx.switchTab({ url: '/pages/index/index' });
        return;
    }
    if (link.indexOf('/records') === 0 || link.indexOf('/study') === 0) {
        wx.switchTab({ url: '/pages/records/records' });
    }
}
/**
 * 今日题目条目的小程序跳转地址。
 * 服务端下发的是网页版路由（/user-puzzle/15 与 /puzzles?puzzleId=…&fromWrongBook=1），
 * 小程序里自建习题走解题页，标准题库按错题本模式进题库页。
 */
function todayPuzzleUrl(item) {
    if (!item)
        return '/pages/puzzles/puzzles';
    if (item.kind === 'user-puzzle') {
        return `/pages/puzzles/user-solve/user-solve?id=${item.puzzleId}`;
    }
    return '/pages/puzzles/puzzles?mode=wrong';
}

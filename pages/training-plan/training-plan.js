"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 训练中心页（与网页版 frontend/src/pages/TrainingPlanPage.tsx 一一对齐）
 *
 * 板块顺序与网页版一致：
 *   ① 页头（标题 + 今天提升 + 分享 + 刷新）
 *   ② 升级目标卡片（当前→目标等级、达标概率、进度条、速度/ETA/置信区间、等级分轨迹、今日有效训练、当前/下一阶段目标）
 *   ③ 动态评估卡片（近3天习题/对局/正确率、趋势、优势/劣势、调整后的周计划提示）
 *   ④ 本周训练计划卡片（主项/副项/强项 + 本周进度 + 7 天 × 45 分钟清单）
 *   ⑤ AI 训练周报（按周缓存，可生成/重新生成）
 *   ⑥ 未设定等级时的「开始你的升级之旅」引导页
 *
 * 与网页版同源的判定逻辑：
 *   - computeAutoCompletedBlocks 同 frontend/src/utils/blockCompletion.ts（优先 blockCompletion）
 *   - getDayProgress / 日类型标签 / 弱项标签配色同 DayPlanCard
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const weeklyPlanUtil = require('../../utils/weeklyPlan');
const { CHESS_GRADE_ORDER, CHESS_GRADE_LABELS, CHESS_GRADE_ELO } = require('../../utils/chessGrade');
const { parseMarkdown } = require('../../utils/markdown');
const { trackEvent } = require('../../utils/analytics');
const DAY_TYPE_META = weeklyPlanUtil.DAY_TYPE_META;
const todayStr = weeklyPlanUtil.todayStr;
const todayDayOfWeek = weeklyPlanUtil.todayDayOfWeek;
const weekRangeLabel = weeklyPlanUtil.weekRangeLabel;
/** 上一个自然周的周一（本地时区） */
function lastWeekStartStr() {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
Page({
    _syncTheme() {
        try {
            const a = getApp();
            const theme = a?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    data: {
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
        // ===== 加载状态 =====
        loading: true,
        error: '',
        needLogin: false,
        // ===== ① 训练中心数据 =====
        hasGradeSettings: false,
        upgradePlan: null,
        ratingMetrics: null,
        todayLoad: null,
        // 升级目标卡片的预计算展示值（WXML 不支持方法调用与复杂表达式）
        gradeView: null,
        // 等级分轨迹（line-chart 组件）
        trendLabels: [],
        trendSeries: [],
        // ===== ② 动态评估 =====
        assessing: false,
        assessmentMode: false,
        assessmentResult: null,
        assessmentError: '',
        // ===== ③ 本周训练计划 =====
        weeklyPlan: null,
        weekRange: '',
        weeklyRefreshing: false,
        planNotice: null,
        dailyPlanData: [],
        weekProgress: { completed: 0, total: 0, percent: 0 },
        todayProgress: { completed: 0, total: 0, percent: 0 },
        todayDayOfWeek: 1,
        planExpanded: true,
        // ===== ④ AI 训练周报 =====
        reportWeek: '',
        reportWeekLabel: '',
        report: null,
        reportBlocks: [],
        reportLoading: false,
        reportGenerating: false,
        reportError: '',
        // ===== ⑤ 等级设定（未设定时展示） =====
        showGradeSettings: false,
        gradeOptions: [],
        gradeIndex: 0,
        targetGradeOptions: [],
        targetGradeIndex: 0,
        savingGrades: false,
        gradeError: '',
    },
    onShow() {
        this._syncTheme();
        if (!app.globalData.token) {
            this.setData({ needLogin: true, loading: false, error: '' });
            return;
        }
        this.setData({ needLogin: false });
        this.load();
    },
    // ===== 数据加载 =====
    /** 点击「重试」/「刷新」时作为事件处理器，事件对象不能当作 opts 传入 */
    onReload() {
        this.load();
    },
    async load(opts) {
        if (!opts?.silent)
            this.setData({ loading: true });
        this.setData({ error: '' });
        try {
            const res = await api.getTrainingCenterData(todayStr());
            const data = res?.data || res || null;
            if (!data)
                throw new Error('获取训练中心数据失败');
            this.applyCenterData(data, opts?.silent);
        }
        catch (err) {
            this.setData({ error: err?.message || '获取训练数据失败' });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    /** 把训练中心响应铺到页面上（评估模式下的调整计划由 assessmentResult 单独覆盖） */
    applyCenterData(data, silent) {
        const upgradePlan = data.upgradePlan || null;
        const ratingMetrics = data.ratingMetrics || null;
        const ratingTrend = data.ratingTrend || [];
        // 轨迹图：取近 14 天
        const recent = ratingTrend.slice(-14);
        const trendLabels = recent.map((p) => String(p.date || '').slice(5));
        const trendSeries = [{
                name: '等级分',
                color: '#6c63ff',
                values: recent.map((p) => p.rating),
            }];
        // 每周动态训练计划：优先用页面已缓存的（评估调整结果由 applyAssessment 覆盖）
        const weeklyPlan = this.data.assessmentMode && this.data.weeklyPlan
            ? this.data.weeklyPlan
            : (data.weeklyPlan || null);
        const todayDow = todayDayOfWeek();
        const derived = this.deriveWeeklyPlan(weeklyPlan, todayDow);
        const reportWeek = data.pendingEvaluationWeek || lastWeekStartStr();
        const patch = {
            hasGradeSettings: !!data.hasGradeSettings,
            upgradePlan,
            ratingMetrics,
            gradeView: this.buildGradeView(upgradePlan, ratingMetrics),
            todayLoad: data.todayLoad || null,
            trendLabels,
            trendSeries,
            weeklyPlan,
            weekRange: weeklyPlan ? weekRangeLabel(weeklyPlan.weekStart) : '',
            todayDayOfWeek: todayDow,
            weekProgress: derived.weekProgress,
            todayProgress: derived.todayProgress,
            dailyPlanData: derived.dailyPlanData,
            reportWeek,
            reportWeekLabel: weekRangeLabel(reportWeek),
        };
        this.setData(patch);
        // 周报按周缓存：周次变化时才重新读取缓存
        if (!silent || this.data.reportWeek !== reportWeek) {
            this.loadReport(reportWeek);
        }
    },
    /** 由周计划派生：7 天清单、本周进度、今日进度（与网页版 computeAutoCompletedBlocks / getDayProgress 同源） */
    deriveWeeklyPlan(weeklyPlan, todayDow) {
        const empty = {
            weekProgress: { completed: 0, total: 0, percent: 0 },
            todayProgress: { completed: 0, total: 0, percent: 0 },
            dailyPlanData: [],
        };
        if (!weeklyPlan || !weeklyPlan.dailyPlans)
            return empty;
        const completedBlocks = weeklyPlanUtil.computeAutoCompletedBlocks(weeklyPlan);
        const completedSet = new Set(completedBlocks);
        const blockProgress = weeklyPlan.blockProgress || null;
        let weekCompleted = 0;
        let weekTotal = 0;
        let todayCompleted = 0;
        let todayTotal = 0;
        const dailyPlanData = weeklyPlan.dailyPlans.map((day) => {
            const prog = weeklyPlanUtil.getDayProgress(day, completedSet);
            weekCompleted += prog.completed;
            weekTotal += prog.total;
            const isToday = day.dayOfWeek === todayDow;
            if (isToday) {
                todayCompleted = prog.completed;
                todayTotal = prog.total;
            }
            const blocks = (day.timeBlocks || []).map((block, i) => {
                const key = `${day.dayOfWeek}-${i}`;
                const isDone = completedSet.has(key);
                // 量化任务进度挂在合并组首块，组内后续块跟随组首显示同一进度（同网页版 DayPlanCard）
                const own = blockProgress ? blockProgress[key] : null;
                const prevKey = i > 0 ? `${day.dayOfWeek}-${i - 1}` : '';
                const prev = prevKey && blockProgress ? blockProgress[prevKey] : null;
                const shown = own || (isDone && prev ? prev : null);
                return {
                    // 稳定 key：同日同时段位置，配合 wx:key 复用节点
                    key: key,
                    activity: block.activity,
                    duration: block.duration,
                    description: block.description,
                    link: block.link || '',
                    target: block.target || '',
                    targetCls: weeklyPlanUtil.targetBadgeClass(block.focusId),
                    isDone,
                    hasLink: !!block.link,
                    hasProg: !!shown,
                    progCurrent: shown ? shown.current : 0,
                    progTarget: shown ? shown.target : 0,
                    progPct: shown && shown.target > 0 ? Math.round((shown.current / shown.target) * 100) : 0,
                };
            });
            const meta = DAY_TYPE_META[day.type] || { label: '', icon: '', cls: 'dt-game' };
            return {
                dayOfWeek: day.dayOfWeek,
                dayLabel: day.dayLabel,
                typeLabel: meta.label,
                typeIcon: meta.icon,
                typeCls: meta.cls,
                totalMinutes: day.totalMinutes || 0,
                completedMin: prog.completed,
                progressPct: prog.percent,
                isToday,
                blocks,
            };
        });
        return {
            weekProgress: {
                completed: weekCompleted,
                total: weekTotal,
                percent: weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0,
            },
            todayProgress: {
                completed: todayCompleted,
                total: todayTotal,
                percent: todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0,
            },
            dailyPlanData,
        };
    },
    /**
     * 升级目标卡片的预计算展示值（同网页版 GradeGoalCard）：
     * 进度条 P = (R − baseline) / (target − baseline)；达标概率配色分档；
     * 速度/ETA/置信区间的文案都在这里定稿，WXML 只做插值。
     */
    buildGradeView(upgradePlan, metrics) {
        if (!upgradePlan)
            return null;
        const baselineElo = metrics?.baselineElo ?? CHESS_GRADE_ELO['level-10'][0];
        const targetElo = upgradePlan.targetElo;
        const denom = targetElo - baselineElo;
        const currentElo = upgradePlan.currentElo;
        const progress = denom > 0
            ? Math.min(100, Math.max(0, ((currentElo - baselineElo) / denom) * 100))
            : 100;
        // 达标概率配色：≥50% 绿、≥10% 暖橙、其余灰
        let probCls = 'gp-low';
        if (metrics) {
            probCls = metrics.successProbability >= 50 ? 'gp-high' : (metrics.successProbability >= 10 ? 'gp-mid' : 'gp-low');
        }
        // 差距：未达标显示 −gap，已超额显示 +|gap|
        const gapText = metrics
            ? (metrics.gap > 0 ? `−${metrics.gap}` : `+${Math.abs(metrics.gap)}`)
            : '';
        // 预计达标：etaDays=0 → 已达标；null → 省略号（详细原因见 etaText）
        let etaText = '⋯';
        let etaLabel = '状态';
        if (metrics) {
            if (metrics.etaDays !== null) {
                etaLabel = '预计达标';
                etaText = metrics.etaDays === 0 ? '🏁 已达标' : `${metrics.etaDays} 天`;
            }
        }
        return {
            currentGradeLabel: upgradePlan.currentGradeLabel,
            targetGradeLabel: upgradePlan.targetGradeLabel,
            // 有统一棋力模型时展示 R ± σ，否则退回 Elo 估值
            currentRatingText: metrics ? `${metrics.currentRating} ± ${metrics.sigma}` : `≈ ${currentElo} Elo`,
            targetElo,
            baselineElo,
            progress: Math.round(progress),
            gapText,
            hasMetrics: !!metrics,
            successProbability: metrics ? metrics.successProbability : 0,
            probCls,
            velocityText: metrics && metrics.velocity != null
                ? `${metrics.velocity > 0 ? '+' : ''}${metrics.velocity}/天`
                : '—',
            etaLabel,
            etaText,
            confidenceLo: metrics ? metrics.confidenceInterval[0] : 0,
            confidenceHi: metrics ? metrics.confidenceInterval[1] : 0,
            // etaDays 为 null 时（速度不足/数据不足）显示服务端给的原因文案
            etaNote: metrics && metrics.etaText && metrics.etaDays === null ? metrics.etaText : '',
            currentTarget: upgradePlan.currentTarget,
            nextTarget: upgradePlan.nextTarget,
        };
    },
    /** 弱项标注配色：按 focusId 前缀区分主项/副项/维持/基础/周评估（同网页版 targetBadgeClass） */
    targetBadgeClass(focusId) {
        return weeklyPlanUtil.targetBadgeClass(focusId);
    },
    /** 重新诊断弱点并生成本周计划（会消耗 AI 制定计划配额） */
    async onRefreshWeeklyPlan() {
        if (this.data.weeklyRefreshing)
            return;
        this.setData({ weeklyRefreshing: true, planNotice: null });
        try {
            const res = await api.getWeeklyPlan(true, todayStr());
            const weeklyPlan = res?.data || res || null;
            const prev = this.data.weeklyPlan;
            const unchanged = !!prev && JSON.stringify(weeklyPlan) === JSON.stringify(prev);
            const derived = this.deriveWeeklyPlan(weeklyPlan, todayDayOfWeek());
            this.setData({
                weeklyPlan,
                weekRange: weeklyPlan ? weekRangeLabel(weeklyPlan.weekStart) : '',
                weekProgress: derived.weekProgress,
                todayProgress: derived.todayProgress,
                dailyPlanData: derived.dailyPlanData,
            });
            if (unchanged) {
                this.setData({ planNotice: { text: '本周诊断结果与上次一致，未发现新的弱点。', kind: 'info' } });
            }
        }
        catch (err) {
            // 配额/会员不足：透出升级引导（同网页版 notice.code === 'QUOTA_EXCEEDED'）
            const upgrade = err?.code === 'QUOTA_EXCEEDED';
            const benefitName = err?.benefit?.name;
            this.setData({
                planNotice: {
                    text: err?.message || '重新诊断失败，请稍后重试',
                    kind: 'error',
                    upgrade,
                    upgradeLabel: upgrade
                        ? (benefitName ? `升级会员以获得更多「${benefitName}」次数` : '升级会员以继续使用 AI 制定训练计划')
                        : '',
                },
            });
        }
        finally {
            this.setData({ weeklyRefreshing: false });
        }
    },
    onTogglePlanExpanded() {
        this.setData({ planExpanded: !this.data.planExpanded });
    },
    /** 滚动到今日任务（对应网页版「今天提升」按钮）。
     *  页面用原生滚动（非 scroll-view）承载，因为等级分轨迹是原生 canvas 组件，
     *  放进 scroll-view 会在滚动时脱离内容层（同 analysis 页把 canvas 放在滚动容器外的做法）。 */
    onScrollToToday() {
        const dow = todayDayOfWeek();
        const has = this.data.dailyPlanData.some((d) => d.dayOfWeek === dow);
        if (!has) {
            wx.showToast({ title: '今天暂无安排', icon: 'none' });
            return;
        }
        wx.createSelectorQuery()
            .select(`#day-${dow}`)
            .boundingClientRect()
            .selectViewport()
            .scrollOffset()
            .exec((res) => {
            const rect = res?.[0];
            const viewport = res?.[1];
            if (!rect || !viewport)
                return;
            wx.pageScrollTo({ scrollTop: viewport.scrollTop + rect.top - 20, duration: 250 });
        });
    },
    // ===== 动态评估 =====
    async onDynamicAssessment() {
        if (this.data.assessing)
            return;
        this.setData({ assessing: true, assessmentError: '', planNotice: null });
        try {
            const res = await api.triggerDynamicAssessment();
            const result = res?.data || res || null;
            this.setData({ assessmentResult: result, assessmentMode: true });
            // 评估发现明显弱项/下滑时服务端会一并返回调整后的周计划（不写库、不消耗配额），
            // 直接应用到计划卡片，让评估结果立刻体现在计划上。
            const adjusted = result?.adjustedWeeklyPlan;
            if (adjusted) {
                const current = this.data.weeklyPlan;
                const changed = !current || JSON.stringify(adjusted) !== JSON.stringify(current);
                const derived = this.deriveWeeklyPlan(adjusted, todayDayOfWeek());
                this.setData({
                    weeklyPlan: adjusted,
                    weekRange: weekRangeLabel(adjusted.weekStart),
                    weekProgress: derived.weekProgress,
                    todayProgress: derived.todayProgress,
                    dailyPlanData: derived.dailyPlanData,
                });
                if (changed) {
                    this.setData({ planNotice: { text: '已根据本次评估结果调整本周训练计划。', kind: 'info' } });
                }
            }
        }
        catch (err) {
            this.setData({ assessmentError: err?.message || '动态评估失败' });
        }
        finally {
            this.setData({ assessing: false });
        }
    },
    /** 切回既定计划（丢弃评估产出的调整计划） */
    onSwitchToStandard() {
        this.setData({ assessmentMode: false, assessmentError: '', planNotice: null });
        // 用服务端最新数据恢复既定计划
        this.load({ silent: true });
    },
    // ===== 时间块跳转（对应网页版的 route 跳转） =====
    onTimeBlockTap(e) {
        const link = e.currentTarget.dataset.link;
        if (!link)
            return;
        // 埋点：点击训练计划中的时间块
        trackEvent('time_block_tap', { link });
        // 周评估块指向训练计划页本身：滚回顶部即可
        if (link.indexOf('/training-plan') === 0) {
            wx.pageScrollTo({ scrollTop: 0, duration: 200 });
            return;
        }
        if (link.indexOf('/puzzles') === 0 || link.indexOf('/my-puzzles') === 0) {
            const queryIndex = link.indexOf('?');
            const query = queryIndex >= 0 ? link.slice(queryIndex + 1) : '';
            // /my-puzzles（我的习题到期复习）在小程序里走错题本复习模式
            if (link.indexOf('/my-puzzles') === 0) {
                wx.navigateTo({ url: '/pages/puzzle-list/puzzle-list' });
                return;
            }
            wx.navigateTo({ url: `/pages/puzzles/puzzles${query ? '?' + query : ''}` });
            return;
        }
        if (link.indexOf('/game') === 0) {
            app.globalData.pendingStartAI = true;
            wx.switchTab({ url: '/pages/index/index' });
            return;
        }
        if (link.indexOf('/records') === 0 || link.indexOf('/study') === 0) {
            wx.switchTab({ url: '/pages/records/records' });
        }
    },
    // ===== AI 训练周报 =====
    async loadReport(week) {
        this.setData({ reportLoading: true, report: null, reportBlocks: [], reportError: '' });
        try {
            const res = await api.getWeeklyReport(week);
            const report = res?.data || null;
            this.setData({
                report: report || null,
                reportBlocks: report?.content ? parseMarkdown(report.content) : [],
            });
        }
        catch (e) {
            // 缓存读取失败不打扰用户，按钮仍可生成
        }
        finally {
            this.setData({ reportLoading: false });
        }
    },
    async onGenerateReport(e) {
        if (this.data.reportGenerating)
            return;
        const refresh = e?.currentTarget?.dataset?.refresh === true || e?.currentTarget?.dataset?.refresh === 'true';
        const week = this.data.reportWeek;
        // 埋点：生成/重新生成 AI 训练周报
        trackEvent('training_report_generate', { week, refresh });
        this.setData({ reportGenerating: true, reportError: '' });
        try {
            const res = await api.generateWeeklyReport(week, refresh);
            const report = res?.data || null;
            this.setData({
                report: report || null,
                reportBlocks: report?.content ? parseMarkdown(report.content) : [],
            });
        }
        catch (err) {
            this.setData({ reportError: err?.message || '生成失败，请重试' });
        }
        finally {
            this.setData({ reportGenerating: false });
        }
    },
    // ===== 升级目标：等级设定 / 调整 =====
    /** 打开等级编辑面板（未设定等级时是「生成训练计划」的入口） */
    onToggleGradeEditor() {
        const plan = this.data.upgradePlan;
        const current = plan?.currentGrade || 'level-10';
        const target = plan?.targetGrade || CHESS_GRADE_ORDER[1];
        this.setData({
            showGradeSettings: !this.data.showGradeSettings,
            gradeError: '',
            ...this.buildGradeState(current, target),
        });
    },
    /** 生成 picker 的 range / index（目标等级只能选高于当前等级的） */
    buildGradeState(current, target) {
        const curIdx = Math.max(0, CHESS_GRADE_ORDER.indexOf(current));
        const higher = CHESS_GRADE_ORDER.slice(curIdx + 1);
        const targetList = higher.length > 0 ? higher : CHESS_GRADE_ORDER.slice(-1);
        let tgtIdx = targetList.indexOf(target);
        if (tgtIdx < 0)
            tgtIdx = 0;
        return {
            gradeOptions: CHESS_GRADE_ORDER.map((g) => `${CHESS_GRADE_LABELS[g]}（Elo ${CHESS_GRADE_ELO[g][0]}-${CHESS_GRADE_ELO[g][1]}）`),
            gradeIndex: curIdx,
            targetGradeOptions: targetList.map((g) => `${CHESS_GRADE_LABELS[g]}（Elo ${CHESS_GRADE_ELO[g][0]}-${CHESS_GRADE_ELO[g][1]}）`),
            targetGradeIndex: tgtIdx,
        };
    },
    /** 当前等级变更：自动把目标等级修正为更高一级（同网页版逻辑） */
    onCurrentGradeChange(e) {
        const idx = Number(e.detail.value);
        const current = CHESS_GRADE_ORDER[idx];
        const next = CHESS_GRADE_ORDER[idx + 1] || CHESS_GRADE_ORDER[idx];
        this.setData({ gradeError: '', ...this.buildGradeState(current, next) });
    },
    onTargetGradeChange(e) {
        this.setData({ targetGradeIndex: Number(e.detail.value), gradeError: '' });
    },
    /** 保存等级设定并按新等级重新生成本周计划（服务端会一并返回新计划） */
    async onSaveGrades() {
        if (this.data.savingGrades)
            return;
        const current = CHESS_GRADE_ORDER[this.data.gradeIndex];
        // 目标等级选项是「高于当前等级」的子列表，需换算回全局等级
        const targetList = CHESS_GRADE_ORDER.slice(this.data.gradeIndex + 1);
        const target = targetList[this.data.targetGradeIndex] || targetList[0];
        if (!current || !target) {
            this.setData({ gradeError: '请选择有效的当前等级与目标等级' });
            return;
        }
        this.setData({ savingGrades: true, gradeError: '' });
        try {
            const res = await api.saveGradeSettings(current, target);
            const result = res?.data || res || null;
            const upgradePlan = result?.upgradePlan || null;
            const weeklyPlan = result?.weeklyPlan || null;
            const derived = this.deriveWeeklyPlan(weeklyPlan, todayDayOfWeek());
            // 旧的动态评估结果基于旧等级目标，已过期：切回既定计划展示
            this.setData({
                upgradePlan,
                hasGradeSettings: true,
                weeklyPlan,
                weekRange: weeklyPlan ? weekRangeLabel(weeklyPlan.weekStart) : '',
                weekProgress: derived.weekProgress,
                todayProgress: derived.todayProgress,
                dailyPlanData: derived.dailyPlanData,
                assessmentMode: false,
                assessmentResult: null,
                assessmentError: '',
                showGradeSettings: false,
                savingGrades: false,
                planNotice: weeklyPlan
                    ? { text: '等级已更新，本周训练计划已按新目标重新生成。', kind: 'info' }
                    : null,
            });
            util.showToast('等级已更新', 'success');
            // 静默刷新：达标概率/子能力等指标依赖等级设定
            this.load({ silent: true });
        }
        catch (err) {
            this.setData({ savingGrades: false, gradeError: err?.message || '保存失败，请稍后重试' });
        }
    },
    onGoAssessment() {
        wx.navigateTo({ url: '/pages/assessment/assessment' });
    },
    onGoMembership() {
        wx.navigateTo({ url: '/pages/membership/membership' });
    },
    onGoPuzzles() {
        wx.navigateTo({ url: '/pages/puzzles/puzzles' });
    },
    onGoGame() {
        app.globalData.pendingStartAI = true;
        wx.switchTab({ url: '/pages/index/index' });
    },
    onGoLogin() {
        wx.navigateTo({ url: '/pages/login/login' });
    },
});

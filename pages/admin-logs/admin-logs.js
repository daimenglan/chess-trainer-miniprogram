"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 数据监控明细：用户行为日志（仅管理员）
 * 数据来自共享后端 /api/admin/logs，分页加载，支持类型与日期筛选
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const PAGE_LIMIT = 50;
/** 与网页版 AdminLogs 一致的操作类型选项 */
const activityTypes = [
    'login', 'logout', 'page_view', 'game_start', 'game_end',
    'analysis', 'coach', 'settings', 'profile', 'records',
    'replay', 'heartbeat', 'register',
    // 业务关键事件（小程序埋点 + 网页版埋点）
    'deep_review', 'video_generate', 'feature_click', 'search',
    'puzzle_start', 'puzzle_solve', 'puzzle_giveup', 'hint_use',
    'trial_start', 'questionnaire_submit', 'assessment_batch_analyze',
    'record_replay', 'record_import', 'time_block_tap', 'training_report_generate',
    'match_join', 'match_cancel', 'pvp_start', 'pvp_end', 'pvp_resign', 'pvp_invite_accept',
    'pricing_page_view', 'purchase_start', 'purchase_success', 'purchase_cancel', 'redeem',
    'feedback_submit', 'social_add_friend', 'social_send_message', 'group_create',
    'coin_exchange', 'shop_purchase', 'distributor_activate',
    'lichess_bind_start', 'lichess_bind_success',
];
const typeLabels = {
    login: '登录',
    logout: '登出',
    page_view: '页面浏览',
    game_start: '开始对局',
    game_end: '结束对局',
    analysis: '局面分析',
    coach: 'AI教练',
    settings: '设置',
    profile: '个人信息',
    records: '棋谱库',
    replay: '复盘',
    heartbeat: '心跳',
    register: '注册',
    deep_review: '深度复盘',
    video_generate: '生成复盘视频',
    feature_click: '功能点击',
    search: '搜索',
    puzzle_start: '开始做题',
    puzzle_solve: '完成题目',
    puzzle_giveup: '放弃题目',
    hint_use: '使用提示',
    trial_start: '开始测评',
    questionnaire_submit: '提交问卷',
    assessment_batch_analyze: '批量分析对局',
    record_replay: '棋谱回放',
    record_import: '导入棋谱',
    time_block_tap: '点击训练时间块',
    training_report_generate: '生成训练周报',
    match_join: '发起匹配',
    match_cancel: '取消匹配',
    pvp_start: '联机对局开始',
    pvp_end: '联机对局结束',
    pvp_resign: '联机认输',
    pvp_invite_accept: '接受对局邀请',
    pricing_page_view: '会员页浏览',
    purchase_start: '发起支付',
    purchase_success: '支付成功',
    purchase_cancel: '取消支付',
    redeem: '兑换码兑换',
    feedback_submit: '提交反馈',
    social_add_friend: '添加好友',
    social_send_message: '发送消息',
    group_create: '创建群组',
    coin_exchange: '兑换龙币',
    shop_purchase: '商城购买',
    distributor_activate: '激活分销员',
    lichess_bind_start: '开始绑定Lichess',
    lichess_bind_success: '绑定Lichess成功',
};
function pad2(n) {
    return n < 10 ? '0' + n : String(n);
}
function formatLogTime(createdAt) {
    const d = new Date(createdAt);
    if (isNaN(d.getTime()))
        return createdAt || '';
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
Page({
    /** 同步主题 */
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
        typeOptions: ['全部'].concat(activityTypes.map((t) => typeLabels[t] || t)),
        typeIndex: 0,
        platformOptions: ['全部渠道', '网站', '小程序'],
        platformIndex: 0,
        dateFrom: '',
        dateTo: '',
        logs: [],
        page: 1,
        total: 0,
        loading: false,
        finished: false,
    },
    onLoad() {
        if (!this.checkAdmin())
            return;
    },
    onShow() {
        this._syncTheme();
        if (!this.checkAdmin())
            return;
        // 每次进入重置加载
        this.resetAndLoad();
    },
    onPullDownRefresh() {
        this.resetAndLoad().finally(() => wx.stopPullDownRefresh());
    },
    onReachBottom() {
        if (this.data.loading || this.data.finished)
            return;
        this.loadPage(this.data.page + 1);
    },
    /** 管理员校验，非管理员返回 false */
    checkAdmin() {
        if (!util.isAdminUser()) {
            wx.showToast({ title: '权限不足', icon: 'none' });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/choice/choice' }) }), 800);
            return false;
        }
        return true;
    },
    currentActivityType() {
        const idx = this.data.typeIndex;
        return idx > 0 ? activityTypes[idx - 1] : '';
    },
    /** 渠道筛选：0=全部，1=网站，2=小程序（与网页版渠道切换的取值一致） */
    currentPlatform() {
        const idx = this.data.platformIndex;
        return idx === 1 ? 'web' : idx === 2 ? 'miniapp' : '';
    },
    buildQuery(page) {
        return {
            page,
            limit: PAGE_LIMIT,
            activityType: this.currentActivityType() || undefined,
            dateFrom: this.data.dateFrom || undefined,
            dateTo: this.data.dateTo || undefined,
            platform: this.currentPlatform() || undefined,
        };
    },
    resetAndLoad() {
        return this.loadPage(1);
    },
    loadPage(page) {
        this.setData({ loading: true });
        return api.getAdminLogs(this.buildQuery(page)).then((res) => {
            const body = res?.data || {};
            const list = body.logs || [];
            // WXML 不调用函数，显示字段在 JS 侧预计算
            const items = list.map((log) => ({
                logId: log.logId,
                username: log.username,
                activityType: log.activityType,
                typeLabel: typeLabels[log.activityType] || log.activityType,
                pagePath: log.pagePath,
                platformText: log.platform === 'miniapp' ? '小程序' : '网站',
                timeText: formatLogTime(log.createdAt),
                durationText: log.durationSeconds ? Math.round(log.durationSeconds) + '秒' : '',
            }));
            const merged = page === 1 ? items : this.data.logs.concat(items);
            this.setData({
                logs: merged,
                page,
                total: body.total || merged.length,
                finished: items.length < PAGE_LIMIT,
            });
        }).catch((err) => {
            console.error('加载日志失败', err);
            util.showToast(err?.message || '加载失败');
        }).finally(() => {
            this.setData({ loading: false });
        });
    },
    onTypeChange(e) {
        this.setData({ typeIndex: Number(e.detail.value) || 0 });
        this.resetAndLoad();
    },
    onPlatformChange(e) {
        this.setData({ platformIndex: Number(e.detail.value) || 0 });
        this.resetAndLoad();
    },
    onDateFromChange(e) {
        this.setData({ dateFrom: e.detail.value || '' });
        this.resetAndLoad();
    },
    onDateToChange(e) {
        this.setData({ dateTo: e.detail.value || '' });
        this.resetAndLoad();
    },
    onResetFilter() {
        this.setData({ typeIndex: 0, platformIndex: 0, dateFrom: '', dateTo: '' });
        this.resetAndLoad();
    },
});

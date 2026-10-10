"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 会员中心页 - 等级权益对比、购买、兑换码
 * 参照网页版 MembershiPage.tsx 完善
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const { trackEvent } = require('../../utils/analytics');
Page({
    /** 同步主题 */
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        disabled: false,
        loading: false,
        isLoggedIn: false,
        // 等级权益数据
        levels: [],
        benefitDefs: [],
        benefitTableRows: [],
        currentLevelId: null,
        // 微信支付是否就绪（真实扣款）
        wechatPayConfigured: false,
        // 模拟支付仅演示环境放开，生产环境微信支付就绪后为 false
        simulatedPayEnabled: false,
        // 在线购买入口是否可用：真实支付就绪 或 允许模拟支付
        purchaseEnabled: false,
        // 会员状态
        status: null,
        expiringSoon: false,
        // 购买流程
        selectedLevel: null,
        selectedPrice: null,
        paymentAmount: 0,
        showPaymentConfirm: false,
        paying: false,
        purchaseError: '',
        successMessage: '',
        showSuccess: false,
        isRenewalSuccess: false,
        // 兑换码
        redeemCode: '',
        redeeming: false,
        redeemResult: '',
        redeemSuccess: false,
    },
    // 付费漏斗：定价页曝光每次进页面只记一次（onShow 会因弹窗、后台切换等反复触发）
    _pricingTracked: false,
    onShow() {
        this._syncTheme();
        if (!this._pricingTracked) {
            this._pricingTracked = true;
            trackEvent('pricing_page_view');
        }
        this.checkLogin();
    },
    checkLogin() {
        const token = app.globalData.token;
        this.setData({ isLoggedIn: !!token });
        this.loadData();
    },
    async loadData() {
        this.setData({ loading: true });
        try {
            // 检查会员开关
            const enabledRes = await api.isMembershipEnabled();
            const enabled = enabledRes?.data?.enabled !== false;
            if (!enabled) {
                this.setData({ disabled: true, loading: false });
                return;
            }
            // 并行加载等级和状态
            const [levelsRes, statusRes] = await Promise.all([
                api.getMembershipLevels(),
                this.data.isLoggedIn ? api.getMembershipStatus().catch(() => null) : Promise.resolve(null),
            ]);
            const benefitDefs = levelsRes?.data?.benefitDefs || [];
            const levels = (levelsRes?.data?.levels || []).map((l) => ({
                ...l,
                benefitList: this.parseBenefits(l.benefits, benefitDefs),
            }));
            const currentLevelId = levelsRes?.data?.currentLevelId || null;
            // 预计算权益对比表格数据（WXML 不支持函数调用）
            const benefitTableRows = benefitDefs.map((def) => ({
                def,
                cells: levels.map((l) => {
                    const raw = l.benefits[def.code];
                    const val = raw !== undefined ? raw : def.defaultValue;
                    return this.formatBenefitValue(def, val);
                }),
            }));
            // 微信支付是否就绪：决定用真实支付还是模拟支付
            const wechatPayConfigured = !!levelsRes?.data?.wechatPayConfigured;
            // 模拟支付仅在后端显式放开时才可用（生产环境微信支付就绪后为 false）
            const simulatedPayEnabled = levelsRes?.data?.simulatedPayEnabled === true;
            // 在线购买是否可用：真实支付就绪 或 允许模拟支付，任一成立即可购买
            const purchaseEnabled = wechatPayConfigured || simulatedPayEnabled;
            const graceDays = levelsRes?.data?.graceDays || 0;
            const remindDays = levelsRes?.data?.remindDays || 7;
            let status = null;
            let expiringSoon = false;
            if (statusRes?.data) {
                const st = statusRes.data;
                const daysLeft = st.daysLeft;
                expiringSoon = st.isPaid && daysLeft != null && daysLeft <= remindDays && !st.inGrace;
                status = {
                    ...st,
                    expireAtFormatted: st.expireAt ? util.formatDate(st.expireAt) : '',
                    daysLeft,
                    inGrace: !!st.inGrace,
                    graceDays: st.graceDays || graceDays,
                    remindDays,
                    pendingLevelName: st.pendingLevelName || null,
                };
                if (status.quotas) {
                    status.quotas = status.quotas.map((q) => {
                        const usedPercent = q.limit > 0 ? Math.min(100, Math.round((q.used || 0) / q.limit * 100)) : 0;
                        const exhausted = q.limit > 0 && q.remaining <= 0;
                        return {
                            ...q,
                            usedPercent,
                            unlimited: q.limit < 0,
                            exhausted,
                            // WXML 不支持 Math.max，进度条宽度/颜色在此预计算
                            fillPct: usedPercent > 0 ? Math.max(usedPercent, 6) : 0,
                            fillColor: exhausted ? '#f59e0b' : usedPercent > 80 ? '#fb923c' : '#6c63ff',
                        };
                    });
                }
            }
            this.setData({
                levels, benefitDefs, currentLevelId, simulatedPayEnabled,
                wechatPayConfigured, purchaseEnabled,
                status, expiringSoon, benefitTableRows, loading: false,
            });
        }
        catch (err) {
            console.error('加载会员数据失败:', err);
            util.showToast('加载失败');
            this.setData({ loading: false });
        }
    },
    /** 将等级的 benefits 与 benefitDefs 匹配，转为结构化列表 */
    parseBenefits(benefits, defs) {
        if (!benefits || !defs)
            return [];
        return defs.map((def) => {
            const raw = benefits[def.code];
            const val = raw !== undefined ? raw : def.defaultValue;
            return {
                code: def.code,
                name: def.name,
                type: def.type || 'boolean',
                value: val,
                unit: def.unit || '',
                periodType: def.periodType || 'none',
                category: def.category || '',
                description: def.description || '',
            };
        });
    },
    /** 格式化权益值用于表格展示 */
    formatBenefitValue(def, value) {
        if (def.type === 'boolean') {
            const ok = value === true;
            return { text: ok ? '✓' : '—', ok };
        }
        if (def.type === 'quota') {
            const n = Number(value);
            const period = def.periodType === 'daily' ? '/天' : def.periodType === 'monthly' ? '/月' : '';
            if (n < 0)
                return { text: '不限', ok: true };
            return { text: `${n}${def.unit || '次'}${period}`, ok: n > 0 };
        }
        if (value == null)
            return { text: String(def.defaultValue ?? '—'), ok: true };
        return { text: String(value), ok: true };
    },
    /** 打开购买弹窗（从表格底部按钮触发） */
    onOpenPurchase(e) {
        const level = e.currentTarget.dataset.level;
        if (!level || level.isFree || level.prices.length === 0)
            return;
        this.setData({
            selectedLevel: level,
            selectedPrice: level.prices[0] || null,
            paymentAmount: level.prices[0]?.price || 0,
            purchaseError: '',
        });
    },
    /** 购买弹窗中选择价格方案 */
    onModalPriceSelect(e) {
        const price = e.currentTarget.dataset.price;
        this.setData({
            selectedPrice: price,
            paymentAmount: price.price,
            purchaseError: '',
        });
    },
    /** 关闭购买弹窗 */
    onCloseModal() {
        this.setData({
            selectedLevel: null,
            selectedPrice: null,
            paymentAmount: 0,
            showPaymentConfirm: false,
            purchaseError: '',
        });
    },
    /** 确认支付 */
    async onConfirmPay() {
        const level = this.data.selectedLevel;
        const price = this.data.selectedPrice;
        if (!level || !price)
            return;
        trackEvent('purchase_start', {
            plan: level.id,
            levelName: level.name,
            priceId: price.id,
            price: price.price,
            durationDays: price.durationDays || 0,
        });
        this.setData({ paying: true, purchaseError: '' });
        try {
            const orderRes = await api.createMembershipOrder(level.id, price.id);
            const order = orderRes?.data;
            if (!order || !order.id) {
                throw new Error('创建订单失败');
            }
            // 优先使用真实微信支付（小程序 JSAPI）
            const payRes = await api.createJSAPIPayOrder(order.id);
            const payData = payRes?.data;
            if (!payData || !payData.timeStamp) {
                throw new Error('微信支付下单失败');
            }
            // 调起微信支付面板；用户主动取消不算失败，订单保持待支付可稍后继续
            await this._requestWeChatPayment(payData);
            // 支付面板返回成功即认为支付完成，会员由微信回调异步激活
            this._handlePaymentSuccess(level, price, order, 'new');
        }
        catch (err) {
            const canceled = err?.canceled;
            this.setData({
                purchaseError: canceled ? '' : (err.message || '支付失败'),
                paying: false,
            });
            if (!canceled) {
                console.error('[Membership] 支付失败:', err?.message || err);
            }
        }
    },
    /** 调用小程序微信支付 (wx.requestPayment) */
    _requestWeChatPayment(payData) {
        return new Promise((resolve, reject) => {
            wx.requestPayment({
                timeStamp: payData.timeStamp,
                nonceStr: payData.nonceStr,
                package: payData.package,
                signType: payData.signType || 'RSA',
                paySign: payData.paySign,
                success: () => resolve(),
                fail: (err) => {
                    const errMsg = err?.errMsg || '';
                    // 用户主动取消支付不是错误
                    if (errMsg.includes('cancel')) {
                        const canceledErr = new Error('已取消支付');
                        canceledErr.canceled = true;
                        reject(canceledErr);
                        return;
                    }
                    reject(new Error(err?.errDesc || '支付失败'));
                },
            });
        });
    },
    /** 处理支付成功 */
    _handlePaymentSuccess(level, price, order, mode) {
        const levelName = level.name;
        const endTime = order.expireAt ? order.expireAt.slice(0, 10) : '';
        const creditedDays = order.creditedDays || 0;
        let msg = mode === 'renew' ? '续费成功' : '开通成功';
        msg += `：${levelName}`;
        if (creditedDays > 0)
            msg += `（原等级折算抵扣 ${creditedDays} 天）`;
        msg += endTime ? `，有效期至 ${endTime}` : '，永久有效';
        this.setData({
            selectedLevel: null,
            selectedPrice: null,
            paymentAmount: 0,
            showPaymentConfirm: false,
            paying: false,
            showSuccess: true,
            successMessage: '🎉 ' + msg,
            isRenewalSuccess: mode === 'renew',
        });
        trackEvent('purchase_success', {
            plan: level.id,
            levelName: levelName,
            priceId: price.id,
            price: price.price,
            mode,
            creditedDays,
        });
        this.loadData();
    },
    /** 显示支付确认弹窗 */
    onPurchase() {
        if (!this.data.selectedLevel || !this.data.selectedPrice) {
            util.showToast('请选择会员等级和价格方案');
            return;
        }
        this.setData({
            showPaymentConfirm: true,
            purchaseError: '',
        });
    },
    onCancelPay() {
        const level = this.data.selectedLevel;
        const price = this.data.selectedPrice;
        if (level && price) {
            // 只在用户真的选了方案后取消时记录，漏斗里才有意义
            trackEvent('purchase_cancel', {
                plan: level.id,
                priceId: price.id,
                price: price.price,
            });
        }
        this.setData({ showPaymentConfirm: false, paying: false });
    },
    onHideSuccess() {
        this.setData({ showSuccess: false, successMessage: '' });
    },
    // ===== 兑换码 =====
    onRedeemInput(e) {
        this.setData({ redeemCode: e.detail.value.toUpperCase(), redeemResult: '', redeemSuccess: false });
    },
    async onRedeem() {
        const code = this.data.redeemCode.trim();
        if (!code) {
            util.showToast('请输入兑换码');
            return;
        }
        this.setData({ redeeming: true, redeemResult: '', redeemSuccess: false });
        try {
            const res = await api.redeemMembershipCode(code);
            if (res?.data) {
                const result = res.data;
                const expireAt = result.expireAt ? util.formatDate(result.expireAt) : '';
                this.setData({
                    redeemResult: `✅ 兑换成功！${result.levelName || ''}${result.days ? ' ' + result.days + '天' : ''}${expireAt ? '，有效期至 ' + expireAt : ''}`,
                    redeemSuccess: true,
                    redeeming: false,
                    redeemCode: '',
                });
                trackEvent('redeem', { levelName: result.levelName || '', days: result.days || 0 });
                this.loadData();
            }
        }
        catch (err) {
            this.setData({
                redeemResult: `❌ ${err.message || '兑换失败'}`,
                redeemSuccess: false,
                redeeming: false,
            });
        }
    },
    onViewOrders() {
        wx.navigateTo({ url: '/pages/membership-orders/membership-orders' });
    },
    goToLogin() {
        wx.navigateTo({ url: '/pages/login/login' });
    },
    stopPropagation() { },
});

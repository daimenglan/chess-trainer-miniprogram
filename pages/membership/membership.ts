/**
 * 会员中心页 - 等级权益对比、购买、兑换码
 * 参照网页版 MembershiPage.tsx 完善
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({

  /** 同步主题 */
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    disabled: false,
    loading: false,
    isLoggedIn: false,

    // 等级权益数据
    levels: [] as any[],
    benefitDefs: [] as any[],
    benefitTableRows: [] as any[],
    currentLevelId: null as number | null,
    simulatedPayEnabled: true,

    // 会员状态
    status: null as any,
    expiringSoon: false,

    // 购买流程
    selectedLevel: null as any,
    selectedPrice: null as any,
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

  onShow() {
    this._syncTheme();
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
      const levels = (levelsRes?.data?.levels || []).map((l: any) => ({
        ...l,
        benefitList: this.parseBenefits(l.benefits, benefitDefs),
      }));
      const currentLevelId = levelsRes?.data?.currentLevelId || null;

      // 预计算权益对比表格数据（WXML 不支持函数调用）
      const benefitTableRows = benefitDefs.map((def: any) => ({
        def,
        cells: levels.map((l: any) => {
          const raw = l.benefits[def.code];
          const val = raw !== undefined ? raw : def.defaultValue;
          return this.formatBenefitValue(def, val);
        }),
      }));
      const simulatedPayEnabled = levelsRes?.data?.simulatedPayEnabled !== false;
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
          status.quotas = status.quotas.map((q: any) => {
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
        status, expiringSoon, benefitTableRows, loading: false,
      });
    } catch (err: any) {
      console.error('加载会员数据失败:', err);
      util.showToast('加载失败');
      this.setData({ loading: false });
    }
  },

  /** 将等级的 benefits 与 benefitDefs 匹配，转为结构化列表 */
  parseBenefits(benefits: any, defs: any[]): any[] {
    if (!benefits || !defs) return [];
    return defs.map((def: any) => {
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
  formatBenefitValue(def: any, value: any): { text: string; ok: boolean } {
    if (def.type === 'boolean') {
      const ok = value === true;
      return { text: ok ? '✓' : '—', ok };
    }
    if (def.type === 'quota') {
      const n = Number(value);
      const period = def.periodType === 'daily' ? '/天' : def.periodType === 'monthly' ? '/月' : '';
      if (n < 0) return { text: '不限', ok: true };
      return { text: `${n}${def.unit || '次'}${period}`, ok: n > 0 };
    }
    if (value == null) return { text: String(def.defaultValue ?? '—'), ok: true };
    return { text: String(value), ok: true };
  },

  /** 打开购买弹窗（从表格底部按钮触发） */
  onOpenPurchase(e: any) {
    const level = e.currentTarget.dataset.level;
    if (!level || level.isFree || level.prices.length === 0) return;
    this.setData({
      selectedLevel: level,
      selectedPrice: level.prices[0] || null,
      paymentAmount: level.prices[0]?.price || 0,
      purchaseError: '',
    });
  },

  /** 购买弹窗中选择价格方案 */
  onModalPriceSelect(e: any) {
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
    if (!level || !price) return;

    this.setData({ paying: true, purchaseError: '' });
    try {
      const orderRes = await api.createMembershipOrder(level.id, price.id);
      const order = orderRes?.data;
      if (!order || !order.id) {
        throw new Error('创建订单失败');
      }

      // 模拟支付
      const payRes = await api.payMembershipOrder(order.id);
      if (payRes?.data) {
        const membership = payRes.data.membership || payRes.data;
        const mode = membership.mode || 'new';
        const levelName = membership.levelName || level.name;
        const endTime = membership.endTime || membership.expireAt;
        const creditedDays = membership.creditedDays || 0;
        let msg = mode === 'renew' ? '续费成功' : '开通成功';
        msg += `：${levelName}`;
        if (creditedDays > 0) msg += `（原等级折算抵扣 ${creditedDays} 天）`;
        msg += endTime ? `，有效期至 ${endTime.slice(0, 10)}` : '，永久有效';
        msg += `（${price.durationDays} 天方案，模拟支付）`;

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
        // 刷新数据
        this.loadData();
      }
    } catch (err: any) {
      this.setData({
        purchaseError: err.message || '支付失败',
        paying: false,
      });
    }
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
    this.setData({ showPaymentConfirm: false, paying: false });
  },

  onHideSuccess() {
    this.setData({ showSuccess: false, successMessage: '' });
  },

  // ===== 兑换码 =====
  onRedeemInput(e: any) {
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
        this.loadData();
      }
    } catch (err: any) {
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

  stopPropagation() {},
});
export {}
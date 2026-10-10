"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 支付结果页 — 竖屏模式
 *
 * 四态：loading | success | failed | timeout
 * 轮询微信支付订单状态。
 */
const api = require('../../utils/api');
Page({
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme)
                this.setData({ __theme__: theme });
        }
        catch (e) { /* non-critical */ }
    },
    _pollTimer: null,
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        status: 'loading',
        message: '',
        levelName: '',
        expireAt: '',
        orderId: '',
    },
    onReady() { this._syncTheme(); },
    onShow() {
        this._syncTheme();
        const opts = this.options || {};
        const orderId = opts.orderId || '';
        this.setData({ orderId });
        if (!orderId) {
            this.setData({ status: 'failed', message: '缺少订单号' });
            return;
        }
        this._checkOrder();
        this._startPoll();
    },
    onUnload() {
        if (this._pollTimer)
            clearInterval(this._pollTimer);
    },
    _startPoll() {
        let attempts = 0;
        this._pollTimer = setInterval(() => {
            attempts++;
            if (attempts > 40) {
                clearInterval(this._pollTimer);
                this.setData({ status: 'timeout', message: '支付结果确认超时，请返回会员中心查看订单状态' });
                return;
            }
            this._checkOrder();
        }, 3000);
    },
    async _checkOrder() {
        try {
            const res = await api.getWechatPayOrderStatus(this.data.orderId);
            const data = res?.data || res;
            if (data.status === 'paid') {
                this.setData({ status: 'success', message: '支付成功' });
                clearInterval(this._pollTimer);
                // 尝试获取订单详情
                try {
                    const orders = await api.getMyMembershipOrders(1, 5);
                    const orderList = orders?.data?.orders || orders?.orders || [];
                    const order = orderList.find((o) => String(o.id) === String(this.data.orderId));
                    if (order) {
                        this.setData({ levelName: order.levelName || '会员', expireAt: order.paidAt || '' });
                    }
                }
                catch { /* non-critical */ }
            }
            else if (data.status === 'CLOSED' || data.status === 'PAYERROR') {
                this.setData({ status: 'failed', message: data.message || '支付失败' });
                clearInterval(this._pollTimer);
            }
        }
        catch (e) {
            // 继续轮询
        }
    },
    onGoMembership() {
        wx.navigateTo({ url: '/pages/membership/membership' });
    },
    onGoHome() {
        wx.reLaunch({ url: '/pages/choice/choice' });
    },
});

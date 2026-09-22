"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 我的会员订单页
 * 参照网页版完善：字段映射修复 + 取消确认
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
        }
        catch (e) { }
    },
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        orders: [],
        loading: false,
        page: 1,
        limit: 20,
        hasMore: false,
    },
    onShow() {
        this._syncTheme();
        this.setData({ orders: [], page: 1 });
        this.loadOrders();
    },
    async loadOrders() {
        this.setData({ loading: true });
        try {
            const res = await api.getMyMembershipOrders(this.data.page, this.data.limit);
            const items = res?.data?.orders || [];
            const mapped = items.map((o) => ({
                ...o,
                statusLabel: this.getStatusLabel(o.status),
                createdAtFormatted: o.createdAt ? util.formatDate(o.createdAt) : '',
                // 确保字段兼容
                amount: o.amount || 0,
                durationDays: o.durationDays || 0,
                levelName: o.levelName || '会员',
                paymentChannel: o.paymentChannel || '',
                orderIdShort: o.id ? o.id.slice(-10) : '',
            }));
            this.setData({
                orders: this.data.page === 1 ? mapped : [...this.data.orders, ...mapped],
                hasMore: mapped.length >= this.data.limit,
                loading: false,
            });
        }
        catch (err) {
            util.showToast('加载订单失败');
            this.setData({ loading: false });
        }
    },
    getStatusLabel(status) {
        const map = {
            pending: '待支付',
            paid: '已支付',
            completed: '已完成',
            cancelled: '已取消',
            refunded: '已退款',
        };
        return map[status] || status;
    },
    onLoadMore() {
        this.setData({ page: this.data.page + 1 });
        this.loadOrders();
    },
    async onPay(e) {
        const order = e.currentTarget.dataset.order;
        if (!order)
            return;
        try {
            const res = await api.payMembershipOrder(order.id);
            if (res?.data) {
                util.showToast('支付成功', 'success');
                this.setData({ orders: [], page: 1 });
                this.loadOrders();
            }
        }
        catch (err) {
            util.showToast(err.message || '支付失败');
        }
    },
    async onCancel(e) {
        const orderId = e.currentTarget.dataset.orderid;
        if (!orderId)
            return;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '取消订单',
                content: '确定取消该待支付订单？',
                success: (r) => resolve(r.confirm),
            });
        });
        if (!confirmed)
            return;
        try {
            await api.cancelMembershipOrder(orderId);
            util.showToast('已取消', 'success');
            this.setData({ orders: [], page: 1 });
            this.loadOrders();
        }
        catch (err) {
            util.showToast(err.message || '取消失败');
        }
    },
});

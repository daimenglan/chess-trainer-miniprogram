"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 龙币兑换页
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
const { trackEvent } = require('../../utils/analytics');
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        balance: 0,
        configs: [],
        records: [],
        loading: true,
        selectedConfig: null,
        amount: 1,
    },
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
    onShow() {
        this._syncTheme();
        if (!util.requireLogin('龙币兑换')) {
            return;
        }
        this.loadAll();
    },
    async loadAll() {
        this.setData({ loading: true });
        try {
            const [balanceRes, configsRes, recordsRes] = await Promise.all([
                api.getDragonCoinBalance().catch(() => null),
                api.getDragonCoinConfigs().catch(() => null),
                api.getDragonCoinExchangeRecords(1, 10).catch(() => null),
            ]);
            this.setData({
                balance: balanceRes?.data?.balance || balanceRes?.balance || 0,
                configs: configsRes?.data || configsRes || [],
                records: recordsRes?.data || recordsRes || [],
                loading: false,
            });
            if (this.data.configs.length > 0) {
                this.setData({ selectedConfig: this.data.configs[0] });
            }
        }
        catch {
            this.setData({ loading: false });
        }
    },
    onConfigTap(e) {
        const index = e.currentTarget.dataset.index;
        this.setData({ selectedConfig: this.data.configs[index], amount: 1 });
    },
    onAmountChange(e) {
        this.setData({ amount: parseInt(e.detail.value) || 1 });
    },
    onExchange() {
        if (!this.data.selectedConfig)
            return;
        if (this.data.amount < 1) {
            wx.showToast({ title: '数量不能小于1', icon: 'none' });
            return;
        }
        // 用户点了兑换即算发起意图，放在弹窗前，避免「点了又取消」完全无数据
        trackEvent('coin_exchange', {
            amount: this.data.amount,
            config: this.data.selectedConfig.id,
            configName: this.data.selectedConfig.name,
        });
        wx.showModal({
            title: '确认兑换',
            content: `确定兑换 ${this.data.amount} 次 ${this.data.selectedConfig.name}？`,
            success: (res) => {
                if (res.confirm) {
                    api.exchangeDragonCoin(this.data.selectedConfig.id, this.data.amount)
                        .then(() => {
                        wx.showToast({ title: '兑换成功', icon: 'success' });
                        this.loadAll();
                    })
                        .catch((err) => {
                        wx.showToast({ title: err.message || '兑换失败', icon: 'none' });
                    });
                }
            },
        });
    },
    onBack() {
        wx.navigateBack();
    },
});

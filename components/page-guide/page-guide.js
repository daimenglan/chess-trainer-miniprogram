"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 页面新手指引横幅 — 各子功能模块的一级功能引导（同网页版 PageGuide）
 *
 * 每个主要页面在首次访问时展示一个轻量引导横幅，
 * 帮新用户快速了解该页面的功能与作用。用户点击「不再提示」后通过 wx.storage 永久关闭。
 * 仅对注册 7 天内的新用户展示。
 */
const GUIDE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
Component({
    properties: {
        /** storage 键名（按页面区分） */
        storageKey: { type: String, value: '' },
        /** 图标 */
        icon: { type: String, value: '♟' },
        /** 标题 */
        title: { type: String, value: '' },
        /** 描述 */
        desc: { type: String, value: '' },
        /** 提示（可选） */
        hint: { type: String, value: '' },
    },
    data: {
        show: false,
    },
    lifetimes: {
        attached() {
            this._checkShouldShow();
        },
    },
    methods: {
        _checkShouldShow() {
            const app = getApp();
            const user = app.globalData?.user;
            if (!user || !user.userId)
                return;
            // 仅对注册 7 天内的新用户展示
            const createdAt = user.createdAt;
            if (!createdAt)
                return;
            const regMs = this._parseRegistrationMs(createdAt);
            if (Number.isNaN(regMs) || Date.now() - regMs >= GUIDE_WINDOW_MS)
                return;
            const dismissed = wx.getStorageSync(`${this.data.storageKey}_${user.userId}`);
            if (dismissed === '1')
                return;
            // 延迟一帧再显示，避免与页面动画冲突
            setTimeout(() => this.setData({ show: true }), 300);
        },
        _parseRegistrationMs(value) {
            const iso = Date.parse(value);
            if (!Number.isNaN(iso))
                return iso;
            return Date.parse(`${value.replace(' ', 'T')}Z`);
        },
        onDismiss() {
            const app = getApp();
            const user = app.globalData?.user;
            if (user && user.userId) {
                wx.setStorage({ key: `${this.data.storageKey}_${user.userId}`, data: '1' });
            }
            this.setData({ show: false });
        },
    },
});
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 协议页 - 用户服务协议 / 隐私政策
 * 参数：doc = 'service' | 'privacy'（默认展示服务协议）
 */
Page({
    data: {
        doc: 'service',
    },
    onLoad(options) {
        const doc = options?.doc === 'privacy' ? 'privacy' : 'service';
        this.setData({ doc });
        wx.setNavigationBarTitle({
            title: doc === 'privacy' ? '隐私政策' : '用户服务协议',
        });
    },
});

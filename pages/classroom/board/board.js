"use strict";
/**
 * 教室棋盘页
 */
Object.defineProperty(exports, "__esModule", { value: true });
Page({
    data: {
        __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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
        // 本页不调任何接口：只是重置/展示本地 FEN 的棋盘演示，游客可直接使用，无需登录
    },
    onResetBoard() {
        this.setData({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
    },
    onBack() {
        wx.navigateBack();
    },
});

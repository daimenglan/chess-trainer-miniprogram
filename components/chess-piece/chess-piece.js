"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 单个棋子组件 - type="2d" 同层渲染 Canvas 绘制 Cburnett 风格棋子
 * 用于升变对话框 / 被吃子面板等少量棋子场景
 * （棋盘主体棋子由 chess-board 的单块 Canvas 绘制）
 * 绘制实现见 utils/pieceArt
 */
const pieceArt = require('../../utils/pieceArt');
Component({
    properties: {
        piece: {
            type: String,
            value: '',
        },
        color: {
            type: String,
            value: 'w',
        },
        size: {
            type: Number,
            value: 60,
        },
    },
    data: {
        piecePx: 48,
    },
    observers: {
        'piece,color,size': function () {
            this.drawPiece();
        },
    },
    methods: {
        drawPiece() {
            const piece = this.properties.piece;
            if (!piece)
                return;
            if (!pieceArt.PIECE_DEFINITIONS[piece])
                return;
            const px = Math.max(8, Math.round(this.properties.size || 48));
            if (this.data.piecePx !== px) {
                this.setData({ piecePx: px }, () => {
                    setTimeout(() => this.drawPiece(), 50);
                });
                return;
            }
            this.createSelectorQuery()
                .select('#pieceCanvas')
                .fields({ node: true, size: true })
                .exec((res) => {
                const entry = res && res[0];
                if (!entry || !entry.node || Math.abs((entry.width || 0) - px) > 1) {
                    // 节点尚未就绪或布局未应用，稍后重试
                    setTimeout(() => this.drawPiece(), 100);
                    return;
                }
                const canvas = entry.node;
                const winInfo = wx.getWindowInfo
                    ? wx.getWindowInfo()
                    : wx.getSystemInfoSync();
                const dpr = winInfo.pixelRatio || 2;
                const ctx = canvas.getContext('2d');
                canvas.width = Math.floor(px * dpr);
                canvas.height = Math.floor(px * dpr);
                ctx.scale(dpr, dpr);
                ctx.clearRect(0, 0, px, px);
                pieceArt.drawPiecePaths(ctx, piece, 0, 0, px);
            });
        },
    },
    lifetimes: {
        attached() {
            const piece = this.properties.piece;
            if (piece) {
                setTimeout(() => this.drawPiece(), 50);
            }
        },
    },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 兵升变选择弹窗
 */
Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
        },
        color: {
            type: String,
            value: 'w',
        },
    },
    data: {
        // WXML 不支持 toUpperCase，棋子代码在 JS 侧按颜色预计算
        pieces: [
            { type: 'q', label: '后', whiteCode: 'Q', blackCode: 'q' },
            { type: 'r', label: '车', whiteCode: 'R', blackCode: 'r' },
            { type: 'b', label: '象', whiteCode: 'B', blackCode: 'b' },
            { type: 'n', label: '马', whiteCode: 'N', blackCode: 'n' },
        ],
    },
    methods: {
        onSelect(e) {
            const type = e.currentTarget.dataset.type;
            this.triggerEvent('select', { type });
        },
        onCancel() {
            this.triggerEvent('cancel');
        },
        // 阻止事件冒泡（内层卡片 catchtap 配套的空处理器）
        stopPropagation() { },
    },
});

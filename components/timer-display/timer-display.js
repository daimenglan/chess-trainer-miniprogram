"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 计时器显示组件
 */
Component({
    properties: {
        timeControlMode: {
            type: String,
            value: 'none',
        },
        whiteTime: {
            type: Number,
            value: 600,
        },
        blackTime: {
            type: Number,
            value: 600,
        },
        activeSide: {
            type: String,
            value: '',
        },
        gameStarted: {
            type: Boolean,
            value: false,
        },
        playerSide: {
            type: String,
            value: 'white',
        },
    },
    data: {
        formattedWhite: '10:00',
        formattedBlack: '10:00',
        whiteLow: false,
        blackLow: false,
    },
    observers: {
        'whiteTime': function (time) {
            this.setData({
                formattedWhite: this.formatTime(time),
                whiteLow: time > 0 && time <= 30,
            });
        },
        'blackTime': function (time) {
            this.setData({
                formattedBlack: this.formatTime(time),
                blackLow: time > 0 && time <= 30,
            });
        },
    },
    methods: {
        formatTime(seconds) {
            if (seconds <= 0)
                return '00:00';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        },
    },
});

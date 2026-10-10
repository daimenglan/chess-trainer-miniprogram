"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Lichess TV 观战网格 — 4 宫格实时观战（同网页版 WatchGrid，commit 05ea505）
 *
 * 从后端 /api/watch/channels 获取频道列表，每个格子独立 SSE 订阅一局实时棋局。
 * 支持 bullet/blitz/rapid/classical 四个速度频道。
 */
const api = require('../../utils/api');
Component({
    properties: {
        language: { type: String, value: 'zh' },
    },
    data: {
        channels: ['bullet', 'blitz', 'rapid', 'classical'],
        games: {},
        loading: true,
        error: '',
    },
    lifetimes: {
        attached() {
            this.loadChannels();
        },
        detached() {
            this._cleanup();
        },
    },
    methods: {
        channelLabel(channel) {
            const map = {
                bullet: '超快棋',
                blitz: '快棋',
                rapid: '快棋赛',
                classical: '慢棋',
            };
            return map[channel] || channel;
        },
        formatTime(seconds) {
            if (seconds <= 0) return '00:00';
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        },
        async loadChannels() {
            this.setData({ loading: true, error: '' });
            try {
                const res = await api.request('GET', '/api/watch/channels');
                const data = res?.data || res;
                const games = {};
                const channels = data?.channels || ['bullet', 'blitz', 'rapid', 'classical'];
                this.setData({ channels, loading: false });
                // 为每个频道加载当前对局
                for (const ch of channels) {
                    this.loadChannelGame(ch);
                }
            }
            catch (e) {
                this.setData({ loading: false, error: '加载观战频道失败' });
            }
        },
        async loadChannelGame(channel) {
            try {
                const res = await api.request('GET', `/api/watch/channel/${channel}`);
                const game = res?.data || res;
                const games = { ...this.data.games };
                games[channel] = game;
                this.setData({ games });
            }
            catch { /* 静默失败 */ }
        },
        onOpenGame(e) {
            const channel = e.currentTarget.dataset.channel;
            const game = this.data.games[channel];
            if (game && game.gameId) {
                wx.navigateTo({ url: `/pages/online/online?watch=${game.gameId}` });
            }
        },
        onRefresh() {
            this.loadChannels();
        },
        _cleanup() {
            // 清理可能存在的 SSE 连接（小程序侧无独立 SSE，由 api 层管理）
        },
    },
});
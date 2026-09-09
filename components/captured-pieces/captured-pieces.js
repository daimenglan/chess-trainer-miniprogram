"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 被吃棋子显示组件
 */
Component({
    properties: {
        side: {
            type: String,
            value: 'top', // 'top' = 黑方吃的（白子）, 'bottom' = 白方吃的（黑子）
        },
        fen: {
            type: String,
            value: '',
            observer: 'computeCaptured',
        },
    },
    data: {
        pieces: [],
        visible: false,
    },
    methods: {
        computeCaptured(fen) {
            if (!fen) {
                this.setData({ pieces: [], visible: false });
                return;
            }
            try {
                const Chess = require('../../utils/chessjs');
                const chess = new Chess.Chess(fen);
                const initial = {
                    K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8,
                    k: 1, q: 1, r: 2, b: 2, n: 2, p: 8,
                };
                const current = {};
                const board = chess.board();
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = board[r][c];
                        if (p) {
                            const key = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
                            current[key] = (current[key] || 0) + 1;
                        }
                    }
                }
                const captured = [];
                const isTop = this.properties.side === 'top';
                const prefix = isTop ? 'KQRBNP' : 'kqrbnp';
                const order = isTop ? ['Q', 'R', 'B', 'N', 'P'] : ['q', 'r', 'b', 'n', 'p'];
                for (const key of order) {
                    const initialCount = initial[key] || 0;
                    const currentCount = current[key] || 0;
                    const diff = initialCount - currentCount;
                    if (diff > 0) {
                        captured.push({ type: key, count: diff });
                    }
                }
                this.setData({
                    pieces: captured,
                    visible: captured.length > 0,
                });
            }
            catch (e) {
                this.setData({ pieces: [], visible: false });
            }
        },
    },
});

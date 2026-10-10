"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 棋盘组件
 * 参考图风格：蓝色深格 + 白色浅格，Unicode 棋子，四周坐标标签
 * 匹配参考实现：Cburnett SVG 棋子 + 候选走法标记 + 合法走法提示
 */
const Chess = require('../../utils/chessjs');
const app = getApp();
const util = require('../../utils/util');
const api = require('../../utils/api');
const chessNotation = require('../../utils/chessNotation');
const pieceArt = require('../../utils/pieceArt');
const FILES = 'abcdefgh';
const RANKS = '87654321';
// 参考图配色：蓝色深格 + 白色浅格
const BOARD_COLORS = {
    wood: { light: '#f0d9b5', dark: '#b58863' },
    standard: { light: '#ffffff', dark: '#a0a0a0' },
    classic: { light: '#ffffff', dark: '#000000' },
    green: { light: '#e8f5e9', dark: '#a5d6a7' },
    blue: { light: '#e3f2fd', dark: '#90caf9' },
    dark: { light: '#779952', dark: '#446633' },
    blueWhite: { light: '#ffffff', dark: '#5a7d9a' },
};
// 候选走法标记颜色
const RANK_COLORS = {
    1: '#2563eb', // 蓝
    2: '#ea580c', // 橙
    3: '#64748b', // 灰蓝
};
Component({
    properties: {
        fen: {
            type: String,
            value: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            observer: function (fen) {
                if (fen) {
                    this.renderBoard(fen);
                    this.findKingSquare(fen);
                }
            },
        },
        lastMoveFrom: { type: String, value: '' },
        lastMoveTo: { type: String, value: '' },
        isCheck: { type: Boolean, value: false },
        selectedSquare: { type: String, value: '' },
        legalMoves: { type: Array, value: [] },
        interactive: { type: Boolean, value: true },
        flipped: { type: Boolean, value: false },
        showHints: { type: Boolean, value: false },
        boardColorPreset: { type: String, value: 'blueWhite' },
        analysis: { type: Array, value: [] },
        explorationMode: { type: String, value: '' },
        moveHistory: { type: Array, value: [] },
        replayIndex: { type: Number, value: -1 },
        isReplay: { type: Boolean, value: false },
        boardHeight: { type: Number, value: 0 },
        /** 坐标标签模式：outside（默认）| inline（内嵌在边线格子角上） */
        labelVariant: { type: String, value: 'outside' },
        canvasHidden: { type: Boolean, value: false,
            observer: function (hidden) {
                if (!hidden) {
                    // wx:if 移除后重新加入 DOM，需要重新获取 canvas 节点并重绘
                    // 延迟确保布局已应用
                    setTimeout(() => this.schedulePiecesDraw(), 200);
                }
            },
        },
    },
    data: {
        squares: [],
        lastMoveSquares: [],
        kingSquare: null,
        candidateMap: {},
        candidateArrows: [],
        boardSize: 600,
        squareSize: 75,
        colors: BOARD_COLORS.blueWhite,
        canvasReady: false,
        canvasW: 0,
        canvasH: 0,
        // 坐标标签
        fileLabels: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        rankLabels: ['8', '7', '6', '5', '4', '3', '2', '1'],
    },
    observers: {
        'analysis': function (analysis) {
            this.updateCandidates(analysis);
        },
        'flipped': function () {
            this.renderBoard(this.properties.fen);
        },
        'boardColorPreset': function (preset) {
            const colors = BOARD_COLORS[preset] || BOARD_COLORS.blueWhite;
            this.setData({ colors });
        },
        'moveHistory, replayIndex': function (history) {
            this.updateLastMoves(history);
        },
        'lastMoveFrom, lastMoveTo': function (from, to) {
            this.setData({ lastMoveSquares: from && to ? [from, to] : [] });
        },
        'lastMoveSquares': function () {
            this.schedulePiecesDraw();
        },
        'candidateMap': function () {
            this.renderBoard(this.properties.fen);
        },
        'showHints': function (showHints) {
            // 提示开关变化时重新构建候选并重绘
            if (showHints) {
                this.updateCandidates(this.properties.analysis);
            }
            else {
                this.setData({ candidateMap: {}, candidateArrows: [] });
            }
            this.schedulePiecesDraw();
        },
        'candidateArrows': function () {
            this.schedulePiecesDraw();
        },
        'selectedSquare, legalMoves': function () {
            this.renderBoard(this.properties.fen);
        },
    },
    methods: {
        parseFen(fen) {
            try {
                const Chess = require('../../utils/chessjs');
                return new Chess.Chess(fen);
            }
            catch (e) {
                return null;
            }
        },
        renderBoard(fen) {
            const Chess = require('../../utils/chessjs');
            const chess = new Chess.Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            const board = chess.board();
            const rows = [];
            const flipped = this.properties.flipped;
            const lastMoveSquares = this.data.lastMoveSquares;
            const selectedSquare = this.properties.selectedSquare;
            const legalMoves = this.properties.legalMoves || [];
            const candidateMap = this.data.candidateMap || {};
            for (let rank = 0; rank < 8; rank++) {
                const row = [];
                for (let file = 0; file < 8; file++) {
                    const displayRank = flipped ? 7 - rank : rank;
                    const displayFile = flipped ? 7 - file : file;
                    const sq = `${FILES[displayFile]}${RANKS[displayRank]}`;
                    const piece = board[displayRank][displayFile];
                    const isLight = (displayFile + displayRank) % 2 === 0;
                    const sqStr = sq;
                    const hasPiece = !!piece;
                    const isLastMove = lastMoveSquares.indexOf(sqStr) !== -1;
                    const isSelected = selectedSquare === sqStr;
                    const isLegal = legalMoves.indexOf(sqStr) !== -1;
                    const hasCandidate = !!candidateMap[sqStr];
                    const pieceChar = piece ? `${piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()}` : '';
                    const pieceColor = piece ? (piece.color === 'w' ? 'w' : 'b') : 'w';
                    row.push({
                        square: sqStr,
                        piece: pieceChar,
                        pieceColor: pieceColor,
                        isLight: isLight,
                        hasPiece: hasPiece,
                        isLastMove: isLastMove,
                        isSelected: isSelected,
                        isLegal: isLegal,
                        hasCandidate: hasCandidate,
                        // 与参考实现一致：候选标记与合法目标互斥，选中后标记让位于走子点击
                        showLegalDot: isLegal && !hasPiece,
                        showCaptureRing: isLegal && hasPiece,
                        showCandidateBadge: hasCandidate && !isLegal,
                    });
                }
                rows.push(row);
            }
            this.setData({ squares: rows });
            this.schedulePiecesDraw();
        },
        findKingSquare(fen, turnColor) {
            try {
                const Chess = require('../../utils/chessjs');
                const chess = new Chess.Chess(fen);
                const board = chess.board();
                const kingColor = turnColor === 'w' ? 'w' : 'b';
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = board[r][c];
                        if (p && p.type === 'k' && p.color === kingColor) {
                            this.setData({ kingSquare: `${FILES[c]}${RANKS[r]}` });
                            return;
                        }
                    }
                }
                this.setData({ kingSquare: '' });
            }
            catch {
                this.setData({ kingSquare: '' });
            }
        },
        updateLastMoves(moveHistory) {
            if (!moveHistory || moveHistory.length === 0) {
                this.setData({ lastMoveSquares: [] });
                return;
            }
            const replayIndex = this.properties.replayIndex;
            const last = replayIndex >= 0 && replayIndex < moveHistory.length
                ? moveHistory[replayIndex]
                : moveHistory[moveHistory.length - 1];
            if (last) {
                this.setData({ lastMoveSquares: [last.from, last.to] });
            }
        },
        updateCandidates(analysis) {
            if (!analysis || !this.properties.showHints) {
                this.setData({ candidateMap: {}, candidateArrows: [] });
                return;
            }
            const map = {};
            const arrows = [];
            const fen = this.getFen();
            analysis.forEach((c, i) => {
                if (i >= 3)
                    return;
                const to = c.uci.slice(2, 4);
                if (!to || map[to])
                    return;
                const { pieceName, san } = chessNotation.describeMove(fen, c.uci);
                const sanNote = san.includes('-') ? '' : `（${san}）`;
                map[to] = {
                    rank: i + 1,
                    score: c.score,
                    label: `${pieceName} ${c.uci.slice(0, 2)}→${to}${sanNote}`,
                    pros: c.pros || [],
                    cons: c.cons || [],
                    tactics: c.tactics || [],
                };
                // 构建提示箭头（从→到）
                arrows.push({
                    from: c.uci.slice(0, 2),
                    to: to,
                    rank: i + 1,
                });
            });
            this.setData({ candidateMap: map, candidateArrows: arrows });
        },
        getFen() {
            return this.properties.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        },
        onSquareTap(e) {
            if (!this.properties.interactive)
                return;
            const square = e.currentTarget.dataset.square;
            this.triggerEvent('squaretap', { square });
        },
        /**
         * 点击棋盘上的候选走法数字标记，触发滚动到对应提示
         */
        onCandidateBadgeTap(e) {
            const rank = e.currentTarget.dataset.rank;
            this.triggerEvent('scrolltocandidate', { rank });
        },
        drawArrows() {
            this.schedulePiecesDraw();
        },
        /** 防抖：把棋子 + 箭头重绘到全盘 Canvas 上 */
        schedulePiecesDraw() {
            const self = this;
            if (self._piecesDrawTimer) {
                clearTimeout(self._piecesDrawTimer);
            }
            self._piecesDrawTimer = setTimeout(() => {
                self._piecesDrawTimer = null;
                self.drawBoardPieces();
            }, 50);
        },
        /**
         * 在单块 type="2d" 同层渲染 Canvas 上绘制全部棋子 + 最后一步箭头。
         * 新式 Canvas 通过 SelectorQuery 取 node，物理像素 = 逻辑 px × dpr，
         * 绘制前 scale(dpr) 即可继续用逻辑 px 坐标；无需 ctx.draw()。
         * canvas 通过 CSS width:100%/height:100% 填充网格，避免内联尺寸绑定导致的抖动。
         */
        drawBoardPieces() {
            const query = this.createSelectorQuery();
            query.select('.board-grid').boundingClientRect((gridRect) => {
                if (!gridRect || !gridRect.width) {
                    // 尚未就绪，稍后重试
                    setTimeout(() => this.drawBoardPieces(), 150);
                    return;
                }
                this._gridRect = gridRect;
                const w = Math.floor(gridRect.width);
                const h = Math.floor(gridRect.height);
                if (!w || !h)
                    return;
                this.createSelectorQuery()
                    .select('#boardPieces')
                    .fields({ node: true, size: true })
                    .exec((res) => {
                    const entry = res && res[0];
                    if (!entry || !entry.node) {
                        // 节点尚未就绪，稍后重试
                        setTimeout(() => this.drawBoardPieces(), 150);
                        return;
                    }
                    const canvas = entry.node;
                    this._canvasNode = canvas;
                    const winInfo = wx.getWindowInfo
                        ? wx.getWindowInfo()
                        : wx.getSystemInfoSync();
                    const dpr = winInfo.pixelRatio || 2;
                    const ctx = canvas.getContext('2d');
                    // 直接设置 canvas 物理尺寸（不走 setData，避免异步抖动）
                    canvas.width = Math.floor(w * dpr);
                    canvas.height = Math.floor(h * dpr);
                    ctx.scale(dpr, dpr);
                    const sqX = w / 8;
                    const sqY = h / 8;
                    const cell = Math.min(sqX, sqY);
                    // 清空
                    ctx.clearRect(0, 0, w, h);
                    // 棋子（squares 数组顺序即显示顺序，已处理翻转）
                    const squares = this.data.squares || [];
                    for (let r = 0; r < 8; r++) {
                        const row = squares[r];
                        if (!row)
                            continue;
                        for (let f = 0; f < 8; f++) {
                            const s = row[f];
                            if (!s || !s.hasPiece || !s.piece)
                                continue;
                            const x = f * sqX + (sqX - cell) / 2;
                            const y = r * sqY + (sqY - cell) / 2;
                            pieceArt.drawPiecePaths(ctx, s.piece, x, y, cell);
                        }
                    }
                    // 最后一步箭头
                    this.drawArrowOnCanvas(ctx, sqX, sqY, cell);
                    // 提示模式候选走法箭头（从→到，带颜色编码）
                    this.drawHintArrows(ctx, sqX, sqY, cell);
                });
            }).exec();
        },
        /** 最后一步箭头（画在棋子之上）。AI教练关闭时不显示：与网页版一致，此时棋盘不显示任何 AI 提示 */
        drawArrowOnCanvas(ctx, sqX, sqY, cell) {
            if (!this.properties.showHints)
                return;
            const lm = this.data.lastMoveSquares;
            if (!lm || lm.length !== 2)
                return;
            const posOf = (square) => {
                const squares = this.data.squares || [];
                for (let r = 0; r < 8; r++) {
                    const row = squares[r];
                    if (!row)
                        continue;
                    for (let f = 0; f < 8; f++) {
                        if (row[f] && row[f].square === square) {
                            return { x: (f + 0.5) * sqX, y: (r + 0.5) * sqY };
                        }
                    }
                }
                return null;
            };
            const from = posOf(lm[0]);
            const to = posOf(lm[1]);
            if (!from || !to)
                return;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = Math.max(3, cell * 0.07);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // 缩短终点，避免箭头压住棋子中心
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const shorten = cell * 0.35;
            const endX = to.x - shorten * Math.cos(angle);
            const endY = to.y - shorten * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            const arrowLen = cell * 0.22;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - arrowLen * Math.cos(angle - Math.PI / 7), endY - arrowLen * Math.sin(angle - Math.PI / 7));
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - arrowLen * Math.cos(angle + Math.PI / 7), endY - arrowLen * Math.sin(angle + Math.PI / 7));
            ctx.stroke();
        },
        /** 提示模式候选走法箭头（从→到，带颜色编码，画在棋子之上） */
        drawHintArrows(ctx, sqX, sqY, cell) {
            const arrows = this.data.candidateArrows;
            if (!arrows || arrows.length === 0)
                return;
            if (!this.properties.showHints)
                return;
            const rankColors = { 1: '#2563eb', 2: '#ea580c', 3: '#64748b' };
            const posOf = (square) => {
                const squares = this.data.squares || [];
                for (let r = 0; r < 8; r++) {
                    const row = squares[r];
                    if (!row)
                        continue;
                    for (let f = 0; f < 8; f++) {
                        if (row[f] && row[f].square === square) {
                            return { x: (f + 0.5) * sqX, y: (r + 0.5) * sqY };
                        }
                    }
                }
                return null;
            };
            for (const a of arrows) {
                const from = posOf(a.from);
                const to = posOf(a.to);
                if (!from || !to)
                    continue;
                const color = rankColors[a.rank] || '#64748b';
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = Math.max(2.5, cell * 0.06);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = 0.85;
                // 箭头方向
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.hypot(dx, dy);
                if (len === 0)
                    continue;
                const ux = dx / len;
                const uy = dy / len;
                // 起点离开源格中心一点，终点停在目标格中心之前（不遮挡编号圆点）
                const startX = from.x + ux * cell * 0.3;
                const startY = from.y + uy * cell * 0.3;
                const tipX = to.x - ux * cell * 0.3;
                const tipY = to.y - uy * cell * 0.3;
                const baseX = tipX - ux * cell * 0.36;
                const baseY = tipY - uy * cell * 0.36;
                // 线段
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(baseX, baseY);
                ctx.stroke();
                // 箭头三角形
                const px = -uy;
                const py = ux;
                const w = cell * 0.18;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(baseX + px * w, baseY + py * w);
                ctx.lineTo(baseX - px * w, baseY - py * w);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        },
        /** 全盘 Canvas 点击：画布盖在格子层之上会拦截点击，这里换算出格子并复用 squaretap 事件 */
        onCanvasTap(e) {
            if (!this.properties.interactive)
                return;
            // 微信小程序 type="2d" canvas 的 catchtap 事件格式：
            // canvas 相对坐标通过 e.detail {x, y} 提供（单位 px，相对于画布左上角）
            // 或者通过 e.touches[0] 提供 page 坐标
            let x, y;
            const detail = e.detail;
            if (detail && typeof detail.x === 'number') {
                x = detail.x;
                y = detail.y;
            }
            else {
                const touches = e.touches;
                if (!touches || !touches[0])
                    return;
                x = touches[0].x;
                y = touches[0].y;
            }
            const gridRect = this._gridRect;
            if (!gridRect)
                return;
            const cw = gridRect.width;
            const ch = gridRect.height;
            if (!cw || !ch)
                return;
            const col = Math.floor((x / cw) * 8);
            const row = Math.floor((y / ch) * 8);
            if (col < 0 || col > 7 || row < 0 || row > 7)
                return;
            const squares = this.data.squares || [];
            const sq = squares[row] && squares[row][col];
            if (sq && sq.square) {
                this.triggerEvent('squaretap', { square: sq.square });
            }
        },
        getBoardSize() {
            return new Promise((resolve) => {
                const query = this.createSelectorQuery();
                query.select('.board-wrapper').boundingClientRect((rect) => {
                    if (rect) {
                        const size = Math.max(rect.width, 280);
                        this.setData({
                            boardSize: size,
                            squareSize: size / 8,
                        });
                        resolve(size);
                    }
                    else {
                        const sys = wx.getSystemInfoSync();
                        const defaultSize = Math.min(sys.windowWidth * 0.95, 500);
                        this.setData({
                            boardSize: defaultSize,
                            squareSize: defaultSize / 8,
                        });
                        resolve(defaultSize);
                    }
                }).exec();
            });
        },
    },
    lifetimes: {
        attached() {
            const colors = BOARD_COLORS[this.properties.boardColorPreset] || BOARD_COLORS.blueWhite;
            this.setData({ colors });
            this.renderBoard(this.properties.fen);
        },
        ready() {
            this.getBoardSize().then(() => {
                this.setData({ canvasReady: true });
                this.schedulePiecesDraw();
            });
        },
        detached() {
            if (this._piecesDrawTimer) {
                clearTimeout(this._piecesDrawTimer);
                this._piecesDrawTimer = null;
            }
        },
    },
});

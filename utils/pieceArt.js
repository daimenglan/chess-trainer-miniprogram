"use strict";
/**
 * 棋子绘制工具 - Cburnett 风格 SVG 棋子 (viewBox 45x45)
 * 匹配参考实现：../国际象棋陪练/frontend/src/components/Board/ChessPiece.tsx
 * 白棋：#fff 填充 + #000 描边；黑棋：#262626 填充/描边 + #a0a0a0 内部细节
 *
 * 微信小程序无全局 Path2D，且 WXML 不支持 <svg>，
 * 故此处实现纯 Canvas 的 SVG path 手动解析绘制。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIECE_DEFINITIONS = exports.PIECE_VIEWBOX = void 0;
exports.traceSvgPath = traceSvgPath;
exports.drawPiecePaths = drawPiecePaths;
exports.PIECE_VIEWBOX = 45;
exports.PIECE_DEFINITIONS = {
    // ===== 白色棋子 =====
    K: {
        paths: [
            { path: 'M22.5 11.63V6', fill: 'none', stroke: '#000', strokeLinejoin: 'miter' },
            { path: 'M20 8h5', fill: 'none', stroke: '#000', strokeLinejoin: 'miter' },
            { path: 'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5', fill: '#fff', stroke: '#000', strokeLinecap: 'butt', strokeLinejoin: 'miter' },
            { path: 'M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z', fill: '#fff', stroke: '#000' },
            { path: 'M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0', fill: 'none', stroke: '#000' },
        ],
    },
    Q: {
        paths: [
            { path: 'M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z', fill: '#fff', stroke: '#000', strokeLinejoin: 'round' },
            { path: 'M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z', fill: '#fff', stroke: '#000', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z', fill: '#fff', stroke: '#000', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0', fill: 'none', stroke: '#000' },
        ],
    },
    R: {
        paths: [
            { path: 'M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5', fill: '#fff', stroke: '#000', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M34 14l-3 3H14l-3-3', fill: '#fff', stroke: '#000', strokeLinejoin: 'round' },
            { path: 'M31 17v12.5H14V17', fill: '#fff', stroke: '#000', strokeLinecap: 'butt', strokeLinejoin: 'miter' },
            { path: 'M31 29.5l1.5 2.5h-20l1.5-2.5', fill: '#fff', stroke: '#000', strokeLinejoin: 'round' },
            { path: 'M12 35.5h21', fill: 'none', stroke: '#000', strokeLinecap: 'round' },
        ],
    },
    B: {
        paths: [
            { path: 'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z', fill: '#fff', stroke: '#000', strokeLinecap: 'butt' },
            { path: 'M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z', fill: '#fff', stroke: '#000', strokeLinecap: 'butt' },
            { path: 'M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z', fill: '#fff', stroke: '#000', strokeLinecap: 'butt' },
            { path: 'M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5', fill: 'none', stroke: '#000', strokeLinejoin: 'miter' },
        ],
    },
    N: {
        paths: [
            { path: 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21', fill: '#fff', stroke: '#000', strokeLinejoin: 'round' },
            { path: 'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3', fill: '#fff', stroke: '#000', strokeLinejoin: 'round' },
            { path: 'M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zM14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z', fill: '#000', stroke: 'none' },
        ],
    },
    P: {
        paths: [
            { path: 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z', fill: '#fff', stroke: '#000', strokeLinecap: 'round' },
        ],
    },
    // ===== 黑色棋子 =====
    k: {
        paths: [
            { path: 'M22.5 11.63V6M20 8h5', fill: 'none', stroke: '#262626', strokeWidth: 3.5, strokeLinejoin: 'miter' },
            { path: 'M22.5 11.63V6M20 8h5', fill: 'none', stroke: '#a0a0a0', strokeLinejoin: 'miter' },
            { path: 'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt', strokeLinejoin: 'miter' },
            { path: 'M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z', fill: '#262626', stroke: '#262626' },
            { path: 'M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0', fill: 'none', stroke: '#a0a0a0' },
        ],
    },
    q: {
        paths: [
            { path: 'M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z', fill: '#a0a0a0', stroke: '#262626', strokeLinejoin: 'round' },
            { path: 'M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0', fill: 'none', stroke: '#a0a0a0' },
        ],
    },
    r: {
        paths: [
            { path: 'M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt', strokeLinejoin: 'round' },
            { path: 'M34 14l-3 3H14l-3-3', fill: '#262626', stroke: '#262626', strokeLinejoin: 'round' },
            { path: 'M31 17v12.5H14V17', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt', strokeLinejoin: 'miter' },
            { path: 'M31 29.5l1.5 2.5h-20l1.5-2.5', fill: '#262626', stroke: '#262626', strokeLinejoin: 'round' },
            { path: 'M11 14h23', fill: 'none', stroke: '#a0a0a0', strokeLinecap: 'round' },
            { path: 'M12 35.5h21', fill: 'none', stroke: '#a0a0a0', strokeLinecap: 'round' },
        ],
    },
    b: {
        paths: [
            { path: 'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt' },
            { path: 'M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt' },
            { path: 'M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z', fill: '#262626', stroke: '#262626', strokeLinecap: 'butt' },
            { path: 'M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5', fill: 'none', stroke: '#a0a0a0', strokeLinejoin: 'miter' },
        ],
    },
    n: {
        paths: [
            { path: 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21', fill: '#262626', stroke: '#262626', strokeLinejoin: 'round' },
            { path: 'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3', fill: '#262626', stroke: '#262626', strokeLinejoin: 'round' },
            { path: 'M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z', fill: '#a0a0a0', stroke: 'none' },
            { path: 'M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z', fill: '#a0a0a0', stroke: 'none' },
        ],
    },
    p: {
        paths: [
            { path: 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z', fill: '#262626', stroke: '#262626', strokeLinecap: 'round' },
        ],
    },
};
// ===== SVG path 解析与 Canvas 绘制 =====
// 分词：命令字母 或 数字（支持 .5 / -.5 / 1.5 / 1e-3 等格式）
const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
function isNumToken(t) {
    return t.length > 0 && !/[a-zA-Z]/.test(t);
}
/** SVG 椭圆弧 (endpoint parameterization) → ctx.ellipse */
function arcTo(ctx, rx, ry, deg, largeArc, sweep, x2, y2, x1, y1) {
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
        ctx.lineTo(x2, y2);
        return;
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (deg * Math.PI) / 180;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx = (x2 - x1) / 2, dy = (y2 - y1) / 2;
    const x1p = cosP * dx + sinP * dy;
    const y1p = -sinP * dx + cosP * dy;
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }
    const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = denom === 0 ? 0 : Math.sqrt(Math.max(0, numer / denom));
    const sign = largeArc !== sweep ? 1 : -1;
    const cxp = (sign * co * rx * y1p) / ry;
    const cyp = (-sign * co * ry * x1p) / rx;
    const ccx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
    const ccy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
    const angle = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
        if (ux * vy - uy * vx < 0)
            a = -a;
        return a;
    };
    const th1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dth > 0)
        dth -= 2 * Math.PI;
    if (sweep && dth < 0)
        dth += 2 * Math.PI;
    if (typeof ctx.ellipse === 'function') {
        try {
            ctx.ellipse(ccx, ccy, rx, ry, phi, th1, th1 + dth, !sweep);
            return;
        }
        catch (e) { /* fall through */ }
    }
    // 老式 Canvas API 兜底：用贝塞尔曲线近似椭圆弧
    const segments = 4;
    const total = th1 + dth - th1;
    for (let i = 0; i < segments; i++) {
        const a0 = th1 + (total * i) / segments;
        const a1 = th1 + (total * (i + 1)) / segments;
        const k = (4 / 3) * Math.tan((a1 - a0) / 4);
        const p0x = ccx + rx * Math.cos(a0) * cosP - ry * Math.sin(a0) * sinP;
        const p0y = ccy + rx * Math.sin(a0) * cosP + ry * Math.cos(a0) * sinP;
        const p1x = ccx + rx * Math.cos(a1) * cosP - ry * Math.sin(a1) * sinP;
        const p1y = ccy + rx * Math.sin(a1) * cosP + ry * Math.cos(a1) * sinP;
        const c1x = p0x + k * (-rx * Math.sin(a0) * cosP - ry * Math.cos(a0) * sinP);
        const c1y = p0y + k * (rx * Math.cos(a0) * cosP - ry * Math.sin(a0) * sinP);
        const c2x = p1x - k * (-rx * Math.sin(a1) * cosP - ry * Math.cos(a1) * sinP);
        const c2y = p1y - k * (rx * Math.cos(a1) * cosP - ry * Math.sin(a1) * sinP);
        if (i === 0)
            ctx.moveTo(p0x, p0y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p1x, p1y);
    }
}
/**
 * 将 SVG path 字符串以 Canvas 命令形式描绘到 ctx 上。
 * 调用方负责 beginPath / fill / stroke。
 */
function traceSvgPath(ctx, d) {
    if (!d)
        return;
    const tokens = d.match(TOKEN_RE) || [];
    let i = 0;
    let cx = 0, cy = 0, sx = 0, sy = 0;
    let prevCubic = null;
    let prevQuad = null;
    const nextNum = () => parseFloat(tokens[i++]);
    while (i < tokens.length) {
        const cmd = tokens[i++];
        if (!/[a-zA-Z]/.test(cmd))
            continue;
        switch (cmd) {
            case 'M':
            case 'm': {
                let first = true;
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const x = nextNum(), y = nextNum();
                    if (cmd === 'M') {
                        cx = x;
                        cy = y;
                    }
                    else {
                        cx += x;
                        cy += y;
                    }
                    if (first) {
                        ctx.moveTo(cx, cy);
                        sx = cx;
                        sy = cy;
                        first = false;
                    }
                    else
                        ctx.lineTo(cx, cy);
                    prevCubic = null;
                    prevQuad = null;
                }
                break;
            }
            case 'L':
            case 'l': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const x = nextNum(), y = nextNum();
                    if (cmd === 'L') {
                        cx = x;
                        cy = y;
                    }
                    else {
                        cx += x;
                        cy += y;
                    }
                    ctx.lineTo(cx, cy);
                    prevCubic = null;
                    prevQuad = null;
                }
                break;
            }
            case 'H':
            case 'h': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const x = nextNum();
                    if (cmd === 'H')
                        cx = x;
                    else
                        cx += x;
                    ctx.lineTo(cx, cy);
                }
                prevCubic = null;
                prevQuad = null;
                break;
            }
            case 'V':
            case 'v': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const y = nextNum();
                    if (cmd === 'V')
                        cy = y;
                    else
                        cy += y;
                    ctx.lineTo(cx, cy);
                }
                prevCubic = null;
                prevQuad = null;
                break;
            }
            case 'C':
            case 'c': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const a = [nextNum(), nextNum(), nextNum(), nextNum(), nextNum(), nextNum()];
                    const c1x = cmd === 'C' ? a[0] : cx + a[0];
                    const c1y = cmd === 'C' ? a[1] : cy + a[1];
                    const c2x = cmd === 'C' ? a[2] : cx + a[2];
                    const c2y = cmd === 'C' ? a[3] : cy + a[3];
                    const ex = cmd === 'C' ? a[4] : cx + a[4];
                    const ey = cmd === 'C' ? a[5] : cy + a[5];
                    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
                    cx = ex;
                    cy = ey;
                    prevCubic = { x: c2x, y: c2y };
                }
                prevQuad = null;
                break;
            }
            case 'S':
            case 's': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const a = [nextNum(), nextNum(), nextNum(), nextNum()];
                    const c1x = prevCubic ? 2 * cx - prevCubic.x : cx;
                    const c1y = prevCubic ? 2 * cy - prevCubic.y : cy;
                    const c2x = cmd === 'S' ? a[0] : cx + a[0];
                    const c2y = cmd === 'S' ? a[1] : cy + a[1];
                    const ex = cmd === 'S' ? a[2] : cx + a[2];
                    const ey = cmd === 'S' ? a[3] : cy + a[3];
                    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
                    cx = ex;
                    cy = ey;
                    prevCubic = { x: c2x, y: c2y };
                }
                prevQuad = null;
                break;
            }
            case 'Q':
            case 'q': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const a = [nextNum(), nextNum(), nextNum(), nextNum()];
                    const qcx = cmd === 'Q' ? a[0] : cx + a[0];
                    const qcy = cmd === 'Q' ? a[1] : cy + a[1];
                    const ex = cmd === 'Q' ? a[2] : cx + a[2];
                    const ey = cmd === 'Q' ? a[3] : cy + a[3];
                    ctx.quadraticCurveTo(qcx, qcy, ex, ey);
                    cx = ex;
                    cy = ey;
                    prevQuad = { x: qcx, y: qcy };
                }
                prevCubic = null;
                break;
            }
            case 'T':
            case 't': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const x = nextNum(), y = nextNum();
                    if (cmd === 'T') {
                        cx = x;
                        cy = y;
                    }
                    else {
                        cx += x;
                        cy += y;
                    }
                    const qcx = prevQuad ? 2 * cx - prevQuad.x : cx;
                    const qcy = prevQuad ? 2 * cy - prevQuad.y : cy;
                    ctx.quadraticCurveTo(qcx, qcy, cx, cy);
                    prevQuad = { x: qcx, y: qcy };
                }
                prevCubic = null;
                break;
            }
            case 'A':
            case 'a': {
                while (i < tokens.length && isNumToken(tokens[i])) {
                    const rx = nextNum(), ry = nextNum(), rot = nextNum();
                    const fA = nextNum(), fS = nextNum();
                    const ex = nextNum(), ey = nextNum();
                    const nx = cmd === 'A' ? ex : cx + ex;
                    const ny = cmd === 'A' ? ey : cy + ey;
                    arcTo(ctx, rx, ry, rot, fA ? 1 : 0, fS ? 1 : 0, nx, ny, cx, cy);
                    cx = nx;
                    cy = ny;
                }
                prevCubic = null;
                prevQuad = null;
                break;
            }
            case 'Z':
            case 'z': {
                ctx.closePath();
                cx = sx;
                cy = sy;
                break;
            }
        }
    }
}
/**
 * 在 ctx 上绘制一个棋子（左上角位于 x,y，边长 size）
 */
function drawPiecePaths(ctx, piece, x, y, size) {
    const def = exports.PIECE_DEFINITIONS[piece];
    if (!def || !ctx)
        return;
    const scale = size / exports.PIECE_VIEWBOX;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (const p of def.paths) {
        const hasFill = p.fill && p.fill !== 'none';
        const hasStroke = p.stroke && p.stroke !== 'none';
        if (!hasFill && !hasStroke)
            continue;
        ctx.beginPath();
        traceSvgPath(ctx, p.path);
        if (hasFill) {
            ctx.fillStyle = p.fill;
            try {
                ctx.fill('evenodd');
            }
            catch (e) {
                ctx.fill();
            }
        }
        if (hasStroke) {
            ctx.strokeStyle = p.stroke;
            ctx.lineWidth = p.strokeWidth || 1.5;
            if (p.strokeLinecap === 'butt')
                ctx.lineCap = 'butt';
            else
                ctx.lineCap = 'round';
            if (p.strokeLinejoin === 'miter')
                ctx.lineJoin = 'miter';
            else
                ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }
    ctx.restore();
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 折线图组件（Canvas 2d 自绘，支持多序列）
 * properties:
 *  labels: string[]  x 轴标签（如 MM-DD）
 *  series: { name, color, values: number[] }[]
 *  theme: 'dark' | 'light'
 */
Component({
    properties: {
        labels: {
            type: Array,
            value: [],
        },
        series: {
            type: Array,
            value: [],
        },
        theme: {
            type: String,
            value: 'dark',
        },
    },
    data: {
        hasData: false,
    },
    observers: {
        'labels, series, theme': function () {
            this.refresh();
        },
    },
    lifetimes: {
        ready() {
            this._ready = true;
            this.refresh();
        },
    },
    methods: {
        refresh() {
            const labels = this.data.labels || [];
            const series = this.data.series || [];
            const hasData = labels.length > 0 && series.some((s) => (s.values || []).length > 0);
            if (hasData !== this.data.hasData) {
                // setData 回调在渲染完成后触发，确保 canvas 节点已存在
                this.setData({ hasData }, () => {
                    if (hasData && this._ready)
                        this.draw();
                });
            }
            else if (hasData && this._ready) {
                this.draw();
            }
        },
        draw() {
            const query = this.createSelectorQuery();
            query.select('#chart').fields({ node: true, size: true }).exec((res) => {
                const info = res && res[0];
                if (!info || !info.node)
                    return;
                const canvas = info.node;
                const ctx = canvas.getContext('2d');
                const dpr = wx.getWindowInfo
                    ? wx.getWindowInfo().pixelRatio
                    : wx.getSystemInfoSync().pixelRatio;
                canvas.width = info.width * dpr;
                canvas.height = info.height * dpr;
                ctx.scale(dpr, dpr);
                const W = info.width;
                const H = info.height;
                const isLight = this.data.theme === 'light';
                const textColor = isLight ? '#8888aa' : '#8888aa';
                const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
                const labels = this.data.labels || [];
                const series = this.data.series || [];
                const padTop = 10;
                const padBottom = 26;
                const padLeft = 34;
                const padRight = 12;
                const plotW = W - padLeft - padRight;
                const plotH = H - padTop - padBottom;
                ctx.clearRect(0, 0, W, H);
                // 计算 y 轴上限（取整到 1/2/5 的倍数）
                let maxVal = 0;
                series.forEach((s) => (s.values || []).forEach((v) => { if (v > maxVal)
                    maxVal = v; }));
                if (maxVal <= 0)
                    maxVal = 1;
                const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
                let niceMax = maxVal / pow;
                if (niceMax <= 1)
                    niceMax = 1;
                else if (niceMax <= 2)
                    niceMax = 2;
                else if (niceMax <= 5)
                    niceMax = 5;
                else
                    niceMax = 10;
                niceMax *= pow;
                const yTicks = 4;
                ctx.font = '10px sans-serif';
                ctx.fillStyle = textColor;
                ctx.strokeStyle = gridColor;
                ctx.lineWidth = 1;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                for (let i = 0; i <= yTicks; i++) {
                    const val = (niceMax / yTicks) * i;
                    const y = padTop + plotH - (val / niceMax) * plotH;
                    ctx.beginPath();
                    ctx.moveTo(padLeft, y);
                    ctx.lineTo(W - padRight, y);
                    ctx.stroke();
                    ctx.fillText(this.formatTick(val), padLeft - 4, y);
                }
                // x 轴标签（最多显示约 6 个，均匀抽稀）
                const n = labels.length;
                const step = Math.max(1, Math.ceil(n / 6));
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                for (let i = 0; i < n; i++) {
                    if (i % step !== 0)
                        continue;
                    const x = n === 1 ? padLeft + plotW / 2 : padLeft + (i / (n - 1)) * plotW;
                    ctx.fillText(labels[i], x, padTop + plotH + 6);
                }
                // 折线
                series.forEach((s) => {
                    const values = s.values || [];
                    if (!values.length)
                        return;
                    ctx.strokeStyle = s.color;
                    ctx.lineWidth = 2;
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    values.forEach((v, i) => {
                        const x = n === 1 ? padLeft + plotW / 2 : padLeft + (i / (n - 1)) * plotW;
                        const y = padTop + plotH - (Math.min(v, niceMax) / niceMax) * plotH;
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                    // 数据点
                    ctx.fillStyle = s.color;
                    values.forEach((v, i) => {
                        const x = n === 1 ? padLeft + plotW / 2 : padLeft + (i / (n - 1)) * plotW;
                        const y = padTop + plotH - (Math.min(v, niceMax) / niceMax) * plotH;
                        ctx.beginPath();
                        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    });
                });
            });
        },
        formatTick(val) {
            if (val >= 10000)
                return (val / 1000) + 'k';
            if (val >= 1000)
                return (val / 1000).toFixed(1) + 'k';
            return String(Math.round(val));
        },
    },
});

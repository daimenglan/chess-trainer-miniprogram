"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 饼图/环形图组件（Canvas 2d 自绘）
 * properties:
 *  data: { label, value, color }[]
 */
Component({
    properties: {
        data: {
            type: Array,
            value: [],
        },
    },
    data: {
        hasData: false,
        legend: [],
    },
    observers: {
        data: function () {
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
            const list = (this.data.data || []).filter((d) => d && d.value > 0);
            const hasData = list.length > 0;
            if (hasData !== this.data.hasData || JSON.stringify(list) !== JSON.stringify(this.data.legend)) {
                // setData 回调在渲染完成后触发，确保 canvas 节点已存在
                this.setData({ hasData, legend: list }, () => {
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
            query.select('#pie').fields({ node: true, size: true }).exec((res) => {
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
                const list = (this.data.data || []).filter((d) => d && d.value > 0);
                const total = list.reduce((s, d) => s + d.value, 0);
                if (total <= 0)
                    return;
                ctx.clearRect(0, 0, W, H);
                const cx = W / 2;
                const cy = H / 2;
                const outerR = Math.min(W, H) / 2 - 4;
                const innerR = outerR * 0.55;
                let startAngle = -Math.PI / 2;
                list.forEach((d) => {
                    const angle = (d.value / total) * Math.PI * 2;
                    const endAngle = startAngle + angle;
                    ctx.beginPath();
                    ctx.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
                    ctx.arc(cx, cy, outerR, startAngle, endAngle);
                    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
                    ctx.closePath();
                    ctx.fillStyle = d.color;
                    ctx.fill();
                    startAngle = endAngle;
                });
            });
        },
    },
});

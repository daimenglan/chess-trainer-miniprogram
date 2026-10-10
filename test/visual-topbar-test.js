/**
 * 顶栏/评估条视觉校验（Playwright）
 *
 * 用真实的 pages/analysis/analysis.wxss + components/analysis-panel/analysis-panel.wxss
 * 与 app.wxss 主题变量渲染静态片段，实测文字与背景的对比度，验证：
 *   1. 深色主题下棋手名字对比度达标（原问题是白底浅字）
 *   2. 浅色主题下同样可读
 *   3. 评估条双向填充比例符合网页版 ±10 兵满格规则
 *
 * 运行: node test/visual-topbar-test.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, '..', '国际象棋陪练');
const { chromium } = require(path.join(WEB_ROOT, 'node_modules', 'playwright'));

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

// rpx → px（以 750rpx = 375px 的 iPhone 宽度换算）
function rpxToPx(css) {
  return css.replace(/([\d.]+)rpx/g, (_, n) => (parseFloat(n) / 2) + 'px');
}

/** 给组件样式加容器前缀，模拟小程序组件的 styleIsolation: isolated */
function scopeTo(prefix, css) {
  return css.replace(/(^|\})\s*([^{}@]+)\{/g, (m, brace, sel) => {
    const scoped = sel.split(',').map((s) => {
      const t = s.trim();
      if (!t || t.startsWith('@') || t.startsWith('from') || t.startsWith('to')) return t;
      return `${prefix} ${t}`;
    }).join(', ');
    return `${brace}${scoped}{`;
  });
}

const appWxss = rpxToPx(read('app.wxss'));
const pageWxss = rpxToPx(read('pages/analysis/analysis.wxss'));
// 组件样式只作用于组件内部，加 .panel-scope 前缀避免与页面类名互串
const panelWxss = scopeTo('.panel-scope', rpxToPx(read('components/analysis-panel/analysis-panel.wxss')));

// 顶栏 DOM（对应 analysis.wxml 的 .top-bar 结构）
function topBarHtml() {
  return `
    <view class="top-bar">
      <view class="top-bar-left">
        <text class="mode-badge">🔍 分析模式</text>
        <view class="player-tag"><text class="player-dot-white"></text><text>你</text></view>
        <text class="vs-text">VS</text>
        <view class="player-tag"><text class="player-dot-black"></text><text>AI</text></view>
        <text class="result-tag">白胜</text>
      </view>
    </view>`;
}

// 评估条 DOM（对应 analysis-panel.wxml）
function evalBarHtml(ev) {
  const left = Math.min(Math.abs(Math.min(ev, 0)) / 10 * 100, 100);
  const right = Math.min(Math.max(ev, 0) / 10 * 100, 100);
  const side = '白方';
  const text = ev > 0.3 ? 'score-green' : ev < -0.3 ? 'score-red' : 'score-neutral';
  const label = Math.abs(ev) > 3 ? (ev > 0 ? '己方胜势' : '对方胜势')
    : Math.abs(ev) > 1.5 ? (ev > 0 ? '己方优势' : '对方优势')
    : Math.abs(ev) > 0.5 ? (ev > 0 ? '己方稍优' : '对方稍优') : '均势';
  const fmt = ev === 0 ? '0.00' : (ev > 0 ? '+' + ev.toFixed(2) : ev.toFixed(2));
  return `
    <view class="panel-scope">
    <view class="evaluation-bar-container">
      <view class="eval-row">
        <view class="eval-bar">
          <view class="eval-bar-half eval-bar-left">
            <view class="eval-bar-fill-left" style="width: ${left}%"></view>
          </view>
          <view class="eval-bar-divider"></view>
          <view class="eval-bar-half eval-bar-right">
            <view class="eval-bar-fill-right" style="width: ${right}%"></view>
          </view>
        </view>
        <text class="evaluation-score ${text}">${fmt}</text>
      </view>
      <text class="eval-sub">${side}走棋 · ${label}</text>
    </view>
    </view>`;
}

// 把 view/text 当普通块级元素处理，模拟小程序渲染
const RESET = `
  view { display: block; }
  text { display: inline; }
  body { margin: 0; padding: 0; }
`;

function html(theme, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>${appWxss}</style>
    <style>${RESET}</style>
    <style>${pageWxss}</style>
    <style>${panelWxss}</style>
  </head><body>
    <view class="analysis-page ${theme === 'light' ? 'theme-light' : 'theme-dark'}">${body}</view>
  </body></html>`;
}

// 相对亮度与对比度（WCAG）
function relLum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseRgb(s) {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : parseFloat(m[4]) };
}
// 把半透明前景叠加到背景上，得到实际呈现色
function blend(fg, bg) {
  return fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a)));
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });

  for (const theme of ['dark', 'light']) {
    await page.setContent(html(theme, topBarHtml() + evalBarHtml(3.5) + evalBarHtml(-4) + evalBarHtml(0)));
    await page.waitForTimeout(120);

    section(`${theme === 'dark' ? '深色' : '浅色'}主题 · 顶栏棋手名字可读性`);
    const m = await page.evaluate(() => {
      const tag = document.querySelector('.player-tag');
      const cs = getComputedStyle(tag);
      // 逐层向上找不透明的实际背景
      let el = tag, bg = null;
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        const p = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (p && (p[4] === undefined || parseFloat(p[4]) > 0.9)) { bg = c; break; }
        el = el.parentElement;
      }
      return {
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        tagBg: cs.backgroundColor,
        pageBg: bg || 'rgb(15,15,35)',
        tagRect: tag.getBoundingClientRect().toJSON(),
      };
    });

    const fg = parseRgb(m.color);
    const pageBg = parseRgb(m.pageBg).rgb;
    // 棋手 tag 自身有半透明底色，先与页面底色合成
    const tagBgParsed = parseRgb(m.tagBg);
    const tagBgBlended = tagBgParsed.a < 1 ? blend(tagBgParsed, pageBg) : tagBgParsed.rgb;
    const cr = contrast(fg.rgb, tagBgBlended);
    console.log(`     文字色 ${m.color} / 有效背景 rgb(${tagBgBlended.join(',')}) → 对比度 ${cr.toFixed(2)}:1 (字号 ${m.fontSize}, 字重 ${m.fontWeight})`);

    assert('对比度 ≥ 4.5:1（WCAG AA 正文）', cr >= 4.5, `实际 ${cr.toFixed(2)}:1`);
    assert('字号 ≥ 12px', parseFloat(m.fontSize) >= 12, `实际 ${m.fontSize}`);
    assert('棋手标签有可见底色（区别于顶栏）', m.tagRect.height > 0);

    section(`${theme === 'dark' ? '深色' : '浅色'}主题 · 评估条双向填充`);
    const bars = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.evaluation-bar-container').forEach((c) => {
        const l = c.querySelector('.eval-bar-fill-left');
        const r = c.querySelector('.eval-bar-fill-right');
        const leftHalf = c.querySelector('.eval-bar-left');
        const rightHalf = c.querySelector('.eval-bar-right');
        const score = c.querySelector('.evaluation-score');
        const sub = c.querySelector('.eval-sub');
        out.push({
          leftFillPct: parseFloat(l.style.width),
          rightFillPct: parseFloat(r.style.width),
          leftHalfW: leftHalf.getBoundingClientRect().width,
          rightHalfW: rightHalf.getBoundingClientRect().width,
          dividerW: c.querySelector('.eval-bar-divider').getBoundingClientRect().width,
          scoreText: score.textContent.trim(),
          scoreColor: getComputedStyle(score).color,
          subText: sub.textContent.trim(),
        });
      });
      return out;
    });

    const [pos, neg, zero] = bars;
    assert('+3.5 → 右绿条 35%', pos.rightFillPct === 35, `实际 ${pos.rightFillPct}`);
    assert('+3.5 → 左红条 0%', pos.leftFillPct === 0, `实际 ${pos.leftFillPct}`);
    assert('-4 → 左红条 40%', neg.leftFillPct === 40, `实际 ${neg.leftFillPct}`);
    assert('-4 → 右绿条 0%', neg.rightFillPct === 0, `实际 ${neg.rightFillPct}`);
    assert('0 → 两侧均 0%（分割线居中）', zero.leftFillPct === 0 && zero.rightFillPct === 0);
    assert('左右半区等宽（中心分割）', Math.abs(pos.leftHalfW - pos.rightHalfW) < 0.5,
      `左 ${pos.leftHalfW} / 右 ${pos.rightHalfW}`);
    assert('中心分割线可见', pos.dividerW > 0 && pos.dividerW <= 3, `实际 ${pos.dividerW}px`);
    assert('分数文案正确 +3.50', pos.scoreText === '+3.50', `实际 ${pos.scoreText}`);
    assert('副文案正确', pos.subText === '白方走棋 · 己方胜势', `实际 ${pos.subText}`);

    // 分数颜色语义：正值绿、负值红
    const greenOk = parseRgb(pos.scoreColor).rgb[1] > parseRgb(pos.scoreColor).rgb[0];
    const redOk = parseRgb(neg.scoreColor).rgb[0] > parseRgb(neg.scoreColor).rgb[1];
    assert('正分显示为绿色系', greenOk, `实际 ${pos.scoreColor}`);
    assert('负分显示为红色系', redOk, `实际 ${neg.scoreColor}`);

    // 截图留档
    const shotDir = path.join(ROOT, 'test', 'screenshots');
    if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `topbar-evalbar-${theme}.png`), fullPage: true });
    console.log(`     📸 截图: test/screenshots/topbar-evalbar-${theme}.png`);
  }

  await browser.close();
  console.log(`\n${'='.repeat(44)}`);
  console.log(failed === 0 ? `✅ 全部通过 (${passed} 项)` : `❌ ${failed} 项失败 / 共 ${passed + failed} 项`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });

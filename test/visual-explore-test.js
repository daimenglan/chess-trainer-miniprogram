/**
 * 首页六宫格 + 自主探究页布局视觉校验（Playwright）
 *
 * 用真实的 app.wxss 主题变量 + pages/choice/choice.wxss 渲染首页快速入口区，
 * 用 pages/explore/explore.wxss 渲染自主探究页，实测两档手机视口：
 *   1. 六宫格确实是 3 列 × 2 行（改格数后最容易出的错：列数没改、标签换行溢出）
 *   2. 六个标签都完整可见，没有一个被挤到两行或裁掉
 *   3. 自主探究页顶栏按钮不溢出、棋盘区与控制区不重叠
 *
 * 运行: node test/visual-explore-test.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, '..', '国际象棋陪练');
const { chromium } = require(path.join(WEB_ROOT, 'node_modules', 'playwright'));

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

// rpx → px（750rpx = 视口宽度）
function rpxToPx(css, viewportWidth) {
  return css.replace(/([\d.]+)rpx/g, (_, n) => (parseFloat(n) * viewportWidth / 750) + 'px');
}

const VIEWPORTS = [
  { name: 'iPhone SE (375×667)', width: 375, height: 667 },
  { name: 'iPhone 15 Pro (393×852)', width: 393, height: 852 },
];

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  →  ' + extra : '')); }
}

/** 取 app.wxss 里 :root/.theme-dark 的变量定义 */
function themeVars() {
  const app = read('app.wxss');
  const block = app.match(/\.theme-dark\s*\{([\s\S]*?)\n\}/);
  return (block ? block[1] : app) + '\n';
}

/** 首页快速入口区的 HTML（与 choice.wxml 保持一致） */
function gridHtml() {
  const cells = [
    ['♟', 'AI 对弈'], ['🌐', '在线对弈'], ['🎯', '自主探究'],
    ['🧩', '每日习题'], ['📊', '复盘分析'], ['🏆', '比赛竞赛'],
  ];
  return `<div class="quick-grid">${cells.map(([i, l]) =>
    `<div class="quick-cell"><span class="quick-icon">${i}</span><span class="quick-label">${l}</span></div>`
  ).join('')}</div>`;
}

(async () => {
  const browser = await chromium.launch();
  console.log('\n======== 首页六宫格 / 自主探究页 布局校验 ========\n');

  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    const appVars = themeVars();
    const choiceCss = rpxToPx(read('pages/choice/choice.wxss'), vp.width);
    const exploreCss = rpxToPx(read('pages/explore/explore.wxss'), vp.width);

    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      ${appVars}
      body { margin:0; background: var(--bg-primary); font-family: -apple-system, sans-serif; }
      ${choiceCss}
    </style></head><body>${gridHtml()}</body></html>`);

    const info = await page.evaluate(() => {
      const grid = document.querySelector('.quick-grid');
      const cells = [...document.querySelectorAll('.quick-cell')];
      const gs = getComputedStyle(grid);
      const rows = new Set(cells.map(c => Math.round(c.getBoundingClientRect().top)));
      return {
        cols: gs.gridTemplateColumns.split(' ').filter(Boolean).length,
        rowCount: rows.size,
        cellCount: cells.length,
        labels: cells.map(c => {
          const l = c.querySelector('.quick-label');
          const r = l.getBoundingClientRect();
          // line-height 计算值可能是 "normal"，不能用它推行数：
          // 用 Range 逐行盒的真实个数来数，最直接也最可靠
          const range = document.createRange();
          range.selectNodeContents(l);
          const lineCount = [...range.getClientRects()].filter(x => x.height > 0).length;
          return {
            text: l.textContent.trim(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            lines: Math.max(1, lineCount),
            overflow: r.right > window.innerWidth + 0.5,
          };
        }),
        gridRight: Math.round(grid.getBoundingClientRect().right),
      };
    });

    check('六宫格为 3 列', info.cols === 3, 'cols=' + info.cols);
    check('排成 2 行', info.rowCount === 2, 'rows=' + info.rowCount);
    check('共 6 个入口', info.cellCount === 6, 'cells=' + info.cellCount);
    check('六个标签均单行显示',
      info.labels.every(l => l.lines === 1),
      info.labels.filter(l => l.lines > 1).map(l => `${l.text}(${l.lines}行)`).join(',') || 'ok');
    check('无标签溢出视口', info.labels.every(l => !l.overflow));
    check('含「自主探究」入口', info.labels.some(l => l.text === '自主探究'));
    check('宫格未超出右边界', info.gridRight <= vp.width + 0.5,
      'right=' + info.gridRight + ' vw=' + vp.width);

    // 自主探究页：顶栏 + 棋盘 + 控制区不重叠
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      ${appVars}
      body { margin:0; background: var(--bg-primary); font-family: -apple-system, sans-serif; }
      .ex-board-wrap { padding: 16rpx 16rpx 0; }
      ${rpxToPx('16rpx', vp.width)}
      ${exploreCss}
    </style></head><body>
      <div class="explore-page">
        <div class="ex-topbar">
          <div class="ex-topbar-left">
            <div class="ex-back">← 返回</div><span class="ex-badge">🎯 自主探究</span>
          </div>
          <div class="ex-topbar-right">
            <span class="ex-step-count">0 步</span>
            <div class="ex-tb-btn">📂 选择棋谱</div>
            <div class="ex-tb-btn ex-tb-disabled">💾 保存棋谱</div>
          </div>
        </div>
        <div class="ex-scroll">
          <div class="ex-board-wrap"><div style="width:100%;aspect-ratio:1/1;background:#888"></div></div>
          <div class="ex-status"><span class="ex-status-text">白方走棋</span>
            <span class="ex-status-hint">黑白轮流走子 · 每步引擎分析</span></div>
          <div class="ex-controls">
            <div class="ex-ctrl-btn ex-disabled">◀ 悔棋</div>
            <div class="ex-ctrl-btn ex-disabled">重做 ▶</div>
            <div class="ex-ctrl-btn">🔄 翻转</div>
            <div class="ex-ctrl-btn ex-ctrl-on">🤖 推荐开</div>
          </div>
        </div>
      </div>
    </body></html>`);

    const ex = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const r = s => q(s).getBoundingClientRect();
      return {
        topbarH: Math.round(r('.ex-topbar').height),
        topbarScrollW: q('.ex-topbar').scrollWidth,
        topbarClientW: q('.ex-topbar').clientWidth,
        boardBottom: Math.round(r('.ex-board-wrap').bottom),
        statusTop: Math.round(r('.ex-status').top),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 0.5,
      };
    });

    check('顶栏内容不横向溢出', ex.topbarScrollW <= ex.topbarClientW + 1,
      `${ex.topbarScrollW} > ${ex.topbarClientW}`);
    check('棋盘区与状态条不重叠', ex.boardBottom <= ex.statusTop + 1,
      `board=${ex.boardBottom} status=${ex.statusTop}`);
    check('整页无横向滚动', !ex.overflowX);

    await page.close();
    console.log('');
  }

  await browser.close();
  console.log('========================================');
  if (fail === 0) console.log('✅ 全部通过 (' + pass + ' 项)');
  else { console.log('❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });

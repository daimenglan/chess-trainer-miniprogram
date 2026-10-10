/**
 * 棋盘录制页布局视觉校验（Playwright）
 *
 * 用真实的 pages/board-record/index.wxss + components/analysis-panel/analysis-panel.wxss
 * 与 app.wxss 主题变量渲染静态片段，实测两档手机视口下的版面：
 *   1. 棋盘与下方控制面板不重叠（原实现棋盘按宽度撑满正方形，短屏会把面板挤下去）
 *   2. 控制面板整体在视口内、保存按钮常驻可见（不被推出屏幕）
 *   3. 展开 AI 推荐后，analysis-panel 有确定高度、候选列表真正可见
 *      —— 组件内候选列表是 flex:1 + height:0，缺了宿主高度约束会塌陷不可见
 *
 * 运行: node test/visual-board-record-test.js
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

// 把 view/text/scroll-view 当普通块级元素处理，模拟小程序渲染。
// 自定义组件（chess-board / analysis-panel）宿主节点按块级处理，
// 与小程序一致，否则宿主高度参与不了父级布局计算。
const RESET = `
  view, chess-board, analysis-panel { display: block; }
  text { display: inline; }
  scroll-view { display: block; overflow: hidden; }
  button, input { font: inherit; }
  /* 浏览器 input 有约 177px 的固有宽度且 min-width:auto 不允许 flex 收缩，
     会把 .br-meta 的三列挤出面板；小程序 input 无此固有宽度。这里对齐小程序行为。 */
  input { width: 100%; min-width: 0; box-sizing: border-box; }
  body { margin: 0; padding: 0; height: 100vh; }
`;

/** 棋盘（复刻 components/chess-board 的结构：宽度撑出正方形） */
function boardHtml() {
  let squares = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 0;
      squares += `<view class="square ${light ? 'square-light' : 'square-dark'}" style="background-color:${light ? '#ffffff' : '#5a7d9a'}"></view>`;
    }
  }
  return `
    <view class="board-scope">
    <view class="board-wrapper">
      <view class="board-frame board-frame-inline">
        <view class="board-grid board-grid-inline">${squares}</view>
      </view>
    </view>
    </view>`;
}

/** 候选走法列表（复刻 analysis-panel 的结构与文案） */
function candidatesHtml() {
  const list = [
    { rank: 1, label: '兵 e2→e4（e4）', score: '+0.35', color: '#4ade80', pros: ['占据中心，控制 d5/e5', '打开白方象与后的线路'], cons: ['e4 兵可能成为攻击目标'] },
    { rank: 2, label: '马 g1→f3（Nf3）', score: '+0.20', color: '#facc15', pros: ['发展子力，准备王车易位'], cons: [] },
    { rank: 3, label: '兵 d2→d4（d4）', score: '+0.15', color: '#facc15', pros: ['直接占领中心'], cons: ['需防备 c5 反击'] },
  ];
  const items = list.map((c) => `
    <view class="candidate-item" id="candidate-${c.rank}">
      <view class="candidate-rank rank-${c.rank}"><text>#${c.rank}</text></view>
      <view class="candidate-info">
        <view class="candidate-header">
          <text class="candidate-label">${c.label}</text>
          <text class="candidate-score" style="color:${c.color}">${c.score}</text>
        </view>
        ${c.pros.map((p) => `<view class="candidate-detail"><text class="detail-pro">✓ ${p}</text></view>`).join('')}
        ${c.cons.map((p) => `<view class="candidate-detail"><text class="detail-con">! ${p}</text></view>`).join('')}
        <view class="line-row"><text class="line-label">预计变化：</text><text class="line-move">e4</text><text class="line-move">e5</text></view>
      </view>
    </view>`).join('');
  return `
    <view class="analysis-panel">
      <view class="panel-content">
        <view class="evaluation-bar-container">
          <view class="eval-row">
            <view class="eval-bar">
              <view class="eval-bar-half eval-bar-left"><view class="eval-bar-fill-left" style="width:0%"></view></view>
              <view class="eval-bar-divider"></view>
              <view class="eval-bar-half eval-bar-right"><view class="eval-bar-fill-right" style="width:3.5%"></view></view>
            </view>
            <text class="evaluation-score score-green">+0.35</text>
          </view>
          <text class="eval-sub">白方走棋 · 均势</text>
        </view>
        <scroll-view class="candidates-list">${items}</scroll-view>
      </view>
    </view>`;
}

/** 棋盘录制页（复刻 pages/board-record/index.wxml，AI 推荐展开态） */
function pageHtml() {
  return `
    <view class="br-topbar">
      <button class="br-btn">← 返回</button>
      <button class="br-btn">🔄 翻转</button>
    </view>
    <view class="br-status">
      <text class="br-status-text">白方走棋</text>
      <text class="br-status-count">3 手</text>
    </view>
    <view class="br-board-wrap"><chess-board>${boardHtml()}</chess-board></view>
    <view class="br-panel">
      <scroll-view class="br-panel-scroll">
        <view class="br-panel-inner">
          <view class="br-meta">
            <view class="br-meta-item"><text class="br-meta-label">白方</text><input class="br-meta-input" value="白方" /></view>
            <view class="br-meta-item"><text class="br-meta-label">黑方</text><input class="br-meta-input" value="黑方" /></view>
            <view class="br-meta-item"><text class="br-meta-label">赛事</text><input class="br-meta-input" value="课堂对局" /></view>
          </view>
          <view class="br-toolbar">
            <button class="br-tool-btn">↩ 撤销</button>
            <button class="br-tool-btn br-tool-btn-active">🤖 AI提示 开</button>
            <button class="br-tool-btn">🗑 清空</button>
          </view>
          <view class="br-ai">
            <view class="br-ai-head">
              <text class="br-ai-title">AI 推荐走法</text>
              <text class="br-ai-hint">3 条 · 点击可走子</text>
            </view>
            <view class="br-ai-body"><analysis-panel class="panel-scope">${candidatesHtml()}</analysis-panel></view>
          </view>
          <view class="br-move-history">
            <text class="br-history-title">走棋历史（3 手）· 点击可回看</text>
            <view class="br-move-list">
              <view class="br-move-item"><text class="br-move-text">1. e4</text></view>
              <view class="br-move-item"><text class="br-move-text">c5</text></view>
              <view class="br-move-item br-move-item-active"><text class="br-move-text">2. f3</text></view>
            </view>
          </view>
        </view>
      </scroll-view>
      <view class="br-save-bar">
        <button class="br-save-btn">💾 保存到我的棋谱</button>
      </view>
    </view>`;
}

function html(viewportWidth, theme) {
  const appWxss = rpxToPx(read('app.wxss'), viewportWidth);
  const pageWxss = rpxToPx(read('pages/board-record/index.wxss'), viewportWidth);
  // 组件样式只作用于组件内部，加 scope 前缀避免与页面类名互串
  const panelWxss = scopeTo('.panel-scope', rpxToPx(read('components/analysis-panel/analysis-panel.wxss'), viewportWidth));
  const boardWxss = scopeTo('.board-scope', rpxToPx(read('components/chess-board/chess-board.wxss'), viewportWidth));
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>${appWxss}</style>
    <style>${RESET}</style>
    <style>${pageWxss}</style>
    <style>${panelWxss}</style>
    <style>${boardWxss}</style>
  </head><body>
    <view class="board-record-page theme-${theme}">${pageHtml()}</view>
  </body></html>`;
}

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const VIEWPORTS = [
  { name: 'iPhone 14 (390×844)', width: 390, height: 844 },
  { name: 'iPhone SE (375×667)', width: 375, height: 667 },
];

(async () => {
  const browser = await chromium.launch();
  const shotDir = path.join(ROOT, 'test', 'screenshots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    await page.setContent(html(vp.width, 'dark'));
    await page.waitForTimeout(150);
    section(`${vp.name} · 版面`);

    const m = await page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const cs = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };
      const visible = (sel) => {
        const r = rect(sel);
        return !!r && r.height > 0 && r.width > 0;
      };
      return {
        vh: window.innerHeight,
        boardHost: rect('.br-board-wrap chess-board'),
        // .board-frame 是绝对定位的实际可见方块（.board-wrapper 用 padding-bottom 撑方形）
        boardFrame: rect('.board-scope .board-frame'),
        status: rect('.br-status'),
        panel: rect('.br-panel'),
        panelScroll: rect('.br-panel-scroll'),
        saveBar: rect('.br-save-bar'),
        saveBtn: rect('.br-save-btn'),
        aiBody: rect('.br-ai-body'),
        aiBodyDisplay: cs('.br-ai-body analysis-panel', 'display'),
        aiBodyHeight: cs('.br-ai-body analysis-panel', 'height'),
        panelRoot: rect('.panel-scope .analysis-panel'),
        candidatesList: rect('.panel-scope .candidates-list'),
        candidateItems: [...document.querySelectorAll('.panel-scope .candidate-item')]
          .map((el) => ({ height: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })),
        firstCandidateVisible: visible('.panel-scope .candidate-item'),
        historyVisible: visible('.br-move-history'),
        // 三列表单与工具栏是否横向溢出面板（溢出会被裁掉，用户看不到完整控件）
        metaRight: (() => { const els = [...document.querySelectorAll('.br-meta-item')]; return els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().right)) : null; })(),
        toolbarRight: (() => { const els = [...document.querySelectorAll('.br-tool-btn')]; return els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().right)) : null; })(),
        panelRight: rect('.br-panel') ? rect('.br-panel').right : null,
      };
    });

    // 棋盘必须是正方形，且完整可见
    assert('棋盘为正方形', Math.abs(m.boardFrame.width - m.boardFrame.height) < 1.5,
      `${m.boardFrame.width.toFixed(1)}×${m.boardFrame.height.toFixed(1)}`);
    assert('棋盘完整在视口内', m.boardFrame.top >= 0 && m.boardFrame.bottom <= m.vh,
      `top ${m.boardFrame.top.toFixed(1)} / bottom ${m.boardFrame.bottom.toFixed(1)} / vh ${m.vh}`);

    // 关键回归：棋盘不能盖住控制面板
    assert('棋盘与控制面板不重叠', m.boardFrame.bottom <= m.panel.top + 1,
      `棋盘底 ${m.boardFrame.bottom.toFixed(1)} vs 面板顶 ${m.panel.top.toFixed(1)}`);

    // 面板与保存按钮必须在屏幕内
    assert('控制面板在视口内（未被挤出屏幕）', m.panel.top >= 0 && m.panel.bottom <= m.vh + 1,
      `top ${m.panel.top.toFixed(1)} / bottom ${m.panel.bottom.toFixed(1)} / vh ${m.vh}`);
    assert('保存按钮常驻可见', m.saveBtn.top >= 0 && m.saveBtn.bottom <= m.vh + 1 && m.saveBtn.height > 0,
      `top ${m.saveBtn.top.toFixed(1)} / bottom ${m.saveBtn.bottom.toFixed(1)}`);
    assert('面板滚动区有可用高度', m.panelScroll.height > 0, `实际 ${m.panelScroll.height.toFixed(1)}px`);

    // 关键回归：AI 推荐面板不能塌陷
    assert('AI 区有确定高度', m.aiBody.height > 0, `实际 ${m.aiBody.height.toFixed(1)}px`);
    assert('analysis-panel 宿主被撑开（display:block + height）',
      m.aiBodyDisplay === 'block' && parseFloat(m.aiBodyHeight) > 0,
      `display=${m.aiBodyDisplay} height=${m.aiBodyHeight}`);
    assert('组件根节点有高度', m.panelRoot && m.panelRoot.height > 0,
      m.panelRoot ? `实际 ${m.panelRoot.height.toFixed(1)}px` : '未渲染');
    assert('候选列表有高度（未塌陷为 0）', m.candidatesList && m.candidatesList.height > 0,
      m.candidatesList ? `实际 ${m.candidatesList.height.toFixed(1)}px` : '未渲染');
    assert('至少一条候选走法可见', m.firstCandidateVisible,
      `候选卡片高度 ${JSON.stringify(m.candidateItems.map((c) => +c.height.toFixed(1)))}`);
    assert('走棋历史区可见', m.historyVisible);
    assert('白方/黑方/赛事三列未被横向裁掉',
      m.metaRight !== null && m.metaRight <= m.panelRight + 1,
      `表单右缘 ${m.metaRight && m.metaRight.toFixed(1)} vs 面板右缘 ${m.panelRight && m.panelRight.toFixed(1)}`);
    assert('工具栏按钮未被横向裁掉',
      m.toolbarRight !== null && m.toolbarRight <= m.panelRight + 1,
      `按钮右缘 ${m.toolbarRight && m.toolbarRight.toFixed(1)} vs 面板右缘 ${m.panelRight && m.panelRight.toFixed(1)}`);

    // 面板内容高于滚动区是正常的（scroll-view 就是为滚动设计的），
    // 要验证的是内容能靠滚动看到，而不是被裁剪丢失。
    const scrollCheck = await page.evaluate(() => {
      const scroller = document.querySelector('.br-panel-scroll');
      const ai = document.querySelector('.br-ai-body');
      if (!scroller || !ai) return null;
      const before = scroller.scrollTop;
      scroller.scrollTop = scroller.scrollHeight; // 滚到底
      const after = scroller.scrollTop;
      const aiRect = ai.getBoundingClientRect();
      const vh = window.innerHeight;
      scroller.scrollTop = before;
      return {
        scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
        scrolledBy: after - before,
        aiVisibleAfterScroll: aiRect.top >= 0 && aiRect.bottom <= vh + 1,
      };
    });
    assert('面板可滚动（内容超出时可滚到）', scrollCheck && scrollCheck.scrollable && scrollCheck.scrolledBy > 0,
      scrollCheck ? `scrollHeight>clientHeight=${scrollCheck.scrollable} 滚动量=${scrollCheck.scrolledBy}` : '未取到滚动区');
    assert('滚动后 AI 推荐区可完整看到', scrollCheck && scrollCheck.aiVisibleAfterScroll,
      scrollCheck ? JSON.stringify(scrollCheck) : '');

    console.log(`     棋盘高 ${m.boardFrame.height.toFixed(0)}px · 面板 ${m.panel.height.toFixed(0)}px · AI 区 ${m.aiBody.height.toFixed(0)}px · 首条候选高 ${m.candidateItems[0] ? m.candidateItems[0].height.toFixed(0) : 'n/a'}px`);

    const file = path.join(shotDir, `board-record-${vp.width}x${vp.height}.png`);
    await page.screenshot({ path: file });
    console.log(`     📸 截图: test/screenshots/board-record-${vp.width}x${vp.height}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(44)}`);
  console.log(failed === 0 ? `✅ 全部通过 (${passed} 项)` : `❌ ${failed} 项失败 / 共 ${passed + failed} 项`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });

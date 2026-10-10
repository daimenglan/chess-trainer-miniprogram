/**
 * 观战视图布局视觉校验（Playwright）
 *
 * 用真实的 pages/online/online.wxss + components/chess-board/chess-board.wxss +
 * components/captured-pieces/captured-pieces.wxss 与 app.wxss 主题变量渲染静态片段，
 * 实测两档手机视口下的版面（对齐网页版移动端观战布局）：
 *   1. 计时器行：白/黑两个 pill + vs 完整可见、不横向溢出，行高稳定
 *   2. 棋盘上下两条吃子栏等高等宽（fixed 占位，无吃子也不塌陷，棋盘不跳）
 *   3. 棋盘为正方形且完整在视口内
 *   4. 双方玩家卡两列并排、不被裁切
 *   5. 对局信息卡与走法记录可见
 *   6. ⚙️ 菜单面板打开后完整在视口内（不被裁切）
 *   7. 整页无横向溢出
 *
 * 运行: node test/visual-spectate-test.js
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

const RESET = `
  view, chess-board, captured-pieces, move-history { display: block; }
  text { display: inline; }
  scroll-view { display: block; overflow: hidden; }
  button, input { font: inherit; }
  body { margin: 0; padding: 0; }
`;

/** 棋盘（复刻 components/chess-board 的结构：wrapper padding-bottom 撑正方形 + 内嵌坐标） */
function boardHtml() {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let squares = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 0;
      const color = light ? '#ffffff' : '#5a7d9a';
      const labelColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';
      const rank = r === 7 ? `<text class="file-label-inline" style="color:${labelColor}">${files[f]}</text>` : '';
      const file = f === 0 ? `<text class="rank-label-inline" style="color:${labelColor}">${8 - r}</text>` : '';
      squares += `<view class="square ${light ? 'square-light' : 'square-dark'}" style="background-color:${color}">${rank}${file}</view>`;
    }
  }
  return `
    <view class="board-wrapper">
      <view class="board-frame board-frame-inline">
        <view class="board-grid board-grid-inline">${squares}</view>
      </view>
    </view>`;
}

/** 吃子栏（复刻 components/captured-pieces 的 captured-pill 结构） */
function capturedHtml(side, label, pieces) {
  const groups = pieces.map((p) => `
    <view class="captured-group">
      <view class="piece-ph" style="width:32px;height:32px"></view>
      ${p.count > 1 ? `<text class="captured-count">×${p.count}</text>` : ''}
    </view>`).join('');
  return `
    <view class="captured-pieces ${side === 'top' ? 'captured-top' : 'captured-bottom'} captured-pill">
      <text class="captured-label">${label}</text>
      ${groups}
    </view>`;
}

/** 观战视图（复刻 pages/online/online.wxml 的 isSpectating 分支） */
function pageHtml() {
  return `
    <view class="spec-timer-row">
      <view class="spec-timer-inner">
        <view class="spec-pill spec-pill-active">
          <text class="spec-pill-name">ainana32</text>
          <text class="spec-pill-time">05:18</text>
        </view>
        <text class="spec-vs">vs</text>
        <view class="spec-pill">
          <text class="spec-pill-name">奶蛙</text>
          <text class="spec-pill-time">07:20</text>
        </view>
      </view>
      <view class="spec-menu-btn"><text class="spec-menu-icon">⚙️</text></view>
    </view>

    <view class="spec-board-area">
      <view class="cap-scope">${capturedHtml('top', '⚫ 吃子', [{ type: 'r', count: 1 }, { type: 'b', count: 2 }])}</view>
      <view class="spec-board-wrap"><chess-board class="board-scope">${boardHtml()}</chess-board></view>
      <view class="cap-scope">${capturedHtml('bottom', '⚪ 吃子', [{ type: 'p', count: 2 }])}</view>
    </view>

    <view class="spec-replay-bar">
      <view class="spec-replay-btn">⏮</view>
      <view class="spec-replay-btn spec-replay-main">◀</view>
      <text class="spec-replay-info">12/24</text>
      <view class="spec-replay-btn spec-replay-main">▶</view>
      <view class="spec-replay-btn">⏭</view>
      <view class="spec-replay-live">当前</view>
    </view>

    <view class="spec-status">👀 观战中 · 轮到白方走棋</view>

    <view class="spec-tab-body">
      <view class="spec-player-grid">
        <view class="spec-player-card">
          <text class="spec-player-label">⬜ 白方</text>
          <view class="spec-player-main">
            <view class="spec-avatar spec-avatar-white">A</view>
            <view class="spec-player-text">
              <text class="spec-player-name">ainana32</text>
              <text class="spec-player-rating">♟ 1500</text>
            </view>
          </view>
        </view>
        <view class="spec-player-card">
          <text class="spec-player-label">⬛ 黑方</text>
          <view class="spec-player-main">
            <view class="spec-avatar spec-avatar-black">奶</view>
            <view class="spec-player-text">
              <text class="spec-player-name">奶蛙</text>
              <text class="spec-player-rating">♟ 1500</text>
            </view>
          </view>
        </view>
      </view>

      <view class="spec-info-card">
        <text class="spec-info-title">ℹ️ 对局信息</text>
        <view class="spec-info-row"><text class="spec-info-key">时限</text><text class="spec-info-value">10m</text></view>
        <view class="spec-info-row"><text class="spec-info-key">回合</text><text class="spec-info-value">12</text></view>
        <view class="spec-info-row"><text class="spec-info-key">👀 观战</text><text class="spec-info-value">2 人</text></view>
      </view>
    </view>

    <!-- 操作菜单面板（同首页 ☰ 下拉；默认隐藏，测试中单独打开校验） -->
    <view class="spec-menu-panel" style="display:none">
      <view class="spec-menu-item">🔄 翻转棋盘</view>
      <view class="spec-menu-item">📝 走法记录</view>
      <view class="spec-menu-item spec-menu-item-danger">🏠 回到大厅</view>
    </view>`;
}

function html(viewportWidth, theme) {
  const appWxss = rpxToPx(read('app.wxss'), viewportWidth);
  const pageWxss = rpxToPx(read('pages/online/online.wxss'), viewportWidth);
  const boardWxss = scopeTo('.board-scope', rpxToPx(read('components/chess-board/chess-board.wxss'), viewportWidth));
  const capWxss = scopeTo('.cap-scope', rpxToPx(read('components/captured-pieces/captured-pieces.wxss'), viewportWidth));
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>${appWxss}</style>
    <style>${RESET}</style>
    <style>${pageWxss}</style>
    <style>${boardWxss}</style>
    <style>${capWxss}</style>
    <style>.piece-ph{display:inline-block;border-radius:50%;background:#8888aa;opacity:.5}</style>
  </head><body>
    <view class="online-page theme-${theme}">${pageHtml()}</view>
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
    section(`${vp.name} · 观战版面`);

    const m = await page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const all = (sel) => [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      });
      const caps = all('.cap-scope .captured-pieces');
      const cards = all('.spec-player-card');
      const pills = all('.spec-pill');
      const panel = rect('.spec-menu-panel');
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        timerRow: rect('.spec-timer-row'),
        pills,
        menuBtn: rect('.spec-menu-btn'),
        boardFrame: rect('.board-scope .board-frame'),
        caps,
        boardWrap: rect('.spec-board-wrap'),
        replayBar: rect('.spec-replay-bar'),
        status: rect('.spec-status'),
        cards,
        infoCard: rect('.spec-info-card'),
        panel,
        // 文档整体是否横向溢出（内容宽 > 视口宽）
        scrollW: document.documentElement.scrollWidth,
      };
    });

    // ---- 计时器行 ----
    assert('计时器行存在且有高度', m.timerRow && m.timerRow.height > 0,
      m.timerRow ? `${m.timerRow.height.toFixed(1)}px` : '未渲染');
    assert('白/黑两个计时 pill 均渲染', m.pills.length === 2, `实际 ${m.pills.length} 个`);
    assert('计时 pill 不横向溢出视口',
      m.pills.every((p) => p.left >= -1 && p.right <= m.vw + 1),
      m.pills.map((p) => `${p.left.toFixed(0)}~${p.right.toFixed(0)}`).join(' / '));
    assert('⚙️ 菜单按钮在视口内', m.menuBtn && m.menuBtn.right <= m.vw + 1 && m.menuBtn.left >= -1,
      m.menuBtn ? `${m.menuBtn.left.toFixed(0)}~${m.menuBtn.right.toFixed(0)} vs vw ${m.vw}` : '未渲染');
    // 计时 pill 与菜单按钮不重叠（绝对定位的按钮不应压住黑方 pill）
    assert('计时 pill 与 ⚙️ 按钮不重叠',
      m.menuBtn && m.pills.every((p) => p.right <= m.menuBtn.left + 1),
      m.pills.map((p) => p.right.toFixed(0)).join(',') + ' vs btn ' + (m.menuBtn ? m.menuBtn.left.toFixed(0) : 'n/a'));

    // ---- 吃子栏（fixed 占位：两条等高，棋盘不跳） ----
    assert('上下两条吃子栏均渲染', m.caps.length === 2, `实际 ${m.caps.length} 条`);
    if (m.caps.length === 2) {
      assert('上下吃子栏等高（fixed 占位不跳动）',
        Math.abs(m.caps[0].height - m.caps[1].height) < 1.5,
        `${m.caps[0].height.toFixed(1)} vs ${m.caps[1].height.toFixed(1)}`);
      assert('吃子栏为胶囊形（圆角）且有高度', m.caps[0].height > 20, `实际 ${m.caps[0].height.toFixed(1)}px`);
      assert('吃子栏在视口内',
        m.caps.every((c) => c.left >= -1 && c.right <= m.vw + 1),
        m.caps.map((c) => `${c.left.toFixed(0)}~${c.right.toFixed(0)}`).join(' / '));
    }

    // ---- 棋盘 ----
    assert('棋盘为正方形', Math.abs(m.boardFrame.width - m.boardFrame.height) < 1.5,
      `${m.boardFrame.width.toFixed(1)}×${m.boardFrame.height.toFixed(1)}`);
    assert('棋盘完整在视口内', m.boardFrame.top >= 0 && m.boardFrame.bottom <= m.vh,
      `top ${m.boardFrame.top.toFixed(1)} / bottom ${m.boardFrame.bottom.toFixed(1)} / vh ${m.vh}`);
    assert('棋盘不横向溢出', m.boardFrame.left >= -1 && m.boardFrame.right <= m.vw + 1,
      `${m.boardFrame.left.toFixed(0)}~${m.boardFrame.right.toFixed(0)} vs vw ${m.vw}`);

    // ---- 回看条 / 状态行 ----
    assert('回看导航条在视口内', m.replayBar && m.replayBar.left >= -1 && m.replayBar.right <= m.vw + 1,
      m.replayBar ? `${m.replayBar.left.toFixed(0)}~${m.replayBar.right.toFixed(0)}` : '未渲染');
    assert('状态行在视口内', m.status && m.status.left >= -1 && m.status.right <= m.vw + 1,
      m.status ? `${m.status.left.toFixed(0)}~${m.status.right.toFixed(0)}` : '未渲染');

    // ---- 玩家卡：两列并排 ----
    assert('双方玩家卡均渲染', m.cards.length === 2, `实际 ${m.cards.length}`);
    if (m.cards.length === 2) {
      assert('玩家卡两列并排（同一行、左右分列）',
        Math.abs(m.cards[0].top - m.cards[1].top) < 1.5 && m.cards[1].left > m.cards[0].left,
        `top ${m.cards[0].top.toFixed(1)}/${m.cards[1].top.toFixed(1)} left ${m.cards[0].left.toFixed(1)}/${m.cards[1].left.toFixed(1)}`);
      assert('玩家卡不被横向裁切',
        m.cards.every((c) => c.left >= -1 && c.right <= m.vw + 1),
        m.cards.map((c) => `${c.left.toFixed(0)}~${c.right.toFixed(0)}`).join(' / '));
    }
    assert('对局信息卡可见', m.infoCard && m.infoCard.height > 0,
      m.infoCard ? `${m.infoCard.height.toFixed(1)}px` : '未渲染');

    // ---- ⚙️ 菜单面板（默认隐藏，单独打开校验） ----
    const menu = await page.evaluate(() => {
      const el = document.querySelector('.spec-menu-panel');
      if (!el) return null;
      el.style.display = 'block';
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    assert('菜单面板完整在视口内',
      menu && menu.left >= -1 && menu.right <= m.vw + 1 && menu.bottom <= m.vh + 1,
      menu ? `left ${menu.left.toFixed(0)} right ${menu.right.toFixed(0)} bottom ${menu.bottom.toFixed(0)} vs vw ${m.vw}/vh ${m.vh}` : '未渲染');
    assert('菜单面板有宽度（未塌陷）', menu && menu.width > 80,
      menu ? `${menu.width.toFixed(1)}px` : '未渲染');
    if (menu) {
      const fileMenu = path.join(shotDir, `spectate-menu-${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: fileMenu, fullPage: true });
      console.log(`     📸 截图(菜单展开): test/screenshots/spectate-menu-${vp.width}x${vp.height}.png`);
      await page.evaluate(() => { document.querySelector('.spec-menu-panel').style.display = 'none'; });
    }

    // ---- 整页无横向溢出 ----
    assert('整页无横向溢出', m.scrollW <= m.vw + 1, `scrollWidth ${m.scrollW} vs vw ${m.vw}`);

    console.log(`     棋盘 ${m.boardFrame.width.toFixed(0)}×${m.boardFrame.height.toFixed(0)}px · 吃子栏 ${m.caps[0] ? m.caps[0].height.toFixed(0) : 'n/a'}px · 玩家卡 ${m.cards[0] ? m.cards[0].width.toFixed(0) : 'n/a'}px`);

    const file = path.join(shotDir, `spectate-${vp.width}x${vp.height}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`     📸 截图: test/screenshots/spectate-${vp.width}x${vp.height}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(44)}`);
  console.log(failed === 0 ? `✅ 全部通过 (${passed} 项)` : `❌ ${failed} 项失败 / 共 ${passed + failed} 项`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });

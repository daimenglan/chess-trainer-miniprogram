/**
 * 好友页布局视觉校验（Playwright）
 *
 * 用真实的 app.wxss 主题变量 + pages/friends/friends.wxss 渲染静态片段。
 * 重点盯住「列表整块消失」那类回归：
 *   1. 好友行在窄屏下不溢出，头像/昵称/三个操作按钮都完整可见
 *   2. 昵称过长时省略而不是把操作按钮挤出屏幕
 *   3. 邀请面板在小屏上不超出一屏（含二维码 320rpx + 文案 + 两个按钮）
 *   4. 六个时限预设排成规整网格，不出现单个被挤到下一行
 *
 * 运行: node test/visual-friends-test.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, '..', '国际象棋陪练');
const { chromium } = require(path.join(WEB_ROOT, 'node_modules', 'playwright'));

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

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

function themeVars() {
  const app = read('app.wxss');
  const block = app.match(/\.theme-dark\s*\{([\s\S]*?)\n\}/);
  return (block ? block[1] : app) + '\n';
}

/** 好友列表片段：含一个长昵称（最容易顶破布局的情况） */
function friendsHtml() {
  const rows = [
    { name: 'wx_9f3a2b1c', online: true, rating: 1680 },
    { name: '一个非常非常长的中文昵称用来测试溢出', online: false, rating: 1500 },
    { name: '棋友C', online: true, rating: 1210 },
  ];
  return `<div class="page theme-dark">
    <div class="scroll-content">
      <div class="tab-content">
        <div class="friend-list">
          ${rows.map((r) => `
          <div class="friend-item">
            <div class="friend-avatar ${r.online ? 'online' : ''}">
              <span class="avatar-text">${r.name.substring(0, 1).toUpperCase()}</span>
              <div class="online-dot ${r.online ? 'on' : ''}"></div>
            </div>
            <div class="friend-info">
              <span class="friend-name">${r.name}</span>
              <span class="friend-status ${r.online ? 'on' : ''}">${r.online ? '在线' : '离线'} · ${r.rating} 分</span>
            </div>
            <div class="friend-actions">
              <div class="action-btn fight"><span>⚔️</span></div>
              <div class="action-btn chat"><span>💬</span></div>
              <div class="action-btn del"><span>🗑</span></div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/** 邀请面板片段：生成后的完整形态 */
function invitePanelHtml() {
  const presets = ['1 分钟', '3 分钟', '5 分钟', '10 分钟', '15 分钟', '30 分钟'];
  const active = 3;
  return `<div class="confirm-overlay">
    <div class="confirm-dialog invite-panel">
      <span class="invite-panel-title">邀请好友</span>
      <span class="invite-panel-desc">选好时限后生成邀请，对方扫码或点开链接、注册登录后会自动成为好友</span>
      <div class="preset-label">选择时限</div>
      <div class="preset-grid">
        ${presets.map((p, i) => `<div class="preset-chip ${i === active ? 'on' : ''}"><span>${p}</span></div>`).join('')}
      </div>
      <div class="invite-qr">
        <div class="invite-qr-img"></div>
        <span class="invite-qr-hint">微信扫码，或长按图片保存后发给好友</span>
      </div>
      <div class="invite-link-row">
        <span class="invite-link-text">https://wxaurl.cn/averyveryverylongurlinktoken000000</span>
        <span class="invite-link-copy">复制</span>
      </div>
      <div class="invite-text-preview">
        <span>⚔️ Mychess 国际象棋对弈邀请
棋友A 邀请你下一局 10 分钟 国际象棋
https://wxaurl.cn/averyveryverylongurlinktoken000000
扫码或点开链接注册登录后会自动成为好友并直接进入对弈，邀请 7 天内有效。</span>
      </div>
      <div class="invite-actions">
        <button class="invite-share-btn"><span>发送给微信好友</span></button>
        <div class="invite-copy-btn"><span>复制邀请文案</span></div>
      </div>
      <span class="invite-expire">邀请 7 天内有效，生成后可在任意场合粘贴分享</span>
    </div>
  </div>`;
}

(async () => {
  const browser = await chromium.launch();
  console.log('\n======== 好友页布局校验 ========\n');

  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const css = themeVars() + rpxToPx(read('pages/friends/friends.wxss'), vp.width);

    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      ${css}
      body { margin:0; background: var(--bg-primary); font-family:-apple-system,sans-serif; }
      .page { min-height:100vh; }
      .scroll-content { height:auto; }
      span { display:inline; }
      .friend-name, .friend-status, .avatar-text, .search-name { display:block; }
      .action-btn span, .invite-link-text, .invite-link-copy { display:inline; }
    </style></head><body>${friendsHtml()}</body></html>`);

    const list = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.friend-item')];
      return {
        count: items.length,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 0.5,
        rows: items.map((it) => {
          const r = it.getBoundingClientRect();
          const actions = it.querySelector('.friend-actions').getBoundingClientRect();
          const name = it.querySelector('.friend-name');
          const nr = name.getBoundingClientRect();
          return {
            right: Math.round(r.right),
            actionsRight: Math.round(actions.right),
            actionsW: Math.round(actions.width),
            nameW: Math.round(nr.width),
            // 昵称盒宽是否被压到 0（flex 子项未设 min-width:0 时的经典塌陷）
            nameCollapsed: nr.width < 4,
          };
        }),
      };
    });

    check('渲染出 3 行好友', list.count === 3, 'count=' + list.count);
    check('页面无横向滚动', !list.overflowX);
    check('每行都未超出视口', list.rows.every((r) => r.right <= vp.width + 0.5),
      list.rows.map((r) => r.right).join(','));
    check('三个操作按钮都完整在屏内',
      list.rows.every((r) => r.actionsRight <= vp.width + 0.5 && r.actionsW > 0),
      list.rows.map((r) => `w=${r.actionsW} right=${r.actionsRight}`).join(' | '));
    check('长昵称未把昵称盒压塌', list.rows.every((r) => !r.nameCollapsed),
      list.rows.map((r) => r.nameW).join(','));

    // 邀请面板
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      ${css}
      body { margin:0; background: var(--bg-primary); font-family:-apple-system,sans-serif; }
      span { display:block; }
      .invite-link-row span { display:inline; }
      .invite-actions .invite-share-btn { display:flex; align-items:center; justify-content:center; }
    </style></head><body>${invitePanelHtml()}</body></html>`);

    const panel = await page.evaluate(() => {
      const dlg = document.querySelector('.confirm-dialog');
      const r = dlg.getBoundingClientRect();
      const chips = [...document.querySelectorAll('.preset-chip')];
      const rows = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
      const qr = document.querySelector('.invite-qr-img').getBoundingClientRect();
      return {
        panelH: Math.round(r.height),
        panelW: Math.round(r.width),
        panelTop: Math.round(r.top),
        panelBottom: Math.round(r.bottom),
        viewportH: window.innerHeight,
        chipRows: rows.size,
        chipCount: chips.length,
        qrW: Math.round(qr.width),
        qrH: Math.round(qr.height),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 0.5,
      };
    });

    check('面板宽度未超视口', panel.panelW <= vp.width, 'w=' + panel.panelW);
    check('面板高度未超视口', panel.panelH <= panel.viewportH,
      `h=${panel.panelH} vh=${panel.viewportH}`);
    check('面板完整在屏内',
      panel.panelTop >= -1 && panel.panelBottom <= panel.viewportH + 1,
      `top=${panel.panelTop} bottom=${panel.panelBottom}`);
    check('6 个时限预设都可点', panel.chipCount === 6, 'n=' + panel.chipCount);
    check('时限排成 2 行 3 列', panel.chipRows === 2, 'rows=' + panel.chipRows);
    check('二维码为正方形', Math.abs(panel.qrW - panel.qrH) <= 2,
      `${panel.qrW}x${panel.qrH}`);
    check('面板无横向溢出', !panel.overflowX);

    await page.close();
    console.log('');
  }

  await browser.close();
  console.log('========================================');
  if (fail === 0) console.log('✅ 全部通过 (' + pass + ' 项)');
  else { console.log('❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

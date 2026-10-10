/**
 * 在线对弈页「好友对弈」页签布局视觉校验（Playwright）
 *
 * 用真实的 app.wxss 主题变量 + components/friend-lobby/friend-lobby.wxss 渲染静态片段。
 * 重点盯住几类回归：
 *   1. 好友卡片网格在窄屏下两列并排、不横向溢出
 *   2. 长昵称省略而不是把卡片撑破
 *   3. 邀请区（时限 + 生成按钮 + 二维码 + 两个操作按钮）完整落在屏内
 *   4. 模式切换三个页签并排一行，不换行撑高
 *
 * 运行: node test/visual-friend-lobby-test.js
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

/** 好友卡片网格：含一个超长昵称（最容易顶破两列布局的情况） */
function friendsHtml() {
  const rows = [
    { name: '陷阱流', online: true, rating: 1500, pending: false },
    { name: '一个非常非常长的中文昵称用来测试溢出', online: false, rating: 1680, pending: false },
    { name: 'wx_h2-plfa0', online: true, rating: 1210, pending: true },
    { name: '小猪布布', online: false, rating: 1500, pending: false },
  ];
  return `<div class="friend-lobby theme-dark">
    <div class="fl-friends-head"><span>👥 我的好友（2 人在线 / 共 4）</span></div>
    <div class="fl-grid">
      ${rows.map((r) => `
      <div class="fl-card ${r.online ? 'online' : ''}">
        <div class="fl-card-dot ${r.online ? 'on' : ''}"></div>
        <div class="fl-avatar"><span class="fl-avatar-text">${r.name.substring(0, 1).toUpperCase()}</span></div>
        <span class="fl-card-name">${r.name}</span>
        <span class="fl-card-rating">♟ ${r.rating}</span>
        <div class="fl-challenge-btn ${r.pending ? 'pending' : ''}"><span>${r.pending ? '⏳ 邀请中' : '⚔️ 挑战'}</span></div>
      </div>`).join('')}
    </div>
  </div>`;
}

/** 邀请区：生成后的完整形态（二维码 + 链接 + 两个按钮 + 重置 + 有效期） */
function inviteHtml() {
  return `<div class="friend-lobby theme-dark">
    <div class="fl-invite-bar">
      <div class="fl-time-row">
        <span class="fl-time-label">时限</span>
        <div class="fl-time-picker"><span>10 分钟</span><span class="fl-time-arrow">▾</span></div>
      </div>
      <div class="fl-generate-btn"><span>📨 生成邀请二维码 / 链接</span></div>
      <div class="fl-qr">
        <div class="fl-qr-img"></div>
        <span class="fl-qr-hint">让对方用微信扫码，或长按图片保存后发给好友</span>
      </div>
      <div class="fl-link-row">
        <span class="fl-link-text">https://wxaurl.cn/averyveryverylongurlinktoken000000</span>
        <span class="fl-link-copy">复制</span>
      </div>
      <div class="fl-actions">
        <button class="fl-share-btn"><span>发送给微信好友</span></button>
        <div class="fl-copy-btn"><span>复制邀请文案</span></div>
      </div>
      <div class="fl-reset-btn"><span>换一个</span></div>
      <span class="fl-expire">邀请 7 天内有效，对方登录后自动成为好友并进入对弈</span>
    </div>
    <span class="fl-hint">点击好友头像即可发起挑战（时限 10 分钟）；对方需在线。</span>
  </div>`;
}

/** 模式切换：三个页签 */
function modeTabsHtml() {
  return `<div class="match-container theme-dark">
    <div class="mode-toggle">
      <div class="mode-tab mode-tab-active"><span>🎯 随机匹配</span></div>
      <div class="mode-tab"><span>👥 好友对弈</span></div>
      <div class="mode-tab"><span>🪑 棋桌大厅</span></div>
    </div>
  </div>`;
}

(async () => {
  const browser = await chromium.launch();
  console.log('\n======== 好友对弈页签布局校验 ========\n');

  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const css = themeVars()
      + rpxToPx(read('components/friend-lobby/friend-lobby.wxss'), vp.width)
      + rpxToPx(read('pages/online/online.wxss'), vp.width);

    const base = `
      body { margin:0; background: var(--bg-primary); font-family:-apple-system,sans-serif; }
      .friend-lobby { max-width:none; margin:0 auto; }
      .match-container { padding: 20px; }
      span { display:block; }
      .fl-card-name, .fl-card-rating { display:block; }
      .fl-time-picker span, .fl-link-row span, .fl-generate-btn span { display:inline; }
      .fl-challenge-btn span, .fl-add-btn span, .fl-share-btn span { display:block; text-align:center; }
      .fl-qr-img { background:#fff; }
    `;

    // ===== 好友卡片网格 =====
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}${base}</style></head><body>${friendsHtml()}</body></html>`);
    const grid = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.fl-card')];
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 0.5;
      return {
        count: cards.length,
        overflowX,
        cards: cards.map((c) => {
          const r = c.getBoundingClientRect();
          const name = c.querySelector('.fl-card-name');
          return {
            left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            nameW: Math.round(name.getBoundingClientRect().width),
            nameScrollW: name.scrollWidth,
          };
        }),
      };
    });
    check('渲染出 4 张好友卡', grid.count === 4, 'count=' + grid.count);
    check('无横向滚动', !grid.overflowX);
    check('卡片都在视口内', grid.cards.every((c) => c.right <= vp.width + 0.5 && c.left >= -0.5),
      grid.cards.map((c) => `${c.left}~${c.right}`).join(','));
    check('两列并排（每行两张）',
      grid.cards[0].right <= grid.cards[1].left + 0.5 && grid.cards[1].right <= vp.width + 0.5,
      `c0.right=${grid.cards[0].right} c1.left=${grid.cards[1].left}`);
    check('长昵称被省略而非撑破卡片',
      grid.cards.every((c) => c.nameW <= c.width + 0.5),
      grid.cards.map((c) => `name=${c.nameW} card=${c.width}`).join(','));

    // ===== 邀请区 =====
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}${base}</style></head><body>${inviteHtml()}</body></html>`);
    const inv = await page.evaluate(() => {
      const bar = document.querySelector('.fl-invite-bar');
      const r = bar.getBoundingClientRect();
      const qr = document.querySelector('.fl-qr-img').getBoundingClientRect();
      const actions = document.querySelector('.fl-actions').getBoundingClientRect();
      const share = document.querySelector('.fl-share-btn').getBoundingClientRect();
      const copy = document.querySelector('.fl-copy-btn').getBoundingClientRect();
      const link = document.querySelector('.fl-link-row').getBoundingClientRect();
      return {
        barW: Math.round(r.width), barLeft: Math.round(r.left), barRight: Math.round(r.right),
        qrW: Math.round(qr.width), qrH: Math.round(qr.height),
        actionsW: Math.round(actions.width),
        shareW: Math.round(share.width), copyW: Math.round(copy.width),
        linkRight: Math.round(link.right),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 0.5,
      };
    });
    check('邀请区无横向溢出', !inv.overflowX);
    check('邀请区在视口内', inv.barLeft >= -0.5 && inv.barRight <= vp.width + 0.5,
      `${inv.barLeft}~${inv.barRight}`);
    check('二维码为正方形', Math.abs(inv.qrW - inv.qrH) <= 2, `${inv.qrW}x${inv.qrH}`);
    check('两个操作按钮等宽并排', Math.abs(inv.shareW - inv.copyW) <= 2 && inv.shareW > 0,
      `share=${inv.shareW} copy=${inv.copyW}`);
    check('链接行未超出邀请区', inv.linkRight <= inv.barRight + 0.5,
      `link=${inv.linkRight} bar=${inv.barRight}`);

    // ===== 模式切换三页签 =====
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}${base}</style></head><body>${modeTabsHtml()}</body></html>`);
    const tabs = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.mode-tab')];
      const rows = new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)));
      const toggle = document.querySelector('.mode-toggle').getBoundingClientRect();
      return {
        count: els.length,
        rows: rows.size,
        toggleH: Math.round(toggle.height),
        last: Math.round(els[els.length - 1].getBoundingClientRect().right),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 0.5,
      };
    });
    check('三个页签都在', tabs.count === 3, 'count=' + tabs.count);
    check('三页签排成一行（不换行）', tabs.rows === 1, 'rows=' + tabs.rows);
    check('页签行不横向溢出', !tabs.overflowX && tabs.last <= vp.width + 0.5, 'last=' + tabs.last);

    await page.close();
    console.log('');
  }

  await browser.close();
  console.log('========================================');
  if (fail === 0) console.log('✅ 全部通过 (' + pass + ' 项)');
  else { console.log('❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

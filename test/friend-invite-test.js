/**
 * 好友邀请核心逻辑验证
 *
 * 覆盖几条「错了用户看不出来、但对端收不到邀请」的链路：
 * 1. 时限预设必须全部落在后端 friendChallengeService.isValidTimeControl 的合法区间
 * 2. 邀请文案：有链接/无链接两种形态都成立，且不含打不开的占位链接
 * 3. 落地 token 解析：scene / token / q 三种来源 + URL 编码 + 噪声拒绝
 *
 * 用法: node test/friend-invite-test.js
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const inv = require(path.join(ROOT, 'utils/friendInvite'));

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? '  →  ' + extra : ''));
  }
}

/** 与后端 friendChallengeService.isValidTimeControl 同口径 */
function backendAccepts(tc) {
  return !!tc && tc.mode === 'total_time'
    && typeof tc.initialTime === 'number' && tc.initialTime >= 10 && tc.initialTime <= 10800
    && typeof tc.increment === 'number' && tc.increment >= 0 && tc.increment <= 180;
}

console.log('\n======== 好友邀请核心逻辑 ========\n');

console.log('--- 1. 时限预设必须被后端接受 ---');
{
  const presets = inv.getTimePresets();
  check('预设非空', presets.length > 0, 'len=' + presets.length);
  const bad = presets.filter((p) => !backendAccepts(p));
  check('全部通过后端校验', bad.length === 0,
    bad.map((p) => `${p.label}:${p.mode}/${p.initialTime}/${p.increment}`).join(', '));
  check('不含「不限时」（后端只收 total_time）',
    !presets.some((p) => p.mode !== 'total_time' || !p.initialTime));
  check('默认索引在范围内',
    inv.getDefaultPresetIndex() >= 0 && inv.getDefaultPresetIndex() < presets.length,
    'idx=' + inv.getDefaultPresetIndex());
  check('每个预设都有 label', presets.every((p) => !!p.label));
}

console.log('\n--- 2. 时限文案 ---');
{
  check('600 秒 → 10 分钟', inv.formatTimeControl({ initialTime: 600, increment: 0 }) === '10 分钟',
    inv.formatTimeControl({ initialTime: 600, increment: 0 }));
  check('含加秒时带说明', inv.formatTimeControl({ initialTime: 600, increment: 5 }).includes('5 秒'),
    inv.formatTimeControl({ initialTime: 600, increment: 5 }));
  check('空值 → 不限时', inv.formatTimeControl(null) === '不限时');
}

console.log('\n--- 3. 邀请文案 ---');
{
  const withLink = inv.buildInviteText({
    username: '棋友A', timeLabel: '10 分钟', link: 'https://example.com/x',
  });
  check('含标题', withLink.includes(inv.INVITE_TITLE));
  check('含邀请人', withLink.includes('棋友A'));
  check('含时限', withLink.includes('10 分钟'));
  check('含链接', withLink.includes('https://example.com/x'));
  check('含有效期说明', withLink.includes('7 天'));
  check('多行结构', withLink.split('\n').length >= 4, 'lines=' + withLink.split('\n').length);

  const noLink = inv.buildInviteText({ username: '', timeLabel: '5 分钟', link: '' });
  check('无链接时不出现 http', !noLink.includes('http'), JSON.stringify(noLink));
  check('无昵称时文案仍通顺', noLink.includes('邀请你下一局'));
}

console.log('\n--- 4. 落地 token 解析 ---');
{
  const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  check('直接放 token', inv.parseInviteToken({ token: TOKEN }) === TOKEN);
  check('scene 放裸 token（扫码）', inv.parseInviteToken({ scene: TOKEN }) === TOKEN);
  check('scene 带 URL 编码', inv.parseInviteToken({ scene: encodeURIComponent(TOKEN) }) === TOKEN);
  check('q 形如 token=xxx', inv.parseInviteToken({ q: 'token=' + TOKEN }) === TOKEN);
  check('q 带编码', inv.parseInviteToken({ q: encodeURIComponent('token=' + TOKEN) }) === TOKEN);
  check('q 多参数中取 token', inv.parseInviteToken({ q: 'a=1&token=' + TOKEN }) === TOKEN);
  check('大写归一为小写',
    inv.parseInviteToken({ token: TOKEN.toUpperCase() }) === TOKEN);

  // 优先 token 再 scene
  check('token 优先于 scene',
    inv.parseInviteToken({ token: TOKEN, scene: 'ffffffffffffffffffffffffffffffff' }) === TOKEN);

  // 噪声拒绝：不能把不确定的串当 token 去请求
  check('空对象返回空', inv.parseInviteToken({}) === '');
  check('null 安全', inv.parseInviteToken(null) === '');
  check('undefined 安全', inv.parseInviteToken(undefined) === '');
  check('长度不足拒绝', inv.parseInviteToken({ token: 'abc123' }) === '');
  check('非十六进制拒绝', inv.parseInviteToken({ token: 'z'.repeat(32) }) === '');
  check('超长拒绝', inv.parseInviteToken({ token: TOKEN + 'a' }) === '');
  check('非法编码不抛错', inv.parseInviteToken({ token: '%E0%A4%A' }) === '');
}

console.log('\n--- 5. 兑换结果整形 ---');
{
  const r = inv.describeRedeemResult({
    fromUserId: 7, fromUsername: '对手B', fromRating: 1680,
    timeControl: { mode: 'total_time', initialTime: 900, increment: 0 },
    expiresAt: '2026-10-05T00:00:00.000Z',
  });
  check('取出对方昵称', r.fromUsername === '对手B');
  check('取出等级分', r.fromRating === 1680);
  check('时限格式化', r.timeLabel === '15 分钟', r.timeLabel);

  const empty = inv.describeRedeemResult(null);
  check('空数据有兜底昵称', empty.fromUsername === '对方');
  check('空数据不抛错', empty.success === true);
}

console.log('\n========================================');
if (fail === 0) {
  console.log('✅ 全部通过 (' + pass + ' 项)');
} else {
  console.log('❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项');
  process.exit(1);
}

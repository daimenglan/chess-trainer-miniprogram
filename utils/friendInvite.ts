/**
 * 好友邀请：时限预设 + 邀请文案 + 落地参数解析
 *
 * 这里的都是纯函数（不碰 wx.* / getApp），便于 test/friend-invite-test.js 直接跑。
 * 页面负责调用与展示，逻辑判定集中在这一处。
 */

/**
 * 可选时限预设。
 *
 * 只提供包干制（total_time）：后端 friendChallengeService.isValidTimeControl
 * 仅接受 total_time，且 initialTime ∈ [10, 10800]、increment ∈ [0, 180]。
 * 因此「不限时」不能出现在这里 —— 传上去会被后端直接拒绝。
 */
const TIME_PRESETS = [
  { label: '1 分钟', mode: 'total_time', initialTime: 60, increment: 0 },
  { label: '3 分钟', mode: 'total_time', initialTime: 180, increment: 0 },
  { label: '5 分钟', mode: 'total_time', initialTime: 300, increment: 0 },
  { label: '10 分钟', mode: 'total_time', initialTime: 600, increment: 0 },
  { label: '15 分钟', mode: 'total_time', initialTime: 900, increment: 0 },
  { label: '30 分钟', mode: 'total_time', initialTime: 1800, increment: 0 },
  // 以下 increment 模式：后端 friendChallengeService 允许 increment ∈ [0, 180]
  { label: '3+2', mode: 'total_time', initialTime: 180, increment: 2 },
  { label: '5+3', mode: 'total_time', initialTime: 300, increment: 3 },
  { label: '10+10', mode: 'total_time', initialTime: 600, increment: 10 },
];

/** 默认选中「10 分钟」（索引 3） */
const DEFAULT_PRESET_INDEX = 3;

/** 邀请文案标题，与网页版 FriendLobby 保持一致 */
export const INVITE_TITLE = '⚔️ Mychess 国际象棋对弈邀请';

/** 取全部时限预设 */
export function getTimePresets() {
  return TIME_PRESETS.slice();
}

/** 取默认预设索引 */
export function getDefaultPresetIndex(): number {
  return DEFAULT_PRESET_INDEX;
}

/**
 * 时限转中文说明
 * @param preset 形如 { initialTime, increment }
 */
export function formatTimeControl(preset: any): string {
  if (!preset || !preset.initialTime) return '不限时';
  const minutes = Math.floor(preset.initialTime / 60);
  const increment = preset.increment || 0;
  return increment > 0 ? `${minutes} 分钟 + 每步 ${increment} 秒` : `${minutes} 分钟`;
}

/**
 * 拼装可复制的邀请文案。
 *
 * 链接可能有两种：小程序 URL Link（可直接点开）或网页兜底链接。
 * 都拿不到时只发「小程序卡片」——此时文案里不出现链接，避免复制出去打不开。
 *
 * @param params.username 邀请人昵称（可空）
 * @param params.timeLabel 时限说明
 * @param params.link 可点开的链接（可空）
 */
export function buildInviteText(params: any): string {
  const { username, timeLabel, link } = params || {};
  const who = username ? `${username} 邀请你` : '邀请你';
  const lines = [
    INVITE_TITLE,
    `${who}下一局 ${timeLabel || ''} 国际象棋`.replace(/\s+/g, ' '),
  ];
  if (link) lines.push(link);
  lines.push('扫码或点开链接注册登录后会自动成为好友并直接进入对弈，邀请 7 天内有效。');
  return lines.join('\n');
}

/**
 * 从落地页参数中解析邀请 token。
 *
 * 三个来源：
 * - scene：扫小程序码，微信会把 scene 值原样放进 options.scene（且会做一次 URL 编码）
 * - token：点 URL Link / 网页链接，走 query
 * - q：某些微信版本用 q 承载 scene（形如 "token=xxx"）
 *
 * 统一容错：整体可能被 encodeURIComponent 包过，解一层再用。
 * 只接受长度合法的十六进制串，避免把噪声当 token 拿去请求。
 */
export function parseInviteToken(options: any): string {
  const opts = options || {};
  const raw = opts.token || opts.scene || opts.q || '';
  if (!raw || typeof raw !== 'string') return '';

  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch (e) {
    // 含非法百分号序列：保持原样
    value = raw;
  }

  // q / scene 可能是 "token=abc" 或 "a=1&token=abc" 形式
  const matched = value.match(/(?:^|&)token=([0-9a-fA-F]{32})/);
  if (matched) return matched[1].toLowerCase();

  const bare = value.match(/^([0-9a-fA-F]{32})$/);
  if (bare) return bare[1].toLowerCase();

  return '';
}

/**
 * 把后端返回的挑战数据转成页面可直接渲染的形态。
 * 失败原因按后端原话回显（链接无效 / 已过期 / 已被使用 …），不自行编造文案。
 */
export function describeRedeemResult(challenge: any) {
  const data = challenge || {};
  return {
    success: true,
    fromUserId: data.fromUserId || 0,
    fromUsername: data.fromUsername || '对方',
    fromRating: data.fromRating || 0,
    timeLabel: formatTimeControl(data.timeControl),
    expiresAt: data.expiresAt || '',
  };
}

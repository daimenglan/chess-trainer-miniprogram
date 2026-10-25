/**
 * Lichess 账号绑定（微信小程序）
 *
 * 主路径：OAuth 2.0 授权码 + PKCE，与网页版同一套流程。
 *   小程序 web-view 只能加载已在微信后台配置的「业务域名」（打不开 lichess.org），
 *   也没有打开系统浏览器的 API，故采用「票据桥接」：
 *   1. 小程序创建票据，拿到自家域名下的授权入口 URL（/api/lichess/go?t=xxx）
 *   2. 用户到浏览器打开该 URL → 302 到 lichess.org 授权页 → 一键授权
 *   3. 后端回调完成绑定/登录并把结果写回票据
 *   4. 小程序轮询票据状态拿到结果，全程无需粘贴任何令牌
 *
 * 备用路径：手动创建个人访问令牌（PAT）后粘贴，供浏览器跳转不可用时兜底。
 */
const api = require('./api');

/** 令牌创建页（仅备用路径使用） */
export const TOKEN_URL = 'https://lichess.org/account/oauth/token/create';
/** 授权页需勾选的权限（与后端 SCOPE 一致） */
export const REQUIRED_SCOPES = 'board:play challenge:write';

/** 待轮询票据的本地存储 key（页面被回收后仍能续接轮询） */
const PENDING_TICKET_KEY = 'lichess_pending_ticket';

/** 轮询间隔（毫秒）与单次轮询的超时兜底 */
const POLL_INTERVAL_MS = 2000;

/** 绑定结果 */
export interface LichessBindResult {
  success: boolean;
  lichessUsername?: string;
  profile?: any;
  error?: string;
  /** 后端错误码（如 PROFILE_INCOMPLETE），供上层判断是否引导用户先设密码 */
  code?: string;
}

/** 票据轮询返回结构 */
export interface LichessTicketStatus {
  status: 'pending' | 'completed' | 'expired' | 'failed';
  lichessUsername?: string;
  token?: string;
  userId?: number;
  username?: string;
  role?: string;
  avatarUrl?: string | null;
  teacherStatus?: string | null;
  membership?: any;
  isNewUser?: boolean;
  error?: string;
}

interface PendingTicket {
  ticket: string;
  url: string;
  mode: 'bind' | 'login';
  /** 票据过期时间戳（毫秒），由 expiresIn 推算 */
  expiresAt: number;
}

/**
 * 复制令牌创建页地址到剪贴板（备用路径）。
 * Lichess 需要登录后操作，小程序内无法直接打开外部浏览器，故复制链接引导用户手动访问。
 */
export function copyTokenUrl(): Promise<void> {
  return copyToClipboard(TOKEN_URL);
}

/** 复制文本到剪贴板（失败静默，不阻断主流程） */
export function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve) => {
    wx.setClipboardData({
      data: text,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

// ===== 待轮询票据的本地持久化 =====

function savePendingTicket(pending: PendingTicket | null): void {
  try {
    if (pending) {
      wx.setStorageSync(PENDING_TICKET_KEY, pending);
    } else {
      wx.removeStorageSync(PENDING_TICKET_KEY);
    }
  } catch { /* 非关键 */ }
}

/**
 * 读取未过期的待轮询票据。
 *
 * 用于页面重新 onLoad 时续接轮询：用户去浏览器授权期间小程序可能被回收，
 * 回来后需要凭本地票据继续查询结果，而不是让用户重新授权。
 */
export function loadPendingTicket(): PendingTicket | null {
  try {
    const pending = wx.getStorageSync(PENDING_TICKET_KEY) as PendingTicket | null;
    if (!pending?.ticket) return null;
    if (pending.expiresAt && pending.expiresAt < Date.now()) {
      savePendingTicket(null);
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

/** 清除待轮询票据（授权结束或用户取消时调用） */
export function clearPendingTicket(): void {
  savePendingTicket(null);
}

/**
 * 发起 OAuth 授权：取票据 → 复制授权入口到剪贴板 → 返回票据信息供页面轮询
 *
 * @param mode bind = 绑定到当前登录账号；login = 用 Lichess 登录/注册本系统
 * @returns 票据信息，或 { error, code }
 */
export async function startOAuth(mode: 'bind' | 'login'): Promise<PendingTicket | { error: string; code?: string }> {
  try {
    const res: any = mode === 'login'
      ? await api.lichessMiniAppLoginTicket()
      : await api.lichessMiniAppTicket();
    const data = res?.data || {};
    if (!data.ticket || !data.url) {
      return { error: res?.error || '获取授权链接失败，请重试' };
    }

    const pending: PendingTicket = {
      ticket: data.ticket,
      url: data.url,
      mode,
      expiresAt: Date.now() + (data.expiresIn || 600) * 1000,
    };
    savePendingTicket(pending);

    // 自动复制，用户切到浏览器直接粘贴即可
    await copyToClipboard(pending.url);
    return pending;
  } catch (err: any) {
    // 透传后端错误码（如 PROFILE_INCOMPLETE），供上层判断是否引导用户先设密码
    return { error: err?.message || '获取授权链接失败，请检查网络', code: err?.code };
  }
}

/**
 * 查询一次票据状态
 * @returns 状态对象；网络异常时返回 pending，避免误判为失败中断轮询
 */
export async function queryTicket(ticket: string): Promise<LichessTicketStatus> {
  try {
    const res: any = await api.lichessMiniAppStatus(ticket);
    const data = res?.data || {};
    return { status: data.status || 'pending', ...data };
  } catch (err: any) {
    // 404 等明确失败按 expired 处理，让用户能重新发起而不是无限等待
    const msg = err?.message || '';
    if (err?.statusCode === 400) {
      return { status: 'expired', error: msg };
    }
    return { status: 'pending' };
  }
}

/** 用粘贴的令牌完成绑定（备用路径） */
export async function bindWithToken(token: string): Promise<LichessBindResult> {
  const trimmed = (token || '').trim();
  if (!trimmed) {
    return { success: false, error: '请输入 Lichess 访问令牌' };
  }
  try {
    const res: any = await api.lichessBindToken(trimmed);
    const data = res?.data || {};
    return {
      success: true,
      lichessUsername: data.lichessUsername,
      profile: data.profile || null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || '绑定失败，请检查令牌是否正确', code: err?.code };
  }
}

/** 解绑 */
export async function unbind(): Promise<{ success: boolean; error?: string }> {
  try {
    await api.unbindLichess();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || '解除绑定失败' };
  }
}

/** 把绑定结果同步到全局用户与本地存储（供其它页面读取 lichessUsername） */
export function persistBinding(lichessUsername: string | null): void {
  try {
    const app: any = getApp();
    if (!app?.globalData?.user) return;
    app.globalData.user.lichessUsername = lichessUsername;
    if (typeof app.saveUser === 'function') {
      app.saveUser(app.globalData.user);
    }
  } catch { /* 非关键 */ }
}

/**
 * 进入绑定页。
 *
 * 小程序没有原生输入弹窗（wx.showModal 的 editable 仅在 2.17.1+ 且单行），
 * 故统一走 /pages/lichess-bind 页面，OAuth 主路径与令牌备用路径都在那里。
 */
export function openBindPage(from: string = 'index'): void {
  wx.navigateTo({ url: `/pages/lichess-bind/lichess-bind?from=${from}` });
}

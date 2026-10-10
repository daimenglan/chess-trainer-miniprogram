/**
 * 小程序行为埋点
 *
 * 与网页版 frontend/src/services/analytics.ts 保持同一套口径，
 * 批量上报 + 心跳 + 会话 ID 规则一致，便于两端的「会话数 / 停留时长 / 模块分布」可直接比较。
 *
 * 与网页版的差异：
 * - 存储用 wx.setStorageSync 代替 localStorage；
 * - 每个请求带 X-Client-Platform: miniapp 头。原生小程序的 User-Agent 不含
 *   web-view 的 `miniProgram` 特征，后端只靠 UA 判定会把小程序流量误记成网站流量。
 *
 * 所有失败路径都静默兜底：埋点绝不能影响业务。
 */

const ANALYTICS_INTERVAL = 30000; // 30秒心跳间隔
const BATCH_SIZE = 5; // 批量上报阈值
const SESSION_IDLE_MS = 30 * 60 * 1000; // 会话空闲上限，超过视为新一次访问
const SESSION_ID_KEY = 'analytics_session_id';
const SESSION_TS_KEY = 'analytics_session_ts';
const PLATFORM = 'miniapp';

interface AnalyticsEvent {
  activityType: string;
  pagePath?: string;
  sessionId?: string;
  durationSeconds?: number;
  extraInfo?: Record<string, any>;
  userId?: number;
  username?: string;
}

let eventBuffer: AnalyticsEvent[] = [];
let heartbeatTimer: any = null;
let flushTimer: any = null;
let currentPage: string = '';
let pageEnterTime: number = 0;
let isInitialized = false;

/** 生成唯一会话ID */
function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

function readStorage(key: string): string {
  try {
    return (wx as any).getStorageSync(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  try {
    (wx as any).setStorageSync(key, value);
  } catch { /* 存储失败不影响埋点 */ }
}

/**
 * 会话ID续期：用于代表「此刻正在活动」的事件（心跳、关键操作、回到前台）。
 * 空闲超过 SESSION_IDLE_MS 则开一个新会话，否则沿用同一个 ID。
 */
function touchSession(): string {
  const now = Date.now();
  const stored = readStorage(SESSION_ID_KEY);
  const lastTs = Number(readStorage(SESSION_TS_KEY)) || 0;

  const sessionId = stored && now - lastTs <= SESSION_IDLE_MS ? stored : generateSessionId();
  writeStorage(SESSION_ID_KEY, sessionId);
  writeStorage(SESSION_TS_KEY, String(now));
  return sessionId;
}

/**
 * 会话ID只读：用于结算型事件（补记刚刚结束的一段停留时长）。
 * 那段时长属于它发生时的会话，所以不轮换也不续期——否则空闲很久后关闭页面
 * 会凭空多出一个只有一条记录的新会话，把「平均每次会话时长」的分母撑大。
 */
function peekSession(): string {
  return readStorage(SESSION_ID_KEY) || generateSessionId();
}

/** 取当前登录用户信息（未登录返回 null），用于未带 token 时仍能关联账号 */
function getCurrentUser(): { userId: number; username: string } | null {
  try {
    const app = getApp();
    const user = app?.globalData?.user;
    if (user && user.userId) {
      return { userId: user.userId, username: user.username || '' };
    }
  } catch { /* ignore */ }
  return null;
}

/** 批量上报事件到后端 */
function flushEvents() {
  if (eventBuffer.length === 0) return;

  const events = eventBuffer;
  eventBuffer = [];

  try {
    const app: any = typeof getApp === 'function' ? getApp() : null;
    const token = (app && app.globalData && app.globalData.token) || (wx as any).getStorageSync('auth_token');
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || 'https://mychess.com.cn';
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }
    // 声明渠道：原生小程序 UA 无 web-view 特征，需显式告知后端
    header['X-Client-Platform'] = PLATFORM;

    (wx as any).request({
      url: `${baseUrl}/api/analytics/events`,
      method: 'POST',
      data: { events },
      header,
      timeout: 10000,
      success() { /* 埋点失败无需重试 */ },
      fail() { /* 埋点失败无需重试 */ },
    });
  } catch {
    // 上报失败直接丢弃，不影响业务，也不在本地堆积（小程序 storage 有限）
  }
}

/**
 * 添加事件到缓冲区
 *
 * @param extendSession 该事件是否代表「此刻正在活动」。补记停留时长的 page_view 传 false，
 *                      它结算的是过去一段时间，不应触发会话轮换或续期。
 */
function addEvent(event: AnalyticsEvent, extendSession = true) {
  const user = getCurrentUser();
  eventBuffer.push({
    ...event,
    userId: user?.userId,
    username: user?.username,
    sessionId: extendSession ? touchSession() : peekSession(),
  });

  if (eventBuffer.length >= BATCH_SIZE) {
    flushEvents();
  }
}

/**
 * 记录一次页面停留结算，并开始计时新页面。
 * 页面切换时调用：先补记上一页的停留时长，再把当前页指向新页面。
 */
function settleAndEnterPage(path: string) {
  const now = Date.now();

  if (currentPage && pageEnterTime > 0) {
    const duration = Math.round((now - pageEnterTime) / 1000);
    if (duration > 0) {
      addEvent({
        activityType: 'page_view',
        pagePath: currentPage,
        durationSeconds: duration,
      }, false);
    }
  }

  currentPage = path;
  pageEnterTime = now;
}

/**
 * 记录关键行为事件
 *
 * @param activityType 事件类型，与网页版共用一套命名（login/game_start/search/...）
 * @param extraInfo 附加信息，会以 JSON 存入 extra_info 列
 */
function trackEvent(activityType: string, extraInfo?: Record<string, any>) {
  try {
    addEvent({
      activityType,
      pagePath: currentPage || undefined,
      extraInfo,
    });
  } catch { /* 埋点异常不影响业务 */ }
}

/** 心跳：每30秒发送一次活跃信号 */
function heartbeat() {
  addEvent({
    activityType: 'heartbeat',
    pagePath: currentPage || undefined,
    durationSeconds: ANALYTICS_INTERVAL / 1000,
  });
}

/** 启动心跳与定时上报 */
function initAnalytics() {
  if (isInitialized) return;
  isInitialized = true;

  // 生成/恢复会话ID（空转过久则开启新会话）
  touchSession();

  heartbeatTimer = setInterval(heartbeat, ANALYTICS_INTERVAL);
  flushTimer = setInterval(flushEvents, ANALYTICS_INTERVAL);
}

/** 停止埋点并上报剩余事件 */
function stopAnalytics() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushEvents();
  isInitialized = false;
}

/** 立即上报缓冲区中的事件（页面隐藏/卸载时调用，避免小程序被回收导致丢数据） */
function flushNow() {
  try {
    flushEvents();
  } catch { /* ignore */ }
}

/**
 * 页面切换时调用：结算上一页停留时长并开始计时新页面。
 * 由 app.ts 自动注入到每个页面的 onShow，无需各页面手动调用。
 */
function setCurrentPage(path: string) {
  try {
    settleAndEnterPage(path);
  } catch { /* ignore */ }
}

/**
 * 离开当前页面：结算本页停留时长，并停止计时。
 * 由 app.ts 自动注入到每个页面的 onHide，无需各页面手动调用。
 */
function leaveCurrentPage() {
  try {
    settleAndEnterPage('');
  } catch { /* ignore */ }
}

export {
  trackEvent,
  setCurrentPage,
  leaveCurrentPage,
  initAnalytics,
  stopAnalytics,
  flushNow,
  PLATFORM as ANALYTICS_PLATFORM,
};

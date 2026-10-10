/**
 * API 请求封装
 * 统一处理认证token、请求/响应拦截、错误处理
 */

// 注意：小程序启动阶段 getApp() 可能返回 undefined，必须惰性获取
function getAppSafe(): any {
  try {
    return typeof getApp === 'function' ? getApp() : null;
  } catch {
    return null;
  }
}

// baseUrl 配置（必须为已备案的 HTTPS 域名，小程序服务器域名不接受裸 IP 与非 https 请求）
let baseUrl = 'https://mychess.com.cn';

function getBaseUrl(): string {
  return baseUrl;
}

function setBaseUrl(url: string): void {
  baseUrl = url;
}

/**
 * 获取认证头
 */
function getAuthHeaders(): Record<string, string> {
  const app = getAppSafe();
  const token = (app && app.globalData.token) || (wx as any).getStorageSync('auth_token');
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

/**
 * 请求选项
 */
interface RequestOptions {
  timeout?: number;
  enableChunked?: boolean;
  responseType?: 'text' | 'arraybuffer';
  headers?: Record<string, string>;
  abortController?: { abort: () => void };
}

/**
 * 通用请求方法
 */
function request<T = any>(method: string, url: string, data: any = {}, options: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    };

    const requestTask = (wx as any).request({
      url: fullUrl,
      method: method,
      data: data,
      header: headers,
      timeout: options.timeout || 30000,
      enableChunked: options.enableChunked || false,
      responseType: options.responseType || 'text',
      success(res: any) {
        // 401 未授权：仅在「原本已登录」时清理会话并引导重新登录；
        // 游客（本就无 token）不跳转登录页，交由页面的登录引导处理，避免体验被强行打断
        if (res.statusCode === 401) {
          const currentApp = getAppSafe();
          const hadToken = !!(currentApp && currentApp.globalData && currentApp.globalData.token);
          if (currentApp && hadToken) {
            currentApp.setToken(null);
            currentApp.globalData.user = null;
          }
          if (hadToken) {
            wx.removeStorageSync('auth_token');
            wx.removeStorageSync('user_info');
            wx.navigateTo({ url: '/pages/login/login' });
          }
          reject(new Error(res.data?.error || '未登录'));
          return;
        }

        // 处理流式响应（SSE）
        if (options.enableChunked) {
          resolve(res as unknown as T);
          return;
        }

        const body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
          resolve(body as T);
        } else {
          // 透传服务端的 code / benefit：配额型权益不足时上层据此渲染会员升级引导
          const err: any = new Error(body?.error || `请求失败 (${res.statusCode})`);
          err.code = body?.code;
          err.benefit = body?.benefit;
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '网络错误'));
      },
    });

    // 如果传入了 abortController
    if (options.abortController) {
      options.abortController.abort = () => {
        requestTask.abort();
      };
    }
  });
}

/**
 * SSE 流式请求解析器
 */
function sseRequest(url: string, data: any, callbacks: {
  onData?: (chunk: string) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
}): { abort: () => void } {
  const { onData, onError, onDone } = callbacks;
  const fullUrl = `${baseUrl}${url}`;

  const requestTask = (wx as any).request({
    url: fullUrl,
    method: 'POST',
    data: data,
    header: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    enableChunked: true,
    timeout: 120000,
    success(res: any) {
      if (res.statusCode !== 200) {
        onError?.(new Error(`SSE 请求失败 (${res.statusCode})`));
        onDone?.();
      }
    },
    fail(err: any) {
      onError?.(new Error(err.errMsg || 'SSE 网络错误'));
      onDone?.();
    },
  });

  return {
    abort: () => { requestTask.abort(); onDone?.(); },
  };
}

/**
 * 解析SSE数据块
 */
function parseSSEChunk(chunk: string): Array<{ event: string; data: string }> {
  const lines = chunk.split('\n');
  const events: Array<{ event: string; data: string }> = [];
  let currentEvent = 'message';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      events.push({
        event: currentEvent,
        data: line.slice(6).trim(),
      });
    } else if (line === '') {
      currentEvent = 'message';
    }
  }

  return events;
}

// ===== API 方法 =====

// ---- 认证 ----
function login(username: string, password: string): Promise<any> {
  return request('POST', '/api/auth/login', { username, password });
}

/** 忘记密码：发送验证码到邮箱 */
function forgotPassword(email: string): Promise<any> {
  return request('POST', '/api/auth/forgot-password', { email });
}

/** 重置密码：验证码校验 + 设置新密码 */
function resetPassword(email: string, code: string, newPassword: string): Promise<any> {
  return request('POST', '/api/auth/reset-password', { email, code, newPassword });
}

function getCurrentUser(): Promise<any> {
  return request('GET', '/api/auth/me');
}

/**
 * Lichess OAuth 授权 URL（需登录 + 灰度放行，用于浏览器/网页版绑定）
 * 小程序内请改用 lichessBindToken()：web-view 无法加载 lichess.org
 */
function lichessAuth(): Promise<any> {
  return request('GET', '/api/lichess/auth');
}

/** Lichess OAuth 登录 URL（公开入口，未登录也能调用） */
function lichessLogin(): Promise<any> {
  return request('GET', '/api/lichess/login');
}

/**
 * Lichess 集成配置 + 灰度状态
 * 返回 { clientId, redirectUri, scope, featureEnabled, allowed }
 * 入口是否展示必须同时满足 featureEnabled 与 allowed（与网页版一致）
 */
function getLichessConfig(): Promise<any> {
  return request('GET', '/api/lichess/config');
}

/**
 * 创建 Lichess 绑定授权票据（与网页版 /auth 等价的 OAuth 流程，需登录 + 灰度放行）
 *
 * 返回 { ticket, url, expiresIn }：让用户在浏览器打开 url 完成 Lichess 授权，
 * 小程序轮询 lichessMiniAppStatus(ticket) 取绑定结果，全程无需粘贴令牌。
 */
function lichessMiniAppTicket(): Promise<any> {
  return request('POST', '/api/lichess/miniapp/ticket');
}

/**
 * 创建 Lichess 登录授权票据（公开入口，无需登录）
 *
 * 与 lichessLogin() 语义相同，但结果经票据回传，无需浏览器回调页面。
 */
function lichessMiniAppLoginTicket(): Promise<any> {
  return request('POST', '/api/lichess/miniapp/login-ticket');
}

/**
 * 轮询 Lichess 授权结果
 * 返回 { status: 'pending' | 'completed' | 'expired' | 'failed', lichessUsername?, token?, ... }
 */
function lichessMiniAppStatus(ticket: string): Promise<any> {
  return request('GET', '/api/lichess/miniapp/status', { ticket });
}

/**
 * 用 Lichess 个人访问令牌绑定账号（小程序备用入口）
 * 令牌需包含 board:play 与 challenge:write 权限
 */
function lichessBindToken(token: string): Promise<any> {
  return request('POST', '/api/lichess/bind-token', { token });
}

/**
 * 用 Lichess 个人访问令牌登录/注册（小程序备用入口）
 * 等价于 OAuth 登录，但无需浏览器回调
 */
function lichessLoginToken(token: string): Promise<any> {
  return request('POST', '/api/lichess/login-token', { token });
}

/** 检查 Lichess 绑定状态（返回 { bound, lichessUsername?, profile? }） */
function getLichessBinding(): Promise<any> {
  return request('GET', '/api/lichess/me');
}

/** 解除 Lichess 绑定 */
function unbindLichess(): Promise<any> {
  return request('POST', '/api/lichess/unbind');
}

/** 棋桌大厅全局开关（后台系统设置，关闭时仅保留随机匹配） */
function isPvpTableLobbyEnabled(): Promise<any> {
  return request('GET', '/api/settings/pvp-table-lobby-enabled');
}

// ---- 微信小程序登录 ----

/**
 * 微信小程序登录：wx.login 取 code 上报后端换取系统 JWT
 *
 * 后端 code2Session 换 openid → 查找（miniapp_openid / unionid 匹配）/ 创建用户 → 签发 token。
 *
 * @param code    wx.login 获取的登录凭证
 * @param ticket  可选。手机浏览器点「微信登录」生成 URL Scheme 拉起小程序时携带的票据，
 *                上报后后端把登录结果回传给等待中的浏览器页面
 */
function wechatMiniAppLogin(code: string, ticket?: string): Promise<any> {
  return request('POST', '/api/auth/wechat/miniapp/confirm', ticket ? { code, ticket } : { code });
}

/**
 * 注册（支持推荐码）
 * @param refCode 推荐码（可选）
 */
function register(username: string, password: string, email?: string, refCode?: string): Promise<any> {
  return request('POST', '/api/auth/register', { username, password, email, refCode });
}

// ---- 对局 ----
function requestAIMove(fen: string, difficulty: number = 5): Promise<any> {
  return request('POST', '/api/ai-move', { fen, difficulty });
}

function saveGame(data: any): Promise<any> {
  return request('POST', '/api/games', data);
}

function loadGames(params: Record<string, any> = {}): Promise<any> {
  return request('GET', '/api/games', params);
}

function getGameDetail(gameId: string): Promise<any> {
  return request('GET', `/api/games/${gameId}`);
}

function deleteGame(gameId: string): Promise<any> {
  return request('DELETE', `/api/games/${gameId}`);
}

// ---- 分析 ----
function analyzePosition(data: any): Promise<any> {
  return request('POST', '/api/analyze', data);
}

function analyzeMove(data: any): Promise<any> {
  return request('POST', '/api/analyze-move', data);
}

function getAiMoveExplanation(fen: string, uci: string, depth: number = 10): Promise<any> {
  return request('POST', '/api/analyze/explain-last-move', { fen, uci, depth });
}

function getDetailedAnalysis(fen: string, depth: number = 10, multiPv: number = 3): Promise<any> {
  return request('POST', '/api/analyze/detailed', { fen, depth, multiPv });
}

function getPositionCommentary(fen: string, depth: number = 10): Promise<any> {
  return request('POST', '/api/analyze/commentary', { fen, depth });
}

// ---- 棋谱 ----
function listChessRecords(params: Record<string, any> = {}): Promise<any> {
  return request('GET', '/api/records', params);
}

/**
 * 导入棋谱
 * recordType='classroom' 标记为个人录制（课堂/棋盘录制），不进入大师棋谱公共库
 */
function importChessRecords(pgnText: string, recordType?: 'user' | 'classroom'): Promise<any> {
  return request('POST', '/api/records/import', { pgnText, recordType });
}

function deleteRecord(recordId: string): Promise<any> {
  return request('DELETE', `/api/records/${recordId}`);
}

// ---- 个人资料 ----
function getProfile(): Promise<any> {
  return request('GET', '/api/profile');
}

function updateProfile(data: any): Promise<any> {
  return request('PUT', '/api/profile', data);
}

function uploadAvatar(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const token = getAuthHeaders()['Authorization']?.slice(7) || (wx as any).getStorageSync('auth_token');
    (wx as any).uploadFile({
      url: `${baseUrl}/api/profile/avatar`,
      filePath: filePath,
      name: 'avatar',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success(res: any) {
        try {
          const body = JSON.parse(res.data);
          if (body.success) {
            resolve(body);
          } else {
            reject(new Error(body.error || '上传失败'));
          }
        } catch {
          reject(new Error('上传失败'));
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '网络错误'));
      },
    });
  });
}

/**
 * 拍照识别棋盘：上传棋盘照片，由后端视觉模型识别棋子位置
 * 返回 { fen, moves, pieces? }
 */
function recognizeBoardImage(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const token = getAuthHeaders()['Authorization']?.slice(7) || (wx as any).getStorageSync('auth_token');
    (wx as any).uploadFile({
      url: `${baseUrl}/api/records/recognize`,
      filePath: filePath,
      name: 'image',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      // 视觉模型请求耗时较长，uploadFile 默认超时时间较短
      timeout: 60000,
      success(res: any) {
        try {
          const body = JSON.parse(res.data);
          if (body.success) {
            resolve(body);
          } else {
            reject(new Error(body.error || '识别失败'));
          }
        } catch {
          reject(new Error('识别失败'));
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '网络错误'));
      },
    });
  });
}

function changePassword(oldPassword: string, newPassword: string): Promise<any> {
  return request('PUT', '/api/profile/password', { oldPassword, newPassword });
}

function analyzeProfile(): Promise<any> {
  return request('POST', '/api/profile/analyze');
}

// ---- 教练 ----
function askCoachStream(options: {
  fen: string;
  moveHistory: any[];
  question: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest('/api/coach/ask', {
    fen: options.fen,
    moveHistory: options.moveHistory,
    question: options.question,
  }, {
    onEvent: (evt: any) => {
      if (evt.type === 'chunk' && typeof evt.content === 'string') {
        options.onChunk && options.onChunk(evt.content);
      }
    },
    onError: (err: Error) => options.onError && options.onError(err),
    onDone: () => options.onDone && options.onDone(),
  });
}

// ---- 开局百科 ----
function getOpeningEncyclopedia(data: any): Promise<any> {
  return request('POST', '/api/opening/encyclopedia', data);
}

// ===== 棋谱搜索与全网导入 API =====

/**
 * 全网搜索棋谱
 * @param query 搜索关键词（棋手名/对局ID/开局名）
 * @param source 数据源：lichess | chesscom | web
 * @param maxResults 最大结果数
 */
function searchChessGames(query: string, source: string = 'lichess', maxResults: number = 10): Promise<any> {
  return request('POST', '/api/records/search', { query, source, maxResults });
}

/**
 * 从 URL 导入棋谱（支持 Lichess/Chess.com 对局链接或 PGN 文件 URL）
 */
function importChessRecordsFromUrl(url: string): Promise<any> {
  return request('POST', '/api/records/import-from-url', { url });
}

/**
 * 搜索并直接导入到棋谱库
 */
function searchAndImportChessGames(query: string, source: string = 'lichess', maxResults: number = 10): Promise<any> {
  return request('POST', '/api/records/search-and-import', { query, source, maxResults });
}

// ===== 棋谱分析（SSE 流式复盘） =====

/**
 * 整局复盘 SSE — 接收走法历史，逐条回调每步分析结果
 */
function reviewGameStream(
  moveHistory: { uci: string; fenBefore: string }[],
  callbacks: { onReview?: (review: any) => void; onError?: (err: Error) => void; onDone?: () => void },
  depth: number = 10,
  movetime: number = 250,
): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest('/api/analyze/review', {
    moveHistory, depth, movetime,
  }, {
    onEvent: (evt: any) => {
      if (evt.type === 'review' && evt.data) {
        callbacks.onReview && callbacks.onReview({ ...evt.data, progress: evt.progress });
      } else if (evt.type === 'done') {
        callbacks.onDone && callbacks.onDone();
      } else if (evt.type === 'error') {
        callbacks.onError && callbacks.onError(new Error(evt.message));
      }
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

/**
 * SSE 流式局面分析（引擎候选走法 + LLM 文字点评）
 */
function analyzePositionStream(
  fen: string,
  callbacks: {
    onCandidates?: (data: any) => void;
    onChunk?: (chunk: string) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  },
  depth: number = 10,
  multiPv: number = 3,
  movetime: number = 300,
  pgn?: string,
): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest('/api/analyze/stream', {
    fen, depth, multiPv, movetime, pgn,
  }, {
    onEvent: (evt: any) => {
      if (evt.type === 'candidates') {
        callbacks.onCandidates && callbacks.onCandidates(evt.data);
      } else if (evt.type === 'chunk') {
        callbacks.onChunk && callbacks.onChunk(evt.content);
      } else if (evt.type === 'done') {
        callbacks.onDone && callbacks.onDone();
      } else if (evt.type === 'error') {
        callbacks.onError && callbacks.onError(new Error(evt.message));
      }
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

/**
 * SSE 流式 AI 教练讲解（习题讲解、局面讲解等通用）
 */
function explainStream(
  url: string,
  callbacks: {
    onChunk?: (chunk: string) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  },
): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest(url, {}, {
    onEvent: (evt: any) => {
      if (evt.type === 'chunk') {
        callbacks.onChunk && callbacks.onChunk(evt.content);
      } else if (evt.type === 'done') {
        callbacks.onDone && callbacks.onDone();
      } else if (evt.type === 'error') {
        callbacks.onError && callbacks.onError(new Error(evt.message));
      }
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

// ===== 习题（Puzzle）API =====

// ---- 观战（Watch）API ----

/**
 * 获取 Lichess 观战频道列表
 */
function getWatchChannels(): Promise<any> {
  return request('GET', '/api/watch/channels');
}

/**
 * 打开观战 SSE 流（断线自动重连）
 * @param gameId  对局 ID
 * @param callbacks  事件回调
 */
function openWatchStream(
  gameId: string,
  callbacks: {
    onEvent?: (event: any) => void;
    onError?: (err: Error) => void;
    onDone?: () => void;
  }
): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest(`/api/watch/stream/${gameId}`, {}, {
    onEvent: (evt: any) => {
      callbacks.onEvent && callbacks.onEvent(evt);
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

// ---- 每日挑战（Daily Challenge）API ----

/**
 * 获取今日挑战信息
 */
function getDailyChallengeToday(): Promise<any> {
  return request('GET', '/api/daily-challenge/today');
}

/**
 * 开始每日挑战
 */
function startDailyChallenge(data: any): Promise<any> {
  return request('POST', '/api/daily-challenge/start', data);
}

/**
 * 结算每日挑战
 */
function settleDailyChallenge(id: number, data: any): Promise<any> {
  return request('POST', `/api/daily-challenge/${id}/settle`, data);
}

/**
 * 放弃每日挑战
 */
function abandonDailyChallenge(id: number): Promise<any> {
  return request('POST', `/api/daily-challenge/${id}/abandon`);
}

/**
 * 获取每日挑战历史曲线
 */
function getDailyChallengeCurve(): Promise<any> {
  return request('GET', '/api/daily-challenge/curve');
}

// ---- 微信支付 ----

/**
 * 查询微信支付订单状态
 */
function getWechatPayOrderStatus(orderId: string): Promise<any> {
  return request('GET', `/api/wechat-pay/orders/${orderId}/status`);
}

/**
 * 小程序 JSAPI 支付下单
 * 返回微信小程序 wx.requestPayment 所需参数
 */
function createJSAPIPayOrder(orderId: string): Promise<any> {
  return request('POST', `/api/wechat-pay/orders/${orderId}/jsapi`);
}

/**
 * 获取习题主题目录
 */
function getPuzzleThemes(): Promise<any> {
  return request('GET', '/api/puzzles/themes');
}

/**
 * 开始做习题
 */
function startPuzzle(filters?: any): Promise<any> {
  return request('POST', '/api/puzzles/puzzles/start', filters || {});
}

/**
 * 获取习题做题状态
 */
function getAttemptState(attemptId: string): Promise<any> {
  return request('GET', `/api/puzzles/puzzles/attempt/${attemptId}`);
}

/**
 * 提交走子
 */
function submitPuzzleMove(attemptId: string, uci: string): Promise<any> {
  return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/move`, { move: uci });
}

/**
 * 请求提示
 */
function requestPuzzleHint(attemptId: string): Promise<any> {
  return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/hint`);
}

/**
 * 放弃习题
 */
function giveUpPuzzle(attemptId: string): Promise<any> {
  return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/giveup`);
}

/**
 * SSE 流式习题 AI 讲解
 */
function explainPuzzleStream(
  attemptId: string,
  callbacks: { onChunk?: (chunk: string) => void; onDone?: () => void; onError?: (err: Error) => void },
): { abort: () => void } {
  const sse = require('./sse');
  return sse.createSSERequest(`/api/puzzles/puzzles/attempt/${attemptId}/explain`, {}, {
    onEvent: (evt: any) => {
      if (evt.type === 'chunk') {
        callbacks.onChunk && callbacks.onChunk(evt.content);
      } else if (evt.type === 'done') {
        callbacks.onDone && callbacks.onDone();
      } else if (evt.type === 'error') {
        callbacks.onError && callbacks.onError(new Error(evt.message));
      }
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

/**
 * 获取错题本
 */
function getWrongBook(page: number = 1, pageSize: number = 20, includeResolved: boolean = false): Promise<any> {
  return request('GET', '/api/puzzles/wrong-book', { page, pageSize, includeResolved });
}

/**
 * 标记错题已解决
 */
function resolveWrongBook(puzzleId: number): Promise<any> {
  return request('POST', `/api/puzzles/wrong-book/${puzzleId}/resolve`);
}

/**
 * 收藏习题
 */
function addPuzzleFavorite(puzzleId: number): Promise<any> {
  return request('POST', `/api/puzzles/favorites/${puzzleId}`);
}

/**
 * 取消收藏习题
 */
function removePuzzleFavorite(puzzleId: number): Promise<any> {
  return request('DELETE', `/api/puzzles/favorites/${puzzleId}`);
}

/**
 * 获取收藏列表
 */
function getPuzzleFavorites(page: number = 1, pageSize: number = 20): Promise<any> {
  return request('GET', '/api/puzzles/favorites', { page, pageSize });
}

/**
 * 获取习题统计
 */
function getPuzzleStats(): Promise<any> {
  return request('GET', '/api/puzzles/stats');
}

// ===== 会员（Membership）API =====

/**
 * 检查会员系统是否启用
 */
function isMembershipEnabled(): Promise<any> {
  return request('GET', '/api/membership/enabled');
}

/**
 * 获取会员等级与权益信息（未登录可浏览）
 */
function getMembershipLevels(): Promise<any> {
  return request('GET', '/api/membership/levels');
}

/**
 * 获取当前会员状态与配额用量（需登录）
 */
function getMembershipStatus(): Promise<any> {
  return request('GET', '/api/membership/status');
}

/**
 * 获取我的会员订单列表
 */
function getMyMembershipOrders(page: number = 1, limit: number = 10): Promise<any> {
  return request('GET', '/api/membership/orders', { page, limit });
}

/**
 * 创建购买订单
 */
function createMembershipOrder(levelId: number, priceId: number): Promise<any> {
  return request('POST', '/api/membership/orders', { levelId, priceId });
}

/**
 * 模拟支付确认
 */
function payMembershipOrder(orderId: string): Promise<any> {
  return request('POST', `/api/membership/orders/${orderId}/pay`);
}

/**
 * 取消待支付订单
 */
function cancelMembershipOrder(orderId: string): Promise<any> {
  return request('POST', `/api/membership/orders/${orderId}/cancel`);
}

/**
 * 兑换码开通/续费会员
 */
function redeemMembershipCode(code: string): Promise<any> {
  return request('POST', '/api/membership/redeem', { code });
}

// ===== 训练计划 API =====

/**
 * 获取个性化训练推荐（基于棋手分析的习题训练计划 + 对局难度推荐）
 */
function getTrainingPlan(): Promise<any> {
  return request('GET', '/api/profile/training-plan');
}

/**
 * 获取训练跟踪统计数据（经验值/等级/连续打卡/成就等）
 */
function getTrainingStats(): Promise<any> {
  return request('GET', '/api/profile/training-stats');
}

// ===== AI 定级测评 API =====

/**
 * 获取定级问卷
 */
function getAssessmentQuestionnaire(): Promise<any> {
  return request('GET', '/api/assessment/questionnaire');
}

/**
 * 创建定级会话
 */
function startAssessment(answers: Record<string, string>, mode: string): Promise<any> {
  return request('POST', '/api/assessment/start', { answers, mode });
}

/**
 * 提交习题定级结果，返回定级报告
 */
function submitPuzzleResults(assessmentId: number, results: any[]): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/submit-puzzles`, { results });
}

/**
 * 三步向导式：提交习题结果，仅保存中间结果不生成报告。
 * 返回 { puzzleElo, suggestedDifficulty } 供对弈阶段使用。
 */
function submitPuzzleResultsForFullFlow(assessmentId: number, results: any[]): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/submit-puzzles`, { results, flow: 'three-step' });
}

/**
 * 查询进行中的定级会话（页面刷新恢复用，无则返回 null）
 */
function getCurrentAssessment(): Promise<any> {
  return request('GET', '/api/assessment/current');
}

/**
 * 提交对弈复盘指标，返回定级报告
 */
function submitGameMetrics(assessmentId: number, submission: any): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/submit-game`, submission);
}

/**
 * 提交多局综合复盘指标，返回定级报告
 */
function submitMultiGameMetrics(assessmentId: number, games: any[]): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/submit-multi-game`, { games });
}

/**
 * 自适应取下一题
 */
function getAdaptiveNextPuzzle(assessmentId: number, lastResult: any): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/next-puzzle`, { lastResult: lastResult || null });
}

/**
 * 历史定级报告列表
 */
function getAssessmentHistory(): Promise<any> {
  return request('GET', '/api/assessment/history');
}

/**
 * 读取单份定级报告
 */
function getAssessmentReport(assessmentId: number): Promise<any> {
  return request('GET', `/api/assessment/${assessmentId}`);
}

/**
 * 放弃进行中的定级
 */
function abandonAssessment(assessmentId: number): Promise<any> {
  return request('POST', `/api/assessment/${assessmentId}/abandon`);
}

/**
 * 在已有报告基础上再测一次
 */
function retakeAssessment(previousAssessmentId: number, mode: string): Promise<any> {
  return request('POST', `/api/assessment/${previousAssessmentId}/retake`, { mode });
}

/**
 * 获取已保存的棋手分析结果（不重新分析）
 */
function getSavedProfileAnalysis(): Promise<any> {
  return request('GET', '/api/profile/analyze');
}

/* ==================== 管理后台：数据监控与统计分析 ==================== */

/**
 * 管理端仪表盘汇总（今日指标 + 系统总览）
 */
function getAdminDashboard(): Promise<any> {
  return request('GET', '/api/admin/dashboard');
}

/**
 * 管理端近 N 日趋势（新注册/登录/对局用户）
 */
function getAdminTrend(days: number = 7): Promise<any> {
  return request('GET', '/api/admin/dashboard/trend', { days });
}

/**
 * 管理端统计分析（对局结果/难度分布、30日趋势、模块时长）
 */
function getAdminStats(): Promise<any> {
  return request('GET', '/api/admin/stats');
}

/**
 * 管理端系统日志（分页，支持操作类型与日期筛选）
 */
function getAdminLogs(params: { page?: number; limit?: number; activityType?: string; dateFrom?: string; dateTo?: string } = {}): Promise<any> {
  return request('GET', '/api/admin/logs', params);
}

/**
 * 管理端日志统计
 */
function getAdminLogStats(params: { dateFrom?: string; dateTo?: string } = {}): Promise<any> {
  return request('GET', '/api/admin/logs/stats', params);
}

/**
 * 管理端用户明细（数据监控用）
 * 支持日期范围、用户名模糊查询、列排序
 */
function getAdminUsersDetail(params: {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  dateField?: 'register' | 'login';
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
} = {}): Promise<any> {
  return request('GET', '/api/admin/users/detail', params);
}

// ═══════════════════════════════════════════════════════════════
// 以下为从网页版补充的 API 函数
// ═══════════════════════════════════════════════════════════════

// ---- 对局扩展 ----
function loadGame(gameId: string): Promise<any> {
  return request('GET', `/api/games/${gameId}`);
}

function saveInProgressGame(data: any): Promise<any> {
  return request('POST', '/api/games/save-in-progress', data);
}

function getInProgressGame(): Promise<any> {
  return request('GET', '/api/games/in-progress');
}

function deleteInProgressGame(gameId: string): Promise<any> {
  return request('DELETE', `/api/games/${gameId}`);
}

function completeInProgressGame(gameId: string, result: string, pgn: string, timeControl?: any): Promise<any> {
  return request('PUT', `/api/games/${gameId}/complete`, { result, pgn, timeControl });
}

// ---- 棋谱扩展 ----
function getRecordAnalyses(ids: number[]): Promise<any> {
  return request('POST', '/api/records/analyses', { ids });
}

function getRecordDetail(id: number): Promise<any> {
  return request('GET', `/api/records/${id}`);
}

function getRecordDataSources(): Promise<any> {
  return request('GET', '/api/admin/records/sources');
}

function addRecordDataSource(input: any): Promise<any> {
  return request('POST', '/api/admin/records/sources', input);
}

function deleteRecordDataSource(id: number): Promise<any> {
  return request('DELETE', `/api/admin/records/sources/${id}`);
}

function triggerRecordAutoUpdate(): Promise<any> {
  return request('POST', '/api/admin/records/auto-update');
}

// ---- 知识库 ----
function triggerLearning(): Promise<any> {
  return request('POST', '/api/knowledge/learn');
}

function getKnowledgeStatus(): Promise<any> {
  return request('GET', '/api/knowledge/status');
}

// ---- 深度复盘 ----
function deepReviewGameStream(
  moveHistory: any[],
  callbacks: { onEngine?: (data: any) => void; onLLM?: (data: any) => void; onSummary?: (data: any) => void; onLlmError?: (message: string) => void; onDone?: () => void; onError?: (err: Error) => void },
  depth: number = 12,
  movetime: number = 250,
  playerSide?: 'w' | 'b',
): { abort: () => void } {
  const sse = require('./sse');
  const payload: any = { moveHistory, depth, movetime };
  // 传入执棋方后 LLM 始终站在学员（我方）视角分析
  if (playerSide) payload.playerSide = playerSide === 'b' ? 'black' : 'white';
  return sse.createSSERequest('/api/analyze/deep-review', payload, {
    onEvent: (evt: any) => {
      if (evt.type === 'engine') {
        callbacks.onEngine && callbacks.onEngine({ ...evt.data, progress: evt.progress || 0 });
      } else if (evt.type === 'llm') {
        callbacks.onLLM && callbacks.onLLM(evt.data);
      } else if (evt.type === 'summary') {
        callbacks.onSummary && callbacks.onSummary(evt.data);
      } else if (evt.type === 'llm_error') {
        callbacks.onLlmError && callbacks.onLlmError(evt.message);
      } else if (evt.type === 'done') {
        callbacks.onDone && callbacks.onDone();
      } else if (evt.type === 'error') {
        callbacks.onError && callbacks.onError(new Error(evt.message));
      }
    },
    onError: (err: Error) => callbacks.onError && callbacks.onError(err),
    onDone: () => callbacks.onDone && callbacks.onDone(),
  });
}

function loadDeepReview(gameId?: number | null, recordId?: number | null): Promise<any> {
  const params: any = {};
  if (gameId) params.gameId = gameId;
  if (recordId) params.recordId = recordId;
  return request('GET', '/api/analyze/deep-review/load', params);
}

function saveDeepReview(gameId: number | null, recordId: number | null, moveReviews: any[], gameSummary: any): Promise<any> {
  return request('POST', '/api/analyze/deep-review/save', {
    gameId, recordId, moveReviews, gameSummary,
  });
}

function deleteDeepReview(gameId: number | null, recordId: number | null): Promise<any> {
  return request('DELETE', '/api/analyze/deep-review', { gameId, recordId });
}

// ---- 概念提示 ----
function getConceptHint(fen: string, depth?: number): Promise<any> {
  return request('POST', '/api/analyze/concept-hint', { fen, depth });
}

// ---- 用户自建习题 ----
function createUserPuzzle(data: any): Promise<any> {
  return request('POST', '/api/user-puzzles', data);
}

function batchCreateUserPuzzles(puzzles: any[]): Promise<any> {
  return request('POST', '/api/user-puzzles/batch', { puzzles });
}

function getUserPuzzles(filters?: any): Promise<any> {
  return request('GET', '/api/user-puzzles', filters);
}

function getDueReviews(limit?: number): Promise<any> {
  return request('GET', '/api/user-puzzles/due', { limit });
}

function getUserPuzzleStats(): Promise<any> {
  return request('GET', '/api/user-puzzles/stats');
}

function getUserPuzzleDetail(id: number): Promise<any> {
  return request('GET', `/api/user-puzzles/${id}`);
}

function solveUserPuzzle(id: number, correct: boolean): Promise<any> {
  return request('POST', `/api/user-puzzles/${id}/solve`, { correct });
}

function deleteUserPuzzle(id: number): Promise<any> {
  return request('DELETE', `/api/user-puzzles/${id}`);
}

function batchDeleteUserPuzzles(ids: number[]): Promise<any> {
  return request('POST', '/api/user-puzzles/batch-delete', { ids });
}

// ---- 每周主题 ----
function getCurrentWeeklyTheme(): Promise<any> {
  return request('GET', '/api/weekly-themes/current');
}

function getWeeklyThemePuzzles(themeKey: string, limit?: number): Promise<any> {
  return request('GET', '/api/weekly-themes/current/puzzles', { themeKey, limit });
}

// ---- 训练扩展 ----
function getUpgradePlan(): Promise<any> {
  return request('GET', '/api/profile/upgrade-plan');
}

function getTrainingDashboard(): Promise<any> {
  return request('GET', '/api/profile/training-dashboard');
}

function saveGradeSettings(currentGrade: string, targetGrade: string): Promise<any> {
  return request('POST', '/api/profile/upgrade-plan/settings', { currentGrade, targetGrade });
}

function saveMistakesFromReview(data: any): Promise<any> {
  return request('POST', '/api/profile/mistakes/save', data);
}

function getMistakeSummary(): Promise<any> {
  return request('GET', '/api/profile/mistakes/active');
}

function getMistakeMatchingPuzzles(limit?: number): Promise<any> {
  return request('GET', '/api/profile/mistakes/puzzles', { limit });
}

function getTrainingCenterData(today?: string): Promise<any> {
  const params: Record<string, any> = {};
  if (today) params.today = today;
  return request('GET', '/api/profile/training-center', params);
}

function triggerDynamicAssessment(): Promise<any> {
  return request('POST', '/api/profile/dynamic-assessment');
}

function getWeeklyPlan(refresh?: boolean, today?: string): Promise<any> {
  const params: Record<string, any> = { refresh: refresh ? 1 : undefined };
  if (today) params.today = today;
  return request('GET', '/api/profile/weekly-plan', params);
}

/** 读取已缓存的周训练报告（不触发 AI 生成）；无缓存返回 null */
function getWeeklyReport(week?: string): Promise<any> {
  const params: Record<string, any> = {};
  if (week) params.week = week;
  return request('GET', '/api/profile/weekly-report', params);
}

/** 生成该周的 AI 训练报告（refresh=true 忽略缓存重新生成） */
function generateWeeklyReport(week?: string, refresh?: boolean): Promise<any> {
  const body: Record<string, any> = {};
  if (week) body.week = week;
  if (refresh) body.refresh = true;
  return request('POST', '/api/profile/weekly-report', body, { timeout: 120000 });
}

function submitWeeklyEvaluation(data: any): Promise<any> {
  return request('POST', '/api/profile/weekly-evaluation', data);
}

function getWeeklyEvaluations(): Promise<any> {
  return request('GET', '/api/profile/weekly-evaluations');
}

/** 今日题目清单：优先「我的习题」到期复习，不足时从错题本按弱项主题+难度补齐 */
function getTodayTrainingPuzzles(today?: string): Promise<any> {
  const params: Record<string, any> = {};
  if (today) params.today = today;
  return request('GET', '/api/profile/today-puzzles', params);
}

// ===== 偏好日志（同网页版 preferenceLogService） =====
/** 写入一条下棋偏好事件（流水表），后端聚合到画像表并触发提醒/表扬 */
function logPreferenceEvent(event: Record<string, any>): Promise<any> {
  return request('POST', '/api/profile/preference-log/event', event);
}
/** 获取用户偏好画像（聚合结果：强项/弱项/习惯等） */
function getPreferenceProfile(): Promise<any> {
  return request('GET', '/api/profile/preference-log/profile');
}
/** 获取教练提示（提醒常犯错误/表扬好习惯），后端自带节流 */
function fetchCoachHint(polarity: 'mistake' | 'good'): Promise<any> {
  return request('GET', '/api/profile/coach-hint', { polarity });
}

// ---- 全局开关 ----
function isDistributionEnabled(): Promise<any> {
  return request('GET', '/api/settings/distribution-enabled');
}

function isVideoGenerationEnabled(): Promise<any> {
  return request('GET', '/api/settings/video-generation-enabled');
}

function isAIAnalysisReportEnabled(): Promise<any> {
  return request('GET', '/api/settings/ai-analysis-report-enabled');
}

function getMembershipToggle(): Promise<any> {
  return request('GET', '/api/admin/settings/membership-enabled');
}

function setMembershipToggle(enabled: boolean): Promise<any> {
  return request('PUT', '/api/admin/settings/membership-enabled', { enabled });
}

function getAdminVideoGenerationToggle(): Promise<any> {
  return request('GET', '/api/admin/settings/video-generation-enabled');
}

function setAdminVideoGenerationToggle(enabled: boolean): Promise<any> {
  return request('PUT', '/api/admin/settings/video-generation-enabled', { enabled });
}

function getAdminAIAnalysisToggle(): Promise<any> {
  return request('GET', '/api/admin/settings/ai-analysis-report-enabled');
}

function setAdminAIAnalysisToggle(enabled: boolean): Promise<any> {
  return request('PUT', '/api/admin/settings/ai-analysis-report-enabled', { enabled });
}

function getAdminDistributionToggle(): Promise<any> {
  return request('GET', '/api/admin/settings/distribution-enabled');
}

function setAdminDistributionToggle(enabled: boolean): Promise<any> {
  return request('PUT', '/api/admin/settings/distribution-enabled', { enabled });
}

// ---- 视频生成 ----
function generateGameVideo(ids: any, config?: any): Promise<any> {
  return request('POST', '/api/video/generate', { ...ids, config });
}

function getVideoStatus(taskId: string): Promise<any> {
  return request('GET', `/api/video/status/${taskId}`);
}

function getVideoDownloadUrl(taskId: string): string {
  return `${getBaseUrl()}/api/video/download/${taskId}`;
}

function getVideoVoices(): Promise<any> {
  return request('GET', '/api/video/voices');
}

function resumeVideoGeneration(taskId: string): Promise<any> {
  return request('POST', `/api/video/resume/${taskId}`);
}

function getCompletedVideoTasks(): Promise<any> {
  return request('GET', '/api/video/completed');
}

// ---- AI 棋手 ----
function getEnabledAiBots(): Promise<any> {
  return request('GET', '/api/ai-bots/enabled');
}

function startAiBotMatch(botId: number, userSide?: string, timeControl?: any): Promise<any> {
  return request('POST', '/api/ai-bots/start-match', { botId, userSide, timeControl });
}

function getMyAiBotGames(): Promise<any> {
  return request('GET', '/api/ai-bots/my-games');
}

function getAdminAiBots(): Promise<any> {
  return request('GET', '/api/admin/ai-bots');
}

function getAdminAiBot(id: number): Promise<any> {
  return request('GET', `/api/admin/ai-bots/${id}`);
}

function createAdminAiBot(data: any): Promise<any> {
  return request('POST', '/api/admin/ai-bots', data);
}

function updateAdminAiBot(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/ai-bots/${id}`, data);
}

function deleteAdminAiBot(id: number): Promise<any> {
  return request('DELETE', `/api/admin/ai-bots/${id}`);
}

function toggleAdminAiBot(id: number): Promise<any> {
  return request('PATCH', `/api/admin/ai-bots/${id}/toggle`);
}

function generateAdminAiBots(request: any): Promise<any> {
  return request('POST', '/api/admin/ai-bots/generate', request);
}

function batchOnlineAiBots(count: number): Promise<any> {
  return request('POST', '/api/admin/ai-bots/batch-online', { count });
}

function batchOfflineAiBots(count: number): Promise<any> {
  return request('POST', '/api/admin/ai-bots/batch-offline', { count });
}

function batchDeleteAiBots(count: number): Promise<any> {
  return request('POST', '/api/admin/ai-bots/batch-delete', { count });
}

// ---- 分销（用户端） ----
function getMyDistributionProfile(): Promise<any> {
  return request('GET', '/api/distribution/my-profile');
}

function activateDistributor(): Promise<any> {
  return request('POST', '/api/distribution/activate');
}

function getMyReferralInfo(): Promise<any> {
  return request('GET', '/api/distribution/referral-info');
}

function regenerateReferralCode(): Promise<any> {
  return request('POST', '/api/distribution/referral-code/regenerate');
}

function getMyCommissions(page: number = 1, limit: number = 20, status?: string): Promise<any> {
  return request('GET', '/api/distribution/commissions', { page, limit, status });
}

function getMyCommissionSummary(): Promise<any> {
  return request('GET', '/api/distribution/commissions/summary');
}

function getMyTeam(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/distribution/team', { page, limit });
}

function createWithdrawalRequest(amount: number, paymentType: string, accountInfo: string): Promise<any> {
  return request('POST', '/api/distribution/withdrawals', { amount, paymentType, accountInfo });
}

function getMyWithdrawals(page: number = 1, limit: number = 20, status?: string): Promise<any> {
  return request('GET', '/api/distribution/withdrawals', { page, limit, status });
}

// ---- 分销（管理端） ----
function getDistributionSettings(): Promise<any> {
  return request('GET', '/api/admin/distribution/settings');
}

function updateDistributionSettings(settings: any): Promise<any> {
  return request('PUT', '/api/admin/distribution/settings', settings);
}

function getDistributionStats(): Promise<any> {
  return request('GET', '/api/admin/distribution/stats');
}

function getDistributors(page: number = 1, limit: number = 20, search?: string, status?: number): Promise<any> {
  const params: any = { page, limit };
  if (search) params.search = search;
  if (status !== undefined) params.status = status;
  return request('GET', '/api/admin/distribution/distributors', params);
}

function getDistributorDetail(userId: number): Promise<any> {
  return request('GET', `/api/admin/distribution/distributors/${userId}`);
}

function toggleDistributorStatus(userId: number, status: number, reason: string): Promise<any> {
  return request('PUT', `/api/admin/distribution/distributors/${userId}/status`, { status, reason });
}

function getCommissionRules(): Promise<any> {
  return request('GET', '/api/admin/distribution/commission-rules');
}

function createCommissionRule(rule: any): Promise<any> {
  return request('POST', '/api/admin/distribution/commission-rules', rule);
}

function updateCommissionRule(id: number, rule: any): Promise<any> {
  return request('PUT', `/api/admin/distribution/commission-rules/${id}`, rule);
}

function deleteCommissionRule(id: number): Promise<any> {
  return request('DELETE', `/api/admin/distribution/commission-rules/${id}`);
}

function getAdminCommissionRecords(page: number = 1, limit: number = 20, status?: string, levelId?: number): Promise<any> {
  const params: any = { page, limit };
  if (status) params.status = status;
  if (levelId) params.levelId = levelId;
  return request('GET', '/api/admin/distribution/commissions', params);
}

function settleCommissionManually(orderId: string): Promise<any> {
  return request('POST', '/api/admin/distribution/commissions/settle', { orderId });
}

function getAdminWithdrawals(page: number = 1, limit: number = 20, status?: string): Promise<any> {
  const params: any = { page, limit };
  if (status) params.status = status;
  return request('GET', '/api/admin/distribution/withdrawals', params);
}

function approveWithdrawal(id: number, note?: string): Promise<any> {
  return request('POST', `/api/admin/distribution/withdrawals/${id}/approve`, { note });
}

function rejectWithdrawal(id: number, reason: string): Promise<any> {
  return request('POST', `/api/admin/distribution/withdrawals/${id}/reject`, { reason });
}

function completeWithdrawal(id: number): Promise<any> {
  return request('POST', `/api/admin/distribution/withdrawals/${id}/complete`);
}

// ---- 意见反馈 ----
function submitFeedback(data: any): Promise<any> {
  return request('POST', '/api/feedback', data);
}

function getMyFeedback(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/feedback', { page, limit });
}

function getFeedbackDetail(id: number): Promise<any> {
  return request('GET', `/api/feedback/${id}`);
}

function replyToFeedback(id: number, content: string): Promise<any> {
  return request('POST', `/api/feedback/${id}/reply`, { content });
}

function getAdminFeedback(page: number = 1, limit: number = 20, status?: string, type?: string): Promise<any> {
  const params: any = { page, limit };
  if (status) params.status = status;
  if (type) params.type = type;
  return request('GET', '/api/admin/feedback', params);
}

function getAdminFeedbackReplies(id: number): Promise<any> {
  return request('GET', `/api/admin/feedback/${id}/replies`);
}

function replyFeedback(id: number, reply: string, status?: string): Promise<any> {
  return request('POST', `/api/admin/feedback/${id}/reply`, { reply, status });
}

function getFeedbackStats(): Promise<any> {
  return request('GET', '/api/admin/feedback/stats');
}

function getAdminFeedbackList(): Promise<any> {
  return request('GET', '/api/admin/feedback/list');
}

// ---- 问卷调查 ----
function getPendingSurvey(): Promise<any> {
  return request('GET', '/api/surveys/pending');
}

function submitSurveyResponse(surveyId: number, answers: any): Promise<any> {
  return request('POST', `/api/surveys/${surveyId}/respond`, { answers });
}

function skipSurvey(surveyId: number, skipType: string): Promise<any> {
  return request('POST', `/api/surveys/${surveyId}/skip`, { skipType });
}

function getAdminSurveys(page: number = 1, limit: number = 20, status?: string): Promise<any> {
  const params: any = { page, limit };
  if (status) params.status = status;
  return request('GET', '/api/admin/surveys', params);
}

function getAdminSurveyDetail(id: number): Promise<any> {
  return request('GET', `/api/admin/surveys/${id}`);
}

function createSurvey(data: any): Promise<any> {
  return request('POST', '/api/admin/surveys', data);
}

function updateSurvey(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/surveys/${id}`, data);
}

function deleteSurvey(id: number): Promise<any> {
  return request('DELETE', `/api/admin/surveys/${id}`);
}

function getSurveyStats(id: number): Promise<any> {
  return request('GET', `/api/admin/surveys/${id}/stats`);
}

function getSurveyResponses(id: number, page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', `/api/admin/surveys/${id}/responses`, { page, limit });
}

function aiGenerateSurvey(purpose: string, requirements: string | undefined, questionCount: number | undefined): Promise<any> {
  return request('POST', '/api/admin/surveys/ai-generate', { purpose, requirements, questionCount });
}

function deleteAdminSurvey(id: number): Promise<any> {
  return request('DELETE', `/api/admin/surveys/${id}`);
}

// ---- 即时消息 ----
function sendMessage(data: any): Promise<any> {
  return request('POST', '/api/messages', data);
}

function getMessageSessions(): Promise<any> {
  return request('GET', '/api/messages');
}

function getConversation(userId: number): Promise<any> {
  return request('GET', `/api/messages/${userId}`);
}

function getUnreadCount(): Promise<any> {
  return request('GET', '/api/messages/unread-count');
}

// ---- 好友系统 ----
function sendFriendRequest(toUserId: number, message?: string): Promise<any> {
  return request('POST', '/api/friends/request', { toUserId, message });
}

function acceptFriendRequest(requestId: number): Promise<any> {
  return request('POST', `/api/friends/accept/${requestId}`);
}

function rejectFriendRequest(requestId: number): Promise<any> {
  return request('POST', `/api/friends/reject/${requestId}`);
}

function getFriendList(): Promise<any> {
  return request('GET', '/api/friends');
}

function getFriendRequests(): Promise<any> {
  return request('GET', '/api/friends/requests');
}

function removeFriend(userId: number): Promise<any> {
  return request('DELETE', `/api/friends/${userId}`);
}

function searchUsers(q: string): Promise<any> {
  return request('GET', '/api/users/search', { q });
}

// ---- 好友对弈挑战 / 邀请链接 ----

/**
 * 创建好友挑战。
 * 带 toUserId：定向挑战在线好友；不带：生成分享 token（邀请链接/小程序码用）。
 */
function createFriendChallenge(timeControl: any, toUserId?: number): Promise<any> {
  const body: any = { timeControl };
  if (toUserId != null) body.toUserId = toUserId;
  return request('POST', '/api/friend-challenges', body);
}

/** 兑换分享链接：自动成为双向好友，返回发起方资料与时限 */
function redeemShareToken(token: string): Promise<any> {
  return request('GET', `/api/friend-challenges/token/${encodeURIComponent(token)}`);
}

/** 撤销自己发起的挑战（分享链接未兑换时也可作废） */
function cancelFriendChallenge(id: number): Promise<any> {
  return request('POST', `/api/friend-challenges/${id}/cancel`);
}

/**
 * 取挑战的邀请物料：小程序码（base64）+ 可复制链接。
 * 微信侧生成失败时降级为字段级错误（qrError / urlLinkError），仍返回 200。
 */
function getFriendChallengeShareCode(id: number): Promise<any> {
  return request('GET', `/api/friend-challenges/${id}/share-code`);
}

// ---- 群组系统 ----
function createGroup(name: string, description?: string, memberIds?: number[]): Promise<any> {
  return request('POST', '/api/groups', { name, description, memberIds });
}

function getUserGroups(): Promise<any> {
  return request('GET', '/api/groups');
}

function getGroupDetail(groupId: number): Promise<any> {
  return request('GET', `/api/groups/${groupId}`);
}

function updateGroup(groupId: number, data: any): Promise<any> {
  return request('PUT', `/api/groups/${groupId}`, data);
}

function deleteGroup(groupId: number): Promise<any> {
  return request('DELETE', `/api/groups/${groupId}`);
}

function addGroupMembers(groupId: number, memberIds: number[]): Promise<any> {
  return request('POST', `/api/groups/${groupId}/members`, { memberIds });
}

function removeGroupMember(groupId: number, userId: number): Promise<any> {
  return request('DELETE', `/api/groups/${groupId}/members/${userId}`);
}

function updateMemberRole(groupId: number, userId: number, role: string): Promise<any> {
  return request('PUT', `/api/groups/${groupId}/members/${userId}`, { role });
}

function getGroupMessages(groupId: number, page: number = 1, limit: number = 50): Promise<any> {
  return request('GET', `/api/groups/${groupId}/messages`, { page, limit });
}

function sendGroupMessage(groupId: number, content: string, type?: string): Promise<any> {
  return request('POST', `/api/groups/${groupId}/messages`, { groupId, content, type });
}

// ---- 快捷短语与表情 ----
function getQuickPhrases(): Promise<any> {
  return request('GET', '/api/quick-phrases');
}

function getEmojis(): Promise<any> {
  return request('GET', '/api/emojis');
}

// ---- 教师与课件 ----
function getTeacherStatus(): Promise<any> {
  return request('GET', '/api/teacher/status');
}

function applyTeacher(data: any): Promise<any> {
  return request('POST', '/api/teacher/apply', data);
}

function listCoursewares(): Promise<any> {
  return request('GET', '/api/coursewares');
}

function createCourseware(data: any): Promise<any> {
  return request('POST', '/api/coursewares', data);
}

function getCoursewareDetail(id: number): Promise<any> {
  return request('GET', `/api/coursewares/${id}`);
}

function updateCourseware(id: number, data: any): Promise<any> {
  return request('PUT', `/api/coursewares/${id}`, data);
}

function deleteCourseware(id: number): Promise<any> {
  return request('DELETE', `/api/coursewares/${id}`);
}

function addCoursewareItem(coursewareId: number, itemId: number, itemType: string, note?: string): Promise<any> {
  return request('POST', `/api/coursewares/${coursewareId}/items`, { itemId, itemType, note });
}

function removeCoursewareItem(coursewareId: number, itemId: number): Promise<any> {
  return request('DELETE', `/api/coursewares/${coursewareId}/items/${itemId}`);
}

function updateCoursewareItemNote(coursewareId: number, itemId: number, note: string): Promise<any> {
  return request('PUT', `/api/coursewares/${coursewareId}/items/${itemId}`, { note });
}

function reorderCoursewareItems(coursewareId: number, itemIds: number[]): Promise<any> {
  return request('POST', `/api/coursewares/${coursewareId}/items/reorder`, { itemIds });
}

function getAdminTeacherApplications(page: number = 1, limit: number = 20, status?: string): Promise<any> {
  const params: any = { page, limit };
  if (status) params.status = status;
  return request('GET', '/api/admin/teachers/applications', params);
}

function getAdminTeacherApplicationCounts(): Promise<any> {
  return request('GET', '/api/admin/teachers/application-counts');
}

function reviewAdminTeacherApplication(applicationId: number, status: string, note?: string): Promise<any> {
  return request('POST', `/api/admin/teachers/applications/${applicationId}/review`, { status, note });
}

function getAdminTeachers(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/admin/teachers', { page, limit });
}

function revokeAdminTeacher(userId: number): Promise<any> {
  return request('POST', `/api/admin/teachers/${userId}/revoke`);
}

function approveTeacher(id: number): Promise<any> {
  return request('PATCH', `/api/admin/teachers/${id}/approve`);
}

function rejectTeacher(id: number): Promise<any> {
  return request('PATCH', `/api/admin/teachers/${id}/reject`);
}

// ---- 龙币（用户端） ----
function getDragonCoinBalance(): Promise<any> {
  return request('GET', '/api/dragon-coin/balance');
}

function getDragonCoinLedger(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/dragon-coin/ledger', { page, limit });
}

function getDragonCoinConfigs(): Promise<any> {
  return request('GET', '/api/dragon-coin/configs');
}

function getDragonCoinExchanges(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/dragon-coin/exchanges', { page, limit });
}

function exchangeDragonCoin(configId: number, amount: number): Promise<any> {
  return request('POST', '/api/dragon-coin/exchange', { configId, amount });
}

function getDragonCoinExchangeRecords(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/dragon-coin/exchange-records', { page, limit });
}

// ---- 龙币商店（与网页版共用后端） ----
function getDragonCoinShop(): Promise<any> {
  return request('GET', '/api/dragon-coin/shop');
}

function purchaseDragonCoinShop(goodsCode: string): Promise<any> {
  return request('POST', `/api/dragon-coin/shop/purchase/${goodsCode}`);
}

function consumeDragonCoinShop(goodsCode: string): Promise<any> {
  return request('POST', `/api/dragon-coin/shop/consume/${goodsCode}`);
}

// ---- 龙币任务（奖励中心） ----
function getDragonCoinTasks(): Promise<any> {
  return request('GET', '/api/dragon-coin/tasks');
}

// ---- 龙币连击 ----
function repairStreak(): Promise<any> {
  return request('POST', '/api/dragon-coin/streak/repair');
}

function freezeStreak(): Promise<any> {
  return request('POST', '/api/dragon-coin/streak/freeze');
}

// ---- 龙币（管理端） ----
function getAdminDragonCoinConfigs(): Promise<any> {
  return request('GET', '/api/admin/dragon-coin/configs');
}

function createDragonCoinConfig(data: any): Promise<any> {
  return request('POST', '/api/admin/dragon-coin/configs', data);
}

function updateDragonCoinConfig(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/dragon-coin/configs/${id}`, data);
}

function deleteDragonCoinConfig(id: number): Promise<any> {
  return request('DELETE', `/api/admin/dragon-coin/configs/${id}`);
}

function getAdminDragonCoinExchanges(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/admin/dragon-coin/exchanges', { page, limit });
}

function createDragonCoinExchange(data: any): Promise<any> {
  return request('POST', '/api/admin/dragon-coin/exchanges', data);
}

function updateDragonCoinExchange(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/dragon-coin/exchanges/${id}`, data);
}

function deleteDragonCoinExchange(id: number): Promise<any> {
  return request('DELETE', `/api/admin/dragon-coin/exchanges/${id}`);
}

function getAdminDragonCoinExchangeRecords(page: number = 1, limit: number = 20): Promise<any> {
  return request('GET', '/api/admin/dragon-coin/exchange-records', { page, limit });
}

function getAdminDragonCoinUserBalance(userId: number): Promise<any> {
  return request('GET', `/api/admin/dragon-coin/users/${userId}/balance`);
}

function adjustDragonCoinBalance(userId: number, amount: number, reason: string): Promise<any> {
  return request('POST', `/api/admin/dragon-coin/users/${userId}/balance/adjust`, { amount, reason });
}

function getAdminDragonCoinStats(): Promise<any> {
  return request('GET', '/api/admin/dragon-coin/stats');
}

// ---- 管理后台扩展 ----
function getAdminDayStats(date: string): Promise<any> {
  return request('GET', '/api/admin/dashboard/day-stats', { date });
}

function getAdminUsers(page: number = 1, limit: number = 20, search?: string, levelId?: number, sortField?: string, sortOrder?: string): Promise<any> {
  return request('GET', '/api/admin/users', { page, limit, search, levelId, sortField, sortOrder });
}

function getAdminUserDetail(userId: number): Promise<any> {
  return request('GET', `/api/admin/users/${userId}`);
}

function updateAdminUserRole(userId: number, role: string): Promise<any> {
  return request('PUT', `/api/admin/users/${userId}`, { role });
}

function updateAdminUserTeacherStatus(userId: number, status: string): Promise<any> {
  return request('PUT', `/api/admin/users/${userId}`, { teacherStatus: status });
}

function adminResetPassword(userId: number, adminPassword: string, newPassword: string): Promise<any> {
  return request('POST', `/api/admin/users/${userId}/reset-password`, { adminPassword, newPassword });
}

function getAdminUserActivity(userId: number, days: number = 7, dateFrom?: string, dateTo?: string): Promise<any> {
  return request('GET', `/api/admin/users/${userId}/activity`, { days, dateFrom, dateTo });
}

function getAdminUserActivityModules(userId: number, dateFrom?: string, dateTo?: string): Promise<any> {
  return request('GET', `/api/admin/users/${userId}/activity-modules`, { dateFrom, dateTo });
}

function getAdminGames(page: number = 1, limit: number = 20, filters?: any): Promise<any> {
  return request('GET', '/api/admin/games', { page, limit, ...filters });
}

function getAdminGameDetail(gameId: number): Promise<any> {
  return request('GET', `/api/admin/games/${gameId}`);
}

function getAdminModuleStats(): Promise<any> {
  return request('GET', '/api/admin/stats/modules');
}

function getAdminExtendedStats(days: number = 30): Promise<any> {
  return request('GET', '/api/admin/stats/extended', { days });
}

function getAdminSettings(): Promise<any> {
  return request('GET', '/api/admin/settings');
}

function updateAdminSettings(settings: any): Promise<any> {
  return request('PUT', '/api/admin/settings', { settings });
}

function getAdminKnowledgeStatus(): Promise<any> {
  return request('GET', '/api/admin/knowledge');
}

function triggerAdminKnowledgeLearn(): Promise<any> {
  return request('POST', '/api/admin/knowledge/learn');
}

function getAdminKnowledgeList(): Promise<any> {
  return request('GET', '/api/admin/knowledge/list');
}

function updateKnowledge(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/knowledge/${id}`, data);
}

function deleteKnowledge(id: number): Promise<any> {
  return request('DELETE', `/api/admin/knowledge/${id}`);
}

function getAdminPuzzlesList(): Promise<any> {
  return request('GET', '/api/admin/puzzles/list');
}

function updateAdminPuzzle(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/puzzles/${id}`, data);
}

function deleteAdminPuzzle(id: number): Promise<any> {
  return request('DELETE', `/api/admin/puzzles/${id}`);
}

function changeAdminPassword(oldPassword: string, newPassword: string): Promise<any> {
  return request('POST', '/api/admin/change-password', { oldPassword, newPassword });
}

// ---- 会员管理（管理端） ----
function getAdminMembershipLevels(): Promise<any> {
  return request('GET', '/api/admin/membership/levels');
}

function getAdminMembershipBenefits(): Promise<any> {
  return request('GET', '/api/admin/membership/benefits');
}

function createAdminMembershipLevel(payload: any): Promise<any> {
  return request('POST', '/api/admin/membership/levels', payload);
}

function updateAdminMembershipLevel(levelId: number, payload: any): Promise<any> {
  return request('PUT', `/api/admin/membership/levels/${levelId}`, payload);
}

function deleteAdminMembershipLevel(levelId: number): Promise<any> {
  return request('DELETE', `/api/admin/membership/levels/${levelId}`);
}

function getAdminMembershipUsers(page: number = 1, limit: number = 20, params?: any): Promise<any> {
  return request('GET', '/api/admin/membership/users', { page, limit, ...params });
}

function getAdminUserMembership(userId: number): Promise<any> {
  return request('GET', `/api/admin/membership/users/${userId}/detail`);
}

function adminGrantMembership(userId: number, levelId: number, days: number, reason: string): Promise<any> {
  return request('POST', `/api/admin/membership/users/${userId}/grant`, { levelId, days, reason });
}

function adminExtendMembership(userId: number, days: number, reason: string): Promise<any> {
  return request('POST', `/api/admin/membership/users/${userId}/extend`, { days, reason });
}

function adminExpireMembership(userId: number, reason: string): Promise<any> {
  return request('POST', `/api/admin/membership/users/${userId}/expire`, { reason });
}

function getAdminMembershipOrders(page: number = 1, limit: number = 20, filters?: any): Promise<any> {
  return request('GET', '/api/admin/membership/orders', { page, limit, ...filters });
}

function adminRefundMembershipOrder(orderId: string, reason: string): Promise<any> {
  return request('POST', `/api/admin/membership/orders/${orderId}/refund`, { reason });
}

function generateMembershipCodes(options: any): Promise<any> {
  return request('POST', '/api/admin/membership/codes', options);
}

function getMembershipCodes(page: number = 1, limit: number = 20, filters?: any): Promise<any> {
  return request('GET', '/api/admin/membership/codes', { page, limit, ...filters });
}

function disableMembershipCode(codeId: number): Promise<any> {
  return request('PATCH', `/api/admin/membership/codes/${codeId}/disable`);
}

function getAdminMembershipStats(): Promise<any> {
  return request('GET', '/api/admin/membership/stats');
}

function getAdminMembershipLogs(page: number = 1, limit: number = 50): Promise<any> {
  return request('GET', '/api/admin/membership/logs', { page, limit });
}

// ---- 棋谱库管理 ----
function getChessGameRecords(params: any): Promise<any> {
  return request('GET', '/api/admin/chess-games/records', params);
}

function getChessGameRecordDetail(id: number): Promise<any> {
  return request('GET', `/api/admin/chess-games/records/${id}`);
}

function deleteChessGameRecord(id: number): Promise<any> {
  return request('DELETE', `/api/admin/chess-games/records/${id}`);
}

function batchDeleteChessGameRecords(ids: number[]): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/batch-delete', { ids });
}

function updateChessGameTags(id: number, tags: string[]): Promise<any> {
  return request('PUT', `/api/admin/chess-games/records/${id}/tags`, { tags });
}

function searchChessGamesExternal(query: string, source: string = 'lichess', maxResults: number = 10): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/search', { query, source, maxResults });
}

function importChessGameFromUrl(url: string): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/import-url', { url });
}

function searchAndImportChessGame(query: string, source: string = 'lichess', maxResults: number = 10): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/search-and-import', { query, source, maxResults });
}

function importChessGamePgn(pgnText: string): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/import-pgn', { pgnText });
}

function getChessDataService(): Promise<any> {
  return request('GET', '/api/admin/chess-games/data-sources');
}

function createChessGameDataSource(input: any): Promise<any> {
  return request('POST', '/api/admin/chess-games/data-sources', input);
}

function updateChessGameDataSource(id: number, input: any): Promise<any> {
  return request('PATCH', `/api/admin/chess-games/data-sources/${id}`, input);
}

function deleteChessGameDataSource(id: number): Promise<any> {
  return request('DELETE', `/api/admin/chess-games/data-sources/${id}`);
}

function testChessGameDataSource(id: number): Promise<any> {
  return request('POST', `/api/admin/chess-games/data-sources/${id}/test`);
}

function importFromChessGameDataSource(id: number): Promise<any> {
  return request('POST', `/api/admin/chess-games/data-sources/${id}/import`);
}

function triggerChessGameAutoUpdate(): Promise<any> {
  return request('POST', '/api/admin/chess-games/auto-update');
}

function getChessGameLibraryStats(): Promise<any> {
  return request('GET', '/api/admin/chess-games/stats');
}

// ---- 棋谱分析 ----
function getChessGameAnalysis(recordId: number): Promise<any> {
  return request('GET', `/api/admin/chess-games/records/${recordId}/analysis`);
}

function getChessGameAnalyses(ids: number[]): Promise<any> {
  return request('POST', '/api/admin/chess-games/records/analysis/batch', { ids });
}

function analyzeChessGame(recordId: number, options?: any): Promise<any> {
  return request('POST', `/api/admin/chess-games/records/${recordId}/analyze`, options || {});
}

function analyzeAllChessGames(options?: any): Promise<any> {
  return request('POST', '/api/admin/chess-games/analyze-all', options || {});
}

function getChessGameBatchAnalysisStatus(): Promise<any> {
  return request('GET', '/api/admin/chess-games/analysis-status');
}

function cancelChessGameAnalysis(recordId: number): Promise<any> {
  return request('POST', `/api/admin/chess-games/records/${recordId}/analyze/cancel`);
}

function cancelAllChessGameAnalyses(): Promise<any> {
  return request('POST', '/api/admin/chess-games/analyze/cancel-all');
}

function resetAllChessGameAnalyses(): Promise<any> {
  return request('POST', '/api/admin/chess-games/analyze/reset');
}

function deleteChessGameAnalysis(recordId: number): Promise<any> {
  return request('DELETE', `/api/admin/chess-games/records/${recordId}/analysis`);
}

// ---- LLM 提供商管理 ----
function getLLMProviders(): Promise<any> {
  return request('GET', '/api/admin/llm-providers');
}

function getLLMProvider(id: number): Promise<any> {
  return request('GET', `/api/admin/llm-providers/${id}`);
}

function createLLMProvider(data: any): Promise<any> {
  return request('POST', '/api/admin/llm-providers', data);
}

function updateLLMProvider(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/llm-providers/${id}`, data);
}

function deleteLLMProvider(id: number): Promise<any> {
  return request('DELETE', `/api/admin/llm-providers/${id}`);
}

function setDefaultLLMProvider(id: number): Promise<any> {
  return request('POST', `/api/admin/llm-providers/${id}/default`);
}

function testLLMConnection(id: number): Promise<any> {
  return request('POST', `/api/admin/llm-providers/${id}/test`);
}

// ---- 菜单可见性 ----
function getAdminMenuVisibility(): Promise<any> {
  return request('GET', '/api/admin/menus');
}

function updateAdminMenuVisibility(menus: any[]): Promise<any> {
  return request('PUT', '/api/admin/menus', { menus });
}

function getAdminMenuList(): Promise<any> {
  return request('GET', '/api/admin/menu/list');
}

function deleteAdminMenu(id: number): Promise<any> {
  return request('DELETE', `/api/admin/menu/${id}`);
}

// ---- SMTP ----
function getSmtpConfig(): Promise<any> {
  return request('GET', '/api/admin/settings/smtp');
}

function saveSmtpConfig(config: any): Promise<any> {
  return request('PUT', '/api/admin/settings/smtp', config);
}

function deleteSmtpConfig(): Promise<any> {
  return request('DELETE', '/api/admin/settings/smtp');
}

function testSmtpConnection(config: any): Promise<any> {
  return request('POST', '/api/admin/settings/smtp/test', config);
}

// ---- 竞赛 ----
function getCompetitions(params?: any): Promise<any> {
  return request('GET', '/api/competitions', params);
}

function getCompetitionDetail(id: number): Promise<any> {
  return request('GET', `/api/competitions/${id}`);
}

function joinCompetition(id: number, data?: any): Promise<any> {
  // 后端报名端点是 POST /:id/register（competitionRoutes），此前写成 /join 打不到路由
  return request('POST', `/api/competitions/${id}/register`, data);
}

function getCompetitionRounds(competitionId: number): Promise<any> {
  return request('GET', `/api/competitions/${competitionId}/rounds`);
}

function getCompetitionStandings(competitionId: number, params?: any): Promise<any> {
  return request('GET', `/api/competitions/${competitionId}/standings`, params);
}

function getCompetitionNotifications(competitionId: number): Promise<any> {
  return request('GET', `/api/competitions/${competitionId}/notifications`);
}

function getCompetitionMatch(matchId: string): Promise<any> {
  return request('GET', `/api/competitions/matches/${matchId}`);
}

function submitCompetitionMove(matchId: string, move: string): Promise<any> {
  return request('POST', `/api/competitions/matches/${matchId}/move`, { move });
}

function getCompetitionAdminCompetitions(params?: any): Promise<any> {
  return request('GET', '/api/admin/competitions', params);
}

function createCompetition(data: any): Promise<any> {
  return request('POST', '/api/admin/competitions', data);
}

function updateCompetition(id: number, data: any): Promise<any> {
  return request('PUT', `/api/admin/competitions/${id}`, data);
}

function deleteCompetition(id: number): Promise<any> {
  return request('DELETE', `/api/admin/competitions/${id}`);
}

function getCompetitionManageDetail(id: number): Promise<any> {
  return request('GET', `/api/admin/competitions/${id}`);
}

// ---- 分销扩展：竞赛通知 ----
function getCompetitionRegistrationPopup(): Promise<any> {
  return request('GET', '/api/competitions/registration-popup');
}

export {
  getBaseUrl,
  setBaseUrl,
  request,
  sseRequest,
  parseSSEChunk,
  login,
  register,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  lichessAuth,
  lichessLogin,
  getLichessConfig,
  lichessMiniAppTicket,
  lichessMiniAppLoginTicket,
  lichessMiniAppStatus,
  lichessBindToken,
  lichessLoginToken,
  getLichessBinding,
  unbindLichess,
  isPvpTableLobbyEnabled,
  wechatMiniAppLogin,
  requestAIMove,
  saveGame,
  loadGames,
  getGameDetail,
  deleteGame,
  analyzePosition,
  analyzeMove,
  getAiMoveExplanation,
  getDetailedAnalysis,
  getPositionCommentary,
  listChessRecords,
  importChessRecords,
  deleteRecord,
  recognizeBoardImage,
  searchChessGames,
  importChessRecordsFromUrl,
  searchAndImportChessGames,
  reviewGameStream,
  analyzePositionStream,
  explainStream,
  getPuzzleThemes,
  startPuzzle,
  getAttemptState,
  submitPuzzleMove,
  requestPuzzleHint,
  giveUpPuzzle,
  explainPuzzleStream,
  getWrongBook,
  resolveWrongBook,
  addPuzzleFavorite,
  removePuzzleFavorite,
  getPuzzleFavorites,
  getPuzzleStats,
  isMembershipEnabled,
  getMembershipLevels,
  getMembershipStatus,
  getMyMembershipOrders,
  createMembershipOrder,
  payMembershipOrder,
  cancelMembershipOrder,
  redeemMembershipCode,
  getTrainingPlan,
  getTrainingStats,
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  analyzeProfile,
  askCoachStream,
  getOpeningEncyclopedia,
  getAssessmentQuestionnaire,
  startAssessment,
  submitPuzzleResults,
  submitPuzzleResultsForFullFlow,
  submitGameMetrics,
  submitMultiGameMetrics,
  getAdaptiveNextPuzzle,
  getAssessmentHistory,
  getAssessmentReport,
  abandonAssessment,
  retakeAssessment,
  getCurrentAssessment,
  getSavedProfileAnalysis,
  getAdminDashboard,
  getAdminTrend,
  getAdminStats,
  getAdminLogs,
  getAdminLogStats,
  getAdminUsersDetail,

  // ===== 以下为从网页版补充的 API =====

  // ---- 对局扩展 ----
  loadGame,
  saveInProgressGame,
  getInProgressGame,
  deleteInProgressGame,
  completeInProgressGame,

  // ---- 棋谱扩展 ----
  getRecordAnalyses,
  getRecordDetail,
  getRecordDataSources,
  addRecordDataSource,
  deleteRecordDataSource,
  triggerRecordAutoUpdate,

  // ---- 知识库 ----
  triggerLearning,
  getKnowledgeStatus,

  // ---- 深度复盘 ----
  deepReviewGameStream,
  loadDeepReview,
  saveDeepReview,
  deleteDeepReview,

  // ---- 概念提示 ----
  getConceptHint,

  // ---- 用户自建习题 ----
  createUserPuzzle,
  batchCreateUserPuzzles,
  getUserPuzzles,
  getDueReviews,
  getUserPuzzleStats,
  getUserPuzzleDetail,
  solveUserPuzzle,
  deleteUserPuzzle,
  batchDeleteUserPuzzles,

  // ---- 习题管理（管理端） ----
  getAdminPuzzlesList,
  updateAdminPuzzle,
  deleteAdminPuzzle,

  // ---- 每周主题 ----
  getCurrentWeeklyTheme,
  getWeeklyThemePuzzles,

  // ---- 观战（Watch） ----
  getWatchChannels,
  openWatchStream,

  // ---- 每日挑战（Daily Challenge） ----
  getDailyChallengeToday,
  startDailyChallenge,
  settleDailyChallenge,
  abandonDailyChallenge,
  getDailyChallengeCurve,

  // ---- 微信支付 ----
  getWechatPayOrderStatus,
  createJSAPIPayOrder,

  // ---- 训练扩展 ----
  getUpgradePlan,
  getTrainingDashboard,
  saveGradeSettings,
  saveMistakesFromReview,
  getMistakeSummary,
  getMistakeMatchingPuzzles,
  getTrainingCenterData,
  triggerDynamicAssessment,
  getWeeklyPlan,
  getWeeklyReport,
  generateWeeklyReport,
  submitWeeklyEvaluation,
  getWeeklyEvaluations,
  getTodayTrainingPuzzles,
  logPreferenceEvent,
  getPreferenceProfile,
  fetchCoachHint,

  // ---- 全局开关 ----
  isDistributionEnabled,
  isVideoGenerationEnabled,
  isAIAnalysisReportEnabled,
  getMembershipToggle,
  setMembershipToggle,
  getAdminVideoGenerationToggle,
  setAdminVideoGenerationToggle,
  getAdminAIAnalysisToggle,
  setAdminAIAnalysisToggle,
  getAdminDistributionToggle,
  setAdminDistributionToggle,

  // ---- 视频生成 ----
  generateGameVideo,
  getVideoStatus,
  getVideoDownloadUrl,
  getVideoVoices,
  resumeVideoGeneration,
  getCompletedVideoTasks,

  // ---- AI 棋手 ----
  getEnabledAiBots,
  startAiBotMatch,
  getMyAiBotGames,
  getAdminAiBots,
  getAdminAiBot,
  createAdminAiBot,
  updateAdminAiBot,
  deleteAdminAiBot,
  toggleAdminAiBot,
  generateAdminAiBots,
  batchOnlineAiBots,
  batchOfflineAiBots,
  batchDeleteAiBots,

  // ---- 分销（用户端） ----
  getMyDistributionProfile,
  activateDistributor,
  getMyReferralInfo,
  regenerateReferralCode,
  getMyCommissions,
  getMyCommissionSummary,
  getMyTeam,
  createWithdrawalRequest,
  getMyWithdrawals,

  // ---- 分销（管理端） ----
  getDistributionSettings,
  updateDistributionSettings,
  getDistributionStats,
  getDistributors,
  getDistributorDetail,
  toggleDistributorStatus,
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  getAdminCommissionRecords,
  settleCommissionManually,
  getAdminWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  completeWithdrawal,

  // ---- 意见反馈 ----
  submitFeedback,
  getMyFeedback,
  getFeedbackDetail,
  replyToFeedback,
  getAdminFeedback,
  getAdminFeedbackReplies,
  replyFeedback,
  getFeedbackStats,
  getAdminFeedbackList,

  // ---- 问卷调查 ----
  getPendingSurvey,
  submitSurveyResponse,
  skipSurvey,
  getAdminSurveys,
  getAdminSurveyDetail,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  getSurveyStats,
  getSurveyResponses,
  aiGenerateSurvey,
  deleteAdminSurvey,

  // ---- 即时消息 ----
  sendMessage,
  getMessageSessions,
  getConversation,
  getUnreadCount,

  // ---- 好友系统 ----
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendList,
  getFriendRequests,
  removeFriend,
  searchUsers,

  // ---- 好友对弈挑战 / 邀请链接 ----
  createFriendChallenge,
  redeemShareToken,
  cancelFriendChallenge,
  getFriendChallengeShareCode,

  // ---- 群组系统 ----
  createGroup,
  getUserGroups,
  getGroupDetail,
  updateGroup,
  deleteGroup,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole,
  getGroupMessages,
  sendGroupMessage,

  // ---- 快捷短语与表情 ----
  getQuickPhrases,
  getEmojis,

  // ---- 教师与课件 ----
  getTeacherStatus,
  applyTeacher,
  listCoursewares,
  createCourseware,
  getCoursewareDetail,
  updateCourseware,
  deleteCourseware,
  addCoursewareItem,
  removeCoursewareItem,
  updateCoursewareItemNote,
  reorderCoursewareItems,
  getAdminTeacherApplications,
  getAdminTeacherApplicationCounts,
  reviewAdminTeacherApplication,
  getAdminTeachers,
  revokeAdminTeacher,
  approveTeacher,
  rejectTeacher,

  // ---- 龙币（用户端） ----
  getDragonCoinBalance,
  getDragonCoinLedger,
  getDragonCoinConfigs,
  getDragonCoinExchanges,
  exchangeDragonCoin,
  getDragonCoinExchangeRecords,
  getDragonCoinShop,
  purchaseDragonCoinShop,
  consumeDragonCoinShop,
  getDragonCoinTasks,
  repairStreak,
  freezeStreak,

  // ---- 龙币（管理端） ----
  getAdminDragonCoinConfigs,
  createDragonCoinConfig,
  updateDragonCoinConfig,
  deleteDragonCoinConfig,
  getAdminDragonCoinExchanges,
  createDragonCoinExchange,
  updateDragonCoinExchange,
  deleteDragonCoinExchange,
  getAdminDragonCoinExchangeRecords,
  getAdminDragonCoinUserBalance,
  adjustDragonCoinBalance,
  getAdminDragonCoinStats,

  // ---- 管理后台扩展 ----
  getAdminDayStats,
  getAdminUsers,
  getAdminUserDetail,
  updateAdminUserRole,
  updateAdminUserTeacherStatus,
  adminResetPassword,
  getAdminUserActivity,
  getAdminUserActivityModules,
  getAdminGames,
  getAdminGameDetail,
  getAdminModuleStats,
  getAdminExtendedStats,
  getAdminSettings,
  updateAdminSettings,
  getAdminKnowledgeStatus,
  triggerAdminKnowledgeLearn,
  getAdminKnowledgeList,
  updateKnowledge,
  deleteKnowledge,
  changeAdminPassword,

  // ---- 会员管理（管理端） ----
  getAdminMembershipLevels,
  getAdminMembershipBenefits,
  createAdminMembershipLevel,
  updateAdminMembershipLevel,
  deleteAdminMembershipLevel,
  getAdminMembershipUsers,
  getAdminUserMembership,
  adminGrantMembership,
  adminExtendMembership,
  adminExpireMembership,
  getAdminMembershipOrders,
  adminRefundMembershipOrder,
  generateMembershipCodes,
  getMembershipCodes,
  disableMembershipCode,
  getAdminMembershipStats,
  getAdminMembershipLogs,

  // ---- 棋谱库管理 ----
  getChessGameRecords,
  getChessGameRecordDetail,
  deleteChessGameRecord,
  batchDeleteChessGameRecords,
  updateChessGameTags,
  searchChessGamesExternal,
  importChessGameFromUrl,
  searchAndImportChessGame,
  importChessGamePgn,
  getChessDataService,
  createChessGameDataSource,
  updateChessGameDataSource,
  deleteChessGameDataSource,
  testChessGameDataSource,
  importFromChessGameDataSource,
  triggerChessGameAutoUpdate,
  getChessGameLibraryStats,

  // ---- 棋谱分析 ----
  getChessGameAnalysis,
  getChessGameAnalyses,
  analyzeChessGame,
  analyzeAllChessGames,
  getChessGameBatchAnalysisStatus,
  cancelChessGameAnalysis,
  cancelAllChessGameAnalyses,
  resetAllChessGameAnalyses,
  deleteChessGameAnalysis,

  // ---- LLM 提供商管理 ----
  getLLMProviders,
  getLLMProvider,
  createLLMProvider,
  updateLLMProvider,
  deleteLLMProvider,
  setDefaultLLMProvider,
  testLLMConnection,

  // ---- 菜单可见性 ----
  getAdminMenuVisibility,
  updateAdminMenuVisibility,
  getAdminMenuList,
  deleteAdminMenu,

  // ---- SMTP ----
  getSmtpConfig,
  saveSmtpConfig,
  deleteSmtpConfig,
  testSmtpConnection,

  // ---- 竞赛 ----
  getCompetitions,
  getCompetitionDetail,
  joinCompetition,
  getCompetitionRounds,
  getCompetitionStandings,
  getCompetitionNotifications,
  getCompetitionMatch,
  submitCompetitionMove,
  getCompetitionAdminCompetitions,
  createCompetition,
  updateCompetition,
  deleteCompetition,
  getCompetitionManageDetail,
  getCompetitionRegistrationPopup,
};
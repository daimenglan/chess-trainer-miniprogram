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

// baseUrl 配置（手机真机调试需改为本机局域网 IP，部署到腾讯云后改回生产地址）
let baseUrl = 'http://192.168.3.168:3001';

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
        // 401 未授权 → 清除token并跳转登录
        if (res.statusCode === 401) {
          const currentApp = getAppSafe();
          if (currentApp) {
            currentApp.setToken(null);
            currentApp.globalData.user = null;
          }
          wx.removeStorageSync('auth_token');
          wx.removeStorageSync('user_info');
          wx.navigateTo({ url: '/pages/login/login' });
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
          reject(new Error(body?.error || `请求失败 (${res.statusCode})`));
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

function register(username: string, password: string): Promise<any> {
  return request('POST', '/api/auth/register', { username, password });
}

function getCurrentUser(): Promise<any> {
  return request('GET', '/api/auth/me');
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

function importChessRecords(pgnText: string): Promise<any> {
  return request('POST', '/api/records/import', { pgnText });
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

export {
  getBaseUrl,
  setBaseUrl,
  request,
  sseRequest,
  parseSSEChunk,
  login,
  register,
  getCurrentUser,
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
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  analyzeProfile,
  askCoachStream,
  getOpeningEncyclopedia,
};
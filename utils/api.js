"use strict";
/**
 * API 请求封装
 * 统一处理认证token、请求/响应拦截、错误处理
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseUrl = getBaseUrl;
exports.setBaseUrl = setBaseUrl;
exports.request = request;
exports.sseRequest = sseRequest;
exports.parseSSEChunk = parseSSEChunk;
exports.login = login;
exports.register = register;
exports.getCurrentUser = getCurrentUser;
exports.requestAIMove = requestAIMove;
exports.saveGame = saveGame;
exports.loadGames = loadGames;
exports.getGameDetail = getGameDetail;
exports.deleteGame = deleteGame;
exports.analyzePosition = analyzePosition;
exports.analyzeMove = analyzeMove;
exports.getAiMoveExplanation = getAiMoveExplanation;
exports.getDetailedAnalysis = getDetailedAnalysis;
exports.getPositionCommentary = getPositionCommentary;
exports.listChessRecords = listChessRecords;
exports.importChessRecords = importChessRecords;
exports.deleteRecord = deleteRecord;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.uploadAvatar = uploadAvatar;
exports.changePassword = changePassword;
exports.analyzeProfile = analyzeProfile;
exports.askCoachStream = askCoachStream;
exports.getOpeningEncyclopedia = getOpeningEncyclopedia;
// 注意：小程序启动阶段 getApp() 可能返回 undefined，必须惰性获取
function getAppSafe() {
    try {
        return typeof getApp === 'function' ? getApp() : null;
    }
    catch {
        return null;
    }
}
// baseUrl 配置（手机真机调试需改为本机局域网 IP，部署到腾讯云后改回生产地址）
let baseUrl = 'http://192.168.3.168:3001';
function getBaseUrl() {
    return baseUrl;
}
function setBaseUrl(url) {
    baseUrl = url;
}
/**
 * 获取认证头
 */
function getAuthHeaders() {
    const app = getAppSafe();
    const token = (app && app.globalData.token) || wx.getStorageSync('auth_token');
    if (token) {
        return { 'Authorization': `Bearer ${token}` };
    }
    return {};
}
/**
 * 通用请求方法
 */
function request(method, url, data = {}, options = {}) {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        const headers = {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options.headers,
        };
        const requestTask = wx.request({
            url: fullUrl,
            method: method,
            data: data,
            header: headers,
            timeout: options.timeout || 30000,
            enableChunked: options.enableChunked || false,
            responseType: options.responseType || 'text',
            success(res) {
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
                    resolve(res);
                    return;
                }
                const body = res.data;
                if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
                    resolve(body);
                }
                else {
                    reject(new Error(body?.error || `请求失败 (${res.statusCode})`));
                }
            },
            fail(err) {
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
function sseRequest(url, data, callbacks) {
    const { onData, onError, onDone } = callbacks;
    const fullUrl = `${baseUrl}${url}`;
    const requestTask = wx.request({
        url: fullUrl,
        method: 'POST',
        data: data,
        header: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        enableChunked: true,
        timeout: 120000,
        success(res) {
            if (res.statusCode !== 200) {
                onError?.(new Error(`SSE 请求失败 (${res.statusCode})`));
                onDone?.();
            }
        },
        fail(err) {
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
function parseSSEChunk(chunk) {
    const lines = chunk.split('\n');
    const events = [];
    let currentEvent = 'message';
    for (const line of lines) {
        if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
        }
        else if (line.startsWith('data: ')) {
            events.push({
                event: currentEvent,
                data: line.slice(6).trim(),
            });
        }
        else if (line === '') {
            currentEvent = 'message';
        }
    }
    return events;
}
// ===== API 方法 =====
// ---- 认证 ----
function login(username, password) {
    return request('POST', '/api/auth/login', { username, password });
}
function register(username, password) {
    return request('POST', '/api/auth/register', { username, password });
}
function getCurrentUser() {
    return request('GET', '/api/auth/me');
}
// ---- 对局 ----
function requestAIMove(fen, difficulty = 5) {
    return request('POST', '/api/ai-move', { fen, difficulty });
}
function saveGame(data) {
    return request('POST', '/api/games', data);
}
function loadGames(params = {}) {
    return request('GET', '/api/games', params);
}
function getGameDetail(gameId) {
    return request('GET', `/api/games/${gameId}`);
}
function deleteGame(gameId) {
    return request('DELETE', `/api/games/${gameId}`);
}
// ---- 分析 ----
function analyzePosition(data) {
    return request('POST', '/api/analyze', data);
}
function analyzeMove(data) {
    return request('POST', '/api/analyze-move', data);
}
function getAiMoveExplanation(fen, uci, depth = 10) {
    return request('POST', '/api/analyze/explain-last-move', { fen, uci, depth });
}
function getDetailedAnalysis(fen, depth = 10, multiPv = 3) {
    return request('POST', '/api/analyze/detailed', { fen, depth, multiPv });
}
function getPositionCommentary(fen, depth = 10) {
    return request('POST', '/api/analyze/commentary', { fen, depth });
}
// ---- 棋谱 ----
function listChessRecords(params = {}) {
    return request('GET', '/api/records', params);
}
function importChessRecords(pgnText) {
    return request('POST', '/api/records/import', { pgnText });
}
function deleteRecord(recordId) {
    return request('DELETE', `/api/records/${recordId}`);
}
// ---- 个人资料 ----
function getProfile() {
    return request('GET', '/api/profile');
}
function updateProfile(data) {
    return request('PUT', '/api/profile', data);
}
function uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
        const token = getAuthHeaders()['Authorization']?.slice(7) || wx.getStorageSync('auth_token');
        wx.uploadFile({
            url: `${baseUrl}/api/profile/avatar`,
            filePath: filePath,
            name: 'avatar',
            header: {
                'Authorization': `Bearer ${token}`,
            },
            success(res) {
                try {
                    const body = JSON.parse(res.data);
                    if (body.success) {
                        resolve(body);
                    }
                    else {
                        reject(new Error(body.error || '上传失败'));
                    }
                }
                catch {
                    reject(new Error('上传失败'));
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络错误'));
            },
        });
    });
}
function changePassword(oldPassword, newPassword) {
    return request('PUT', '/api/profile/password', { oldPassword, newPassword });
}
function analyzeProfile() {
    return request('POST', '/api/profile/analyze');
}
// ---- 教练 ----
function askCoachStream(options) {
    const sse = require('./sse');
    return sse.createSSERequest('/api/coach/ask', {
        fen: options.fen,
        moveHistory: options.moveHistory,
        question: options.question,
    }, {
        onEvent: (evt) => {
            if (evt.type === 'chunk' && typeof evt.content === 'string') {
                options.onChunk && options.onChunk(evt.content);
            }
        },
        onError: (err) => options.onError && options.onError(err),
        onDone: () => options.onDone && options.onDone(),
    });
}
// ---- 开局百科 ----
function getOpeningEncyclopedia(data) {
    return request('POST', '/api/opening/encyclopedia', data);
}

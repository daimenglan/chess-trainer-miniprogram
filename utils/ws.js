"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * WebSocket 连接管理器（对接后端原生 WS 网关 /ws?token=...）
 * 消息协议：{"event":"xxx","payload":{}}
 * 自动重连、心跳、事件订阅
 */
const app = getApp();
/**
 * 解码 JWT payload（不含签名验证，仅用于提取 userId/username）
 */
function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const payload = JSON.parse(atob(parts[1]));
        return { userId: payload.userId, username: payload.username || '' };
    }
    catch {
        return null;
    }
}
/** 后端 WS 地址（手机真机调试需改为本机局域网 IP，部署到腾讯云后改回生产地址） */
const WS_URL = 'ws://192.168.3.168:3001/ws';
class WsClient {
    constructor() {
        this._ws = null;
        this._status = 'idle';
        this._handlers = new Map();
        this._reconnectTimer = null;
        this._heartbeatTimer = null;
        this._reconnectAttempts = 0;
        this._maxReconnect = 5;
        this._userId = null;
        this._username = '';
    }
    get status() { return this._status; }
    get userId() { return this._userId; }
    get username() { return this._username; }
    /** 连接服务器（token 从 app.globalData 自动获取） */
    connect() {
        if (this._status === 'connecting' || this._status === 'connected')
            return;
        const token = app.globalData.token;
        if (!token) {
            console.warn('[WS] 未登录，无法连接');
            return;
        }
        this._status = 'connecting';
        this._emitStatus();
        // 从 JWT 中解析 userId 和 username
        const decoded = decodeJwtPayload(token);
        if (decoded) {
            this._userId = decoded.userId;
            this._username = decoded.username || '';
        }
        const authParam = 'token';
        const url = WS_URL + '?' + authParam + '=' + encodeURIComponent(token);
        this._ws = wx.connectSocket({ url, protocols: [] });
        this._ws.onOpen(() => {
            console.log('[WS] 已连接');
            this._status = 'connected';
            this._reconnectAttempts = 0;
            this._emitStatus();
            this._startHeartbeat();
        });
        this._ws.onMessage((res) => {
            try {
                const msg = JSON.parse(res.data);
                if (!msg || typeof msg.event !== 'string')
                    return;
                const set = this._handlers.get(msg.event);
                if (set) {
                    for (const fn of set)
                        fn(msg.payload || {});
                }
            }
            catch (e) {
                // 忽略非法消息
            }
        });
        this._ws.onClose(() => {
            console.log('[WS] 连接关闭');
            this._status = 'disconnected';
            this._stopHeartbeat();
            this._emitStatus();
            this._scheduleReconnect();
        });
        this._ws.onError(() => {
            console.warn('[WS] 连接错误');
            // onClose 会随后触发
        });
    }
    /** 断开连接 */
    disconnect() {
        this._reconnectAttempts = this._maxReconnect; // 禁止自动重连
        this._stopHeartbeat();
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._ws) {
            try {
                this._ws.close();
            }
            catch { }
            this._ws = null;
        }
        this._status = 'idle';
        this._emitStatus();
    }
    /** 发送事件 */
    send(event, payload = {}) {
        if (this._status !== 'connected' || !this._ws) {
            console.warn(`[WS] 未连接，无法发送 ${event}`);
            return;
        }
        this._ws.send({
            data: JSON.stringify({ event, payload }),
        });
    }
    /** 订阅事件 */
    on(event, handler) {
        let set = this._handlers.get(event);
        if (!set) {
            set = new Set();
            this._handlers.set(event, set);
        }
        set.add(handler);
        return () => { set.delete(handler); };
    }
    /** 订阅一次 */
    once(event, handler) {
        const wrapper = (payload) => {
            this.off(event, wrapper);
            handler(payload);
        };
        this.on(event, wrapper);
    }
    /** 取消订阅 */
    off(event, handler) {
        const set = this._handlers.get(event);
        if (set)
            set.delete(handler);
    }
    /** 等待指定事件 */
    waitFor(event, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, wrapper);
                reject(new Error(`等待 ${event} 超时`));
            }, timeoutMs);
            const wrapper = (payload) => {
                clearTimeout(timer);
                resolve(payload);
            };
            this.once(event, wrapper);
        });
    }
    _emitStatus() {
        const set = this._handlers.get('__status');
        if (set) {
            for (const fn of set)
                fn(this._status);
        }
    }
    /** 应用层心跳（30 秒一次） */
    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            this.send('ping');
        }, 30000);
    }
    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }
    _scheduleReconnect() {
        if (this._reconnectAttempts >= this._maxReconnect)
            return;
        this._reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 15000);
        console.log(`[WS] ${delay}ms 后重连 (第${this._reconnectAttempts}次)`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, delay);
    }
}
/** 单例 */
const wsClient = new WsClient();
exports.default = wsClient;

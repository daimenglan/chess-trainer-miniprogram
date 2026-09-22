/**
 * WebSocket 连接管理器（对接后端原生 WS 网关 /ws?token=...）
 * 消息协议：{"event":"xxx","payload":{}}
 * 自动重连、心跳、事件订阅
 */
const app = getApp();

type EventHandler = (payload: any) => void;

/** 连接状态 */
export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/**
 * 解码 JWT payload（不含签名验证，仅用于提取 userId/username）
 */
function decodeJwtPayload(token: string): { userId: number; username: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return { userId: payload.userId, username: payload.username || '' };
  } catch {
    return null;
  }
}

/** 后端 WS 地址（必须为 wss:// 的已备案域名，小程序 socket 合法域名不接受裸 IP 与非加密连接） */
const WS_URL = 'wss://mychess.com.cn/ws';

class WsClient {
  private _ws: WechatMiniprogram.SocketTask | null = null;
  private _status: WsStatus = 'idle';
  private _handlers = new Map<string, Set<EventHandler>>();
  private _reconnectTimer: number | null = null;
  private _heartbeatTimer: number | null = null;
  private _reconnectAttempts = 0;
  private _maxReconnect = 5;
  private _userId: number | null = null;
  private _username: string = '';

  get status(): WsStatus { return this._status; }
  get userId(): number | null { return this._userId; }
  get username(): string { return this._username; }

  /** 连接服务器（token 从 app.globalData 自动获取） */
  connect(): void {
    if (this._status === 'connecting' || this._status === 'connected') return;
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

    this._ws.onMessage((res: any) => {
      try {
        const msg = JSON.parse(res.data as string);
        if (!msg || typeof msg.event !== 'string') return;
        const set = this._handlers.get(msg.event);
        if (set) {
          for (const fn of set) fn(msg.payload || {});
        }
      } catch (e) {
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
  disconnect(): void {
    this._reconnectAttempts = this._maxReconnect; // 禁止自动重连
    this._stopHeartbeat();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._ws) {
      try { (this._ws as any).close(); } catch {}
      this._ws = null;
    }
    this._status = 'idle';
    this._emitStatus();
  }

  /** 发送事件 */
  send(event: string, payload: any = {}): void {
    if (this._status !== 'connected' || !this._ws) {
      console.warn(`[WS] 未连接，无法发送 ${event}`);
      return;
    }
    this._ws.send({
      data: JSON.stringify({ event, payload }),
    });
  }

  /** 订阅事件 */
  on(event: string, handler: EventHandler): () => void {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler);
    return () => { set!.delete(handler); };
  }

  /** 订阅一次 */
  once(event: string, handler: EventHandler): void {
    const wrapper = (payload: any) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
  }

  /** 取消订阅 */
  off(event: string, handler: EventHandler): void {
    const set = this._handlers.get(event);
    if (set) set.delete(handler);
  }

  /** 等待指定事件 */
  waitFor(event: string, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, wrapper);
        reject(new Error(`等待 ${event} 超时`));
      }, timeoutMs);
      const wrapper = (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      };
      this.once(event, wrapper);
    });
  }

  private _emitStatus(): void {
    const set = this._handlers.get('__status');
    if (set) {
      for (const fn of set) fn(this._status);
    }
  }

  /** 应用层心跳（30 秒一次） */
  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this.send('ping');
    }, 30000) as any;
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempts >= this._maxReconnect) return;
    this._reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 15000);
    console.log(`[WS] ${delay}ms 后重连 (第${this._reconnectAttempts}次)`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay) as any;
  }
}

/** 单例 */
const wsClient = new WsClient();
export default wsClient;
/**
 * 轻量级状态管理
 * 基于发布-订阅模式，连接 app.globalData 与页面
 */

type StoreCallback = (value: any, old: any) => void;

interface Listener {
  callback: StoreCallback;
  ctx: any;
}

class Store {
  private _listeners: Record<string, Listener[]> = {};
  private _app: any = null;

  init(appInstance: any): void {
    this._app = appInstance;
  }

  subscribe(key: string, callback: StoreCallback, ctx: any): void {
    if (!this._listeners[key]) {
      this._listeners[key] = [];
    }
    this._listeners[key].push({ callback, ctx });
  }

  unsubscribe(key: string, ctx: any): void {
    if (!this._listeners[key]) return;
    this._listeners[key] = this._listeners[key].filter(
      item => item.ctx !== ctx
    );
    if (this._listeners[key].length === 0) {
      delete this._listeners[key];
    }
  }

  get(key?: string): any {
    if (!key) return this._app?.globalData;
    return this._app?.globalData[key];
  }

  set(key: string, value: any): void {
    const old = this._app!.globalData[key];
    this._app!.globalData[key] = value;
    this._notify(key, value, old);
  }

  update(key: string, partial: any): void {
    const current = this._app!.globalData[key] || {};
    const updated = typeof partial === 'function'
      ? partial(current)
      : { ...current, ...partial };
    this.set(key, updated);
  }

  private _notify(key: string, value: any, old: any): void {
    if (!this._listeners[key]) return;
    for (const { callback, ctx } of this._listeners[key]) {
      try {
        callback.call(ctx, value, old);
      } catch (e) {
        console.error(`Store notify error for key "${key}":`, e);
      }
    }
  }
}

const store = new Store();

function pageMixin<T extends Record<string, any>>(pageConfig: T): T {
  const originalOnLoad = pageConfig.onLoad;
  const originalOnUnload = pageConfig.onUnload;

  (pageConfig as any).onLoad = function (options: Record<string, string | undefined>) {
    if (this.storeKeys) {
      for (const key of this.storeKeys) {
        store.subscribe(key, function (this: any, newVal: any) {
          if (this.setData) {
            this.setData({ [key]: newVal });
          }
        }, this);
      }
    }
    if (originalOnLoad) {
      (originalOnLoad as any).call(this, options);
    }
  };

  (pageConfig as any).onUnload = function () {
    if (this.storeKeys) {
      for (const key of this.storeKeys) {
        store.unsubscribe(key, this);
      }
    }
    if (originalOnUnload) {
      (originalOnUnload as any).call(this);
    }
  };

  return pageConfig;
}

export {
  store,
  pageMixin,
};
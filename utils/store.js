"use strict";
/**
 * 轻量级状态管理
 * 基于发布-订阅模式，连接 app.globalData 与页面
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
exports.pageMixin = pageMixin;
class Store {
    constructor() {
        this._listeners = {};
        this._app = null;
    }
    init(appInstance) {
        this._app = appInstance;
    }
    subscribe(key, callback, ctx) {
        if (!this._listeners[key]) {
            this._listeners[key] = [];
        }
        this._listeners[key].push({ callback, ctx });
    }
    unsubscribe(key, ctx) {
        if (!this._listeners[key])
            return;
        this._listeners[key] = this._listeners[key].filter(item => item.ctx !== ctx);
        if (this._listeners[key].length === 0) {
            delete this._listeners[key];
        }
    }
    get(key) {
        if (!key)
            return this._app?.globalData;
        return this._app?.globalData[key];
    }
    set(key, value) {
        const old = this._app.globalData[key];
        this._app.globalData[key] = value;
        this._notify(key, value, old);
    }
    update(key, partial) {
        const current = this._app.globalData[key] || {};
        const updated = typeof partial === 'function'
            ? partial(current)
            : { ...current, ...partial };
        this.set(key, updated);
    }
    _notify(key, value, old) {
        if (!this._listeners[key])
            return;
        for (const { callback, ctx } of this._listeners[key]) {
            try {
                callback.call(ctx, value, old);
            }
            catch (e) {
                console.error(`Store notify error for key "${key}":`, e);
            }
        }
    }
}
const store = new Store();
exports.store = store;
function pageMixin(pageConfig) {
    const originalOnLoad = pageConfig.onLoad;
    const originalOnUnload = pageConfig.onUnload;
    pageConfig.onLoad = function (options) {
        if (this.storeKeys) {
            for (const key of this.storeKeys) {
                store.subscribe(key, function (newVal) {
                    if (this.setData) {
                        this.setData({ [key]: newVal });
                    }
                }, this);
            }
        }
        if (originalOnLoad) {
            originalOnLoad.call(this, options);
        }
    };
    pageConfig.onUnload = function () {
        if (this.storeKeys) {
            for (const key of this.storeKeys) {
                store.unsubscribe(key, this);
            }
        }
        if (originalOnUnload) {
            originalOnUnload.call(this);
        }
    };
    return pageConfig;
}

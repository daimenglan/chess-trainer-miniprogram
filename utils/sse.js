"use strict";
/**
 * SSE 流式响应客户端
 * 微信小程序不支持 EventSource / fetch 流，
 * 使用 wx.request 的 enableChunked 模式 + RequestTask.onChunkReceived 接收数据块。
 * 要求基础库 >= 2.20.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSSERequest = createSSERequest;
exports.parseSSEEvents = parseSSEEvents;
exports.decodeArrayBuffer = decodeArrayBuffer;
/**
 * ArrayBuffer → UTF-8 字符串
 */
function decodeArrayBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    try {
        str = decodeURIComponent(escape(String.fromCharCode.apply(null, Array.from(bytes))));
    }
    catch (e) {
        let out = '';
        let i = 0;
        while (i < bytes.length) {
            const b = bytes[i];
            let charCode = b;
            let extra = 0;
            if (b >= 0xf0) {
                charCode = b & 0x07;
                extra = 3;
            }
            else if (b >= 0xe0) {
                charCode = b & 0x0f;
                extra = 2;
            }
            else if (b >= 0xc0) {
                charCode = b & 0x1f;
                extra = 1;
            }
            for (let j = 1; j <= extra && i + j < bytes.length; j++) {
                charCode = (charCode << 6) | (bytes[i + j] & 0x3f);
            }
            out += String.fromCharCode(charCode);
            i += 1 + extra;
        }
        str = out;
    }
    return str;
}
/**
 * 解析 SSE 文本流，返回事件数组
 */
function parseSSEEvents(text, state) {
    const events = [];
    state.buffer += text;
    const parts = state.buffer.split('\n\n');
    state.buffer = parts.pop() || '';
    for (const part of parts) {
        for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr.trim() === '')
                    continue;
                try {
                    events.push(JSON.parse(dataStr));
                }
                catch (e) {
                    // 忽略无法解析的行
                }
            }
        }
    }
    return events;
}
/**
 * 创建 SSE 请求
 */
function createSSERequest(url, data, callbacks) {
    const { onEvent, onError, onDone } = callbacks;
    let baseUrl = 'https://mychess.com.cn';
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        if (app && app.globalData && app.globalData.baseUrl) {
            baseUrl = app.globalData.baseUrl;
        }
    }
    catch (e) { /* non-critical */ }
    const token = wx.getStorageSync('auth_token');
    const state = { buffer: '', done: false };
    let finished = false;
    let chunkedSupported = false;
    const finish = () => {
        if (finished)
            return;
        finished = true;
        onDone && onDone();
    };
    const requestTask = wx.request({
        url: `${baseUrl}${url}`,
        method: 'POST',
        data: data,
        enableChunked: true,
        timeout: 120000,
        header: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        success(res) {
            if (finished)
                return;
            if (res.statusCode !== 200) {
                // 非 200 时不要再走 finish()：它会触发 onDone，
                // 调用方（如整局复盘）的 onDone 会把 onError 刚写入的错误文案清空。
                onError && onError(new Error(`SSE 请求失败 (${res.statusCode})`));
                finished = true;
                return;
            }
            if (!chunkedSupported && typeof res.data === 'string' && res.data) {
                for (const evt of parseSSEEvents(res.data, state)) {
                    onEvent && onEvent(evt);
                }
            }
            finish();
        },
        fail(err) {
            if (finished)
                return;
            onError && onError(new Error(err.errMsg || 'SSE 网络错误'));
            finished = true;
        },
    });
    if (requestTask && typeof requestTask.onChunkReceived === 'function') {
        chunkedSupported = true;
        requestTask.onChunkReceived((res) => {
            if (finished)
                return;
            try {
                const text = decodeArrayBuffer(res.data);
                for (const evt of parseSSEEvents(text, state)) {
                    onEvent && onEvent(evt);
                    if (evt.type === 'done') {
                        finish();
                    }
                    else if (evt.type === 'error') {
                        onError && onError(new Error(evt.message || '流式响应错误'));
                        // 同 success()：出错后不再触发 onDone，保留调用方写入的错误文案
                        finished = true;
                    }
                }
            }
            catch (e) {
                // 单块解析失败不中断整体流
            }
        });
    }
    return {
        abort() {
            if (finished)
                return;
            finished = true;
            try {
                requestTask && requestTask.abort();
            }
            catch (e) { /* non-critical */ }
            onDone && onDone();
        },
    };
}

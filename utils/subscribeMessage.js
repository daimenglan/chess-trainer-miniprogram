"use strict";
/**
 * 小程序订阅消息授权采集（微信「服务通知」推送的前置步骤）
 *
 * 背景：subscribeMessage.send 是「先授权后下发」的接口，未授权会返回 43101。
 * 一次性订阅每授权一次只能下发 1 条，所以额度靠用户每次勾选同意来积累，
 * 后端在 wechat_subscribe_grants 记账（见 backend/src/services/dailyPushService.ts）。
 *
 * 两个必须遵守的微信约束：
 *   1. wx.requestSubscribeMessage 只能在用户点击的同步回调里调用，
 *      异步（setTimeout / Promise then）里调用会静默失败。
 *      因此本模块只导出供页面点击处理器直接调用的函数，不提供定时/自动采集。
 *   2. 用户勾选「总是保持以上选择，不再询问」后，后续调用不弹窗，
 *      直接返回之前的选择 —— 所以每次点击都要调用，由回调结果决定是否上报。
 *
 * tmplIds 由后端 /api/push/preferences 返回的 miniappTemplates 提供：
 * 后端未配置模板 ID 的类别不下发，避免弹出空窗或用户点了同意却永远收不到。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPushSubscribe = requestPushSubscribe;
exports.requestPushSubscribeOne = requestPushSubscribeOne;
/**
 * 请求一个或多个类别的订阅授权。
 *
 * @param categories 要请求的类别（只会传后端已配置模板的类别）
 * @param templates  后端返回的 miniappTemplates
 * @returns 每个类别的授权结果。微信 API 不存在 / 用户取消时返回空数组
 */
function requestPushSubscribe(categories, templates) {
    // 非小程序环境（网页预览 / H5 壳 / 单测）没有 wx，静默跳过而非抛错。
    // 用 typeof 守卫：直接引用 wx 在 Node 环境下会 ReferenceError。
    if (typeof wx === 'undefined' || typeof wx.requestSubscribeMessage !== 'function') {
        return Promise.resolve([]);
    }
    // 只保留有模板 ID 的类别，避免弹空窗
    const pairs = categories
        .filter(c => !!templates[c])
        .map(c => ({ category: c, tmplId: templates[c] }));
    if (pairs.length === 0)
        return Promise.resolve([]);
    return new Promise(resolve => {
        wx.requestSubscribeMessage({
            tmplIds: pairs.map(p => p.tmplId),
            success: (res) => {
                resolve(pairs.map(p => ({
                    category: p.category,
                    state: res[p.tmplId] || 'reject',
                    // 微信只有 'accept' 算同意；'reject' = 本次拒绝，'ban' = 用户选择了不再接收
                    granted: res[p.tmplId] === 'accept',
                    prompted: true,
                })));
            },
            fail: () => {
                // 用户直接关掉弹窗、或接口调用失败：一律按未授权处理
                resolve(pairs.map(p => ({
                    category: p.category,
                    state: 'fail',
                    granted: false,
                    prompted: true,
                })));
            },
        });
    });
}
/**
 * 单个类别的授权便捷封装（设置页开关用）。
 *
 * 返回的 granted 决定开关是否真正打开：
 *  - granted=true  → 上报后端累加额度，开关置开
 *  - granted=false → 上报后端（让额度查询能返回 0，前端据此不再重复弹），开关保持关
 */
function requestPushSubscribeOne(category, templates) {
    return requestPushSubscribe([category], templates);
}

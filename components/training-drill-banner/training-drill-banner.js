"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 训练对弈提示条 — 从周计划入口进入时显示在棋盘页顶部（同网页版 TrainingDrillBanner）
 *
 * 让玩家在开局前就知道「这盘棋练什么、AI 会怎么走、要盯住什么」。
 * 脚本失效（玩家脱谱）后给出状态说明。
 */
Component({
    properties: {
        focusTitle: { type: String, value: '' },
        openingName: { type: String, value: '' },
        openingEco: { type: String, value: '' },
        userSide: { type: String, value: 'white' },
        goal: { type: String, value: '' },
        /** 脚本是否仍在生效；null = 未开局，false = 已脱谱 */
        active: { type: String, value: 'null' },
    },
    data: {
        aborted: false,
        sideLabel: '',
    },
    observers: {
        ['active, userSide'](active, userSide) {
            this.setData({
                aborted: active === 'false',
                sideLabel: userSide === 'white' ? '你执白' : '你执黑',
            });
        },
    },
});
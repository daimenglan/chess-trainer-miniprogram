"use strict";
/**
 * 音效管理器
 *
 * 使用 wx.createAudioContext 播放短音效。
 * 走子、吃子、将杀、计时器警告、胜负等音效。
 * 全局单例，全局开关由 app.globalData.settings.soundEnabled 控制。
 */
Object.defineProperty(exports, "__esModule", { value: true });
// 简单 Web Audio 合成音效（无需音频文件）
let audioContext = null;
function getAudioContext() {
    if (!audioContext) {
        try {
            audioContext = wx.createAudioContext ? wx.createAudioContext() : null;
        }
        catch { /* ignore */ }
    }
    return audioContext;
}
/** 用 Web Audio API 合成短音（备用方案，当无音频文件时） */
function playTone(freq, duration, type = 'sine') {
    try {
        const ctx = getAudioContext();
        if (!ctx)
            return;
        // wx.createAudioContext 需要 src；这里用小程序 audio 组件播放
        // 简化方案：用振动代替（无真实音效时的降级）
    }
    catch { /* ignore */ }
}
class SoundManager {
    constructor() {
        this.enabled = true;
    }
    setEnabled(v) { this.enabled = v; }
    dispatch(type) {
        if (!this.enabled)
            return;
        // 触发全局事件，由页面监听播放具体音效
        // 这里用 wx.vibrateShort 作为无音频文件时的降级提示
        // 实际音效由页面组件通过 wx.createAudio 播放
        try {
            // 不同类型用不同振动模式作为触觉反馈
            if (type === 'timer') {
                wx.vibrateShort({ type: 'medium' });
            }
            else if (type === 'win') {
                wx.vibrateShort({ type: 'heavy' });
            }
            else if (type === 'lose' || type === 'draw') {
                wx.vibrateShort({ type: 'light' });
            }
        }
        catch { /* 部分基础库不支持振动 */ }
    }
    playMoveSound() { this.dispatch('move'); }
    playMoveOpponent() { this.dispatch('move'); }
    playCaptureSound() { this.dispatch('capture'); }
    playCheckSound() { this.dispatch('check'); }
    playCastleSound() { this.dispatch('castle'); }
    playPromoteSound() { this.dispatch('promote'); }
    playGameStartSound() { this.dispatch('gameStart'); }
    playGameOverSound() { this.dispatch('gameEnd'); }
    playWinSound() { this.dispatch('win'); }
    playLoseSound() { this.dispatch('lose'); }
    playDrawSound() { this.dispatch('draw'); }
    playIllegalSound() { this.dispatch('illegal'); }
    playTimerSound() { this.dispatch('timer'); }
}
exports.default = new SoundManager();

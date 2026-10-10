"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 首次设置账号密码页
 *
 * 微信一键登录的用户 password_hash 为空，被后端 requireAuth 的
 * isProfileIncomplete 拦截（返回 PROFILE_INCOMPLETE）后，由 Lichess 绑定页
 * 跳转到本页引导用户补设密码。设密后自动返回继续绑定。
 *
 * 与 H5 的 SetPasswordPage 等价：不需要旧密码（用户本就没有密码），
 * 后端 PUT /api/profile/password 在 password_hash 为空时会跳过旧密码校验。
 */
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    data: {
        __theme__: (typeof getApp === 'function' ? (getApp().globalData?.settings?.uiTheme || 'dark') : 'dark'),
        /** 返回目标页（设置完密码后自动回去） */
        returnTo: '/pages/choice/choice',
        username: '',
        newPassword: '',
        confirmPassword: '',
        error: '',
        loading: false,
    },
    _syncTheme() {
        try {
            const app = getApp();
            const theme = app?.globalData?.settings?.uiTheme || 'dark';
            if (this.data.__theme__ !== theme) {
                this.setData({ __theme__: theme });
            }
        }
        catch (e) { /* non-critical */ }
    },
    onUsernameInput(e) { this.setData({ username: e.detail.value, error: '' }); },
    onNewPasswordInput(e) { this.setData({ newPassword: e.detail.value, error: '' }); },
    onConfirmPasswordInput(e) { this.setData({ confirmPassword: e.detail.value, error: '' }); },
    onSubmit() {
        const { username, newPassword, confirmPassword } = this.data;
        if (!username || username.length < 2 || username.length > 20) {
            this.setData({ error: '请输入 2-20 位用户名' });
            return;
        }
        if (newPassword.length < 6) {
            this.setData({ error: '新密码至少 6 位' });
            return;
        }
        if (newPassword !== confirmPassword) {
            this.setData({ error: '两次密码不一致' });
            return;
        }
        this.setData({ loading: true, error: '' });
        api.setProfilePassword(newPassword)
            .then(() => {
            // 同步更新全局用户名（若用户改了用户名）
            const app = getApp();
            if (app?.globalData?.user && username !== app.globalData.user.username) {
                app.globalData.user.username = username;
                if (typeof app.saveUser === 'function')
                    app.saveUser(app.globalData.user);
            }
            util.showToast('密码设置成功', 'success');
            this.setData({ loading: false });
            // 返回原页面（Lichess 绑定页等），继续后续流程
            // 优先 navigateBack 回到来源页；来源页已被回收时回落到 returnTo
            setTimeout(() => {
                const pages = getCurrentPages();
                if (pages.length > 1) {
                    wx.navigateBack({ delta: 1 });
                }
                else {
                    wx.reLaunch({ url: this.data.returnTo || '/pages/choice/choice' });
                }
            }, 1200);
        })
            .catch((err) => {
            this.setData({ error: err?.message || '设置失败，请重试', loading: false });
        });
    },
    onBack() { wx.navigateBack(); },
});

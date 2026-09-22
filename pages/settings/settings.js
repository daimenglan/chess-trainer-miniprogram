"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 设置页
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const BOARD_THEMES = [
    { key: 'blueWhite', label: '蓝白', colors: { light: '#ffffff', dark: '#5a7d9a' } },
    { key: 'wood', label: '木质', colors: { light: '#f0d9b5', dark: '#b58863' } },
    { key: 'standard', label: '标准', colors: { light: '#ffffff', dark: '#a0a0a0' } },
    { key: 'classic', label: '经典', colors: { light: '#ffffff', dark: '#000000' } },
    { key: 'green', label: '绿色', colors: { light: '#e8f5e9', dark: '#a5d6a7' } },
    { key: 'blue', label: '蓝色', colors: { light: '#e3f2fd', dark: '#90caf9' } },
    { key: 'dark', label: '深色', colors: { light: '#779952', dark: '#446633' } },
];
Page({
    data: {
        settings: app.globalData.settings || app.getDefaultSettings(),
        appSettings: app.globalData.settings || app.getDefaultSettings(),
        themes: BOARD_THEMES,
        // 修改密码
        showPasswordForm: false,
        oldPassword: '',
        newPassword: '',
        confirmNewPassword: '',
        passwordError: '',
        passwordLoading: false,
    },
    onLoad(options) {
        this.setData({
            settings: app.globalData.settings || app.getDefaultSettings(),
            appSettings: { ...app.globalData.settings },
        });
        if (options.tab === 'password') {
            this.setData({ showPasswordForm: true });
        }
    },
    onShow() {
        // 同步最新的主题设置
        this.setData({
            settings: app.globalData.settings || app.getDefaultSettings(),
            appSettings: { ...app.globalData.settings },
            __theme__: app.globalData.settings?.uiTheme || 'dark',
        });
    },
    onThemeSwitch(e) {
        const theme = e.currentTarget.dataset.theme;
        if (theme === 'dark' || theme === 'light') {
            app.setTheme(theme);
            this.setData({
                appSettings: { ...app.globalData.settings },
                __theme__: theme,
            });
        }
    },
    onThemeSelect(e) {
        const key = e.currentTarget.dataset.key;
        const settings = { ...this.data.settings, boardColorPreset: key };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    onToggle(e) {
        const key = e.currentTarget.dataset.key;
        const settings = { ...this.data.settings, [key]: !this.data.settings[key] };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    onSliderChange(e) {
        const key = e.currentTarget.dataset.key;
        const value = parseInt(e.detail.value);
        const settings = { ...this.data.settings, [key]: value };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    onDepthChange(e) {
        const value = parseInt(e.detail.value);
        const settings = { ...this.data.settings, analysisDepth: value };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    onMultiPvChange(e) {
        const value = parseInt(e.detail.value);
        const settings = { ...this.data.settings, analysisMultiPv: value };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    // ===== 修改密码 =====
    onTogglePassword() {
        this.setData({ showPasswordForm: !this.data.showPasswordForm, passwordError: '' });
    },
    onOldPwdInput(e) { this.setData({ oldPassword: e.detail.value, passwordError: '' }); },
    onNewPwdInput(e) { this.setData({ newPassword: e.detail.value, passwordError: '' }); },
    onConfirmPwdInput(e) { this.setData({ confirmNewPassword: e.detail.value, passwordError: '' }); },
    onSubmitPassword() {
        const { oldPassword, newPassword, confirmNewPassword } = this.data;
        if (!oldPassword || !newPassword) {
            this.setData({ passwordError: '请填写完整' });
            return;
        }
        if (newPassword.length < 6) {
            this.setData({ passwordError: '密码至少6位' });
            return;
        }
        if (newPassword !== confirmNewPassword) {
            this.setData({ passwordError: '两次密码不一致' });
            return;
        }
        this.setData({ passwordLoading: true });
        api.changePassword(oldPassword, newPassword)
            .then(() => {
            util.showToast('密码修改成功', 'success');
            this.setData({ showPasswordForm: false, oldPassword: '', newPassword: '', confirmNewPassword: '' });
        })
            .catch((err) => {
            this.setData({ passwordError: err.message || '修改失败' });
        })
            .finally(() => {
            this.setData({ passwordLoading: false });
        });
    },
});

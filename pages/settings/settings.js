"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 设置页 - 系统主题/棋盘主题/显示选项/分析设置/AI难度/通知/隐私/数据管理/关于
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
        // 通知设置
        showNotificationSettings: false,
        // 隐私设置
        showPrivacySettings: false,
        // 数据管理
        showDataSettings: false,
        // 关于
        showAbout: false,
        appVersion: '1.0.0',
        cacheSize: '0KB',
        // 重置确认
        showResetConfirm: false,
    },
    onLoad(options) {
        this.setData({
            settings: app.globalData.settings || app.getDefaultSettings(),
            appSettings: { ...app.globalData.settings },
        });
        if (options.tab === 'password') {
            this.setData({ showPasswordForm: true });
        }
        this.loadAppInfo();
    },
    onShow() {
        // 同步最新的主题设置
        this.setData({
            settings: app.globalData.settings || app.getDefaultSettings(),
            appSettings: { ...app.globalData.settings },
            __theme__: app.globalData.settings?.uiTheme || 'dark',
        });
    },
    // ===== 主题设置 =====
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
    // ===== 显示选项 =====
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
    // ===== 通知设置 =====
    onToggleNotificationSettings() {
        this.setData({ showNotificationSettings: !this.data.showNotificationSettings });
    },
    onNotificationToggle(e) {
        const key = e.currentTarget.dataset.key;
        const settings = { ...this.data.settings, [key]: !this.data.settings[key] };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    // ===== 隐私设置 =====
    onTogglePrivacySettings() {
        this.setData({ showPrivacySettings: !this.data.showPrivacySettings });
    },
    onPrivacyToggle(e) {
        const key = e.currentTarget.dataset.key;
        const settings = { ...this.data.settings, [key]: !this.data.settings[key] };
        app.globalData.settings = settings;
        app.saveSettings();
        this.setData({ settings });
    },
    // ===== 数据管理 =====
    onToggleDataSettings() {
        this.setData({ showDataSettings: !this.data.showDataSettings });
    },
    /** 计算缓存大小 */
    loadAppInfo() {
        try {
            // 估算缓存大小
            let cacheSize = 0;
            try {
                const keys = wx.getStorageInfoSync();
                cacheSize = keys.currentSize || 0;
            }
            catch { }
            this.setData({
                appVersion: '1.0.0',
                cacheSize: (cacheSize / 1024).toFixed(1) + 'KB',
            });
        }
        catch { }
    },
    /** 清除缓存 */
    onClearCache() {
        wx.showModal({
            title: '确认清除缓存',
            content: '将清除本地缓存数据（设置、偏好等），不影响账号数据',
            success: (res) => {
                if (res.confirm) {
                    try {
                        // 保留关键数据
                        const token = wx.getStorageSync('auth_token');
                        const user = wx.getStorageSync('user_info');
                        const settings = wx.getStorageSync('app_settings');
                        // 清除所有缓存
                        wx.clearStorage();
                        // 恢复关键数据
                        if (token)
                            wx.setFileSync('auth_token', token);
                        if (user)
                            wx.setFileSync('user_info', user);
                        if (settings)
                            wx.setFileSync('app_settings', settings);
                        util.showToast('缓存已清除', 'success');
                        this.loadAppInfo();
                    }
                    catch (err) {
                        util.showToast('清除失败: ' + (err.message || '未知错误'));
                    }
                }
            },
        });
    },
    /** 导出数据 */
    onExportData() {
        wx.showModal({
            title: '导出数据',
            content: '将导出你的游戏记录和设置到本地文件',
            success: (res) => {
                if (res.confirm) {
                    util.showLoading('导出中...');
                    api.getProfile()
                        .then((profileRes) => {
                        const data = {
                            profile: profileRes?.data || null,
                            settings: app.globalData.settings,
                            exportTime: new Date().toISOString(),
                        };
                        const json = JSON.stringify(data, null, 2);
                        // 在小程序中使用文件系统保存
                        const fs = wx.getFileSystemManager();
                        const filePath = `${wx.env.USER_DATA_PATH}/mychess_export.json`;
                        fs.writeFile({
                            filePath,
                            data: json,
                            encoding: 'utf8',
                            success: () => {
                                util.hideLoading();
                                util.showToast('已导出到: ' + filePath, 'success', 3000);
                            },
                            fail: (err) => {
                                util.hideLoading();
                                util.showToast('导出失败: ' + (err.errMsg || '未知错误'));
                            },
                        });
                    })
                        .catch((err) => {
                        util.hideLoading();
                        util.showToast('导出失败: ' + (err.message || '未知错误'));
                    });
                }
            },
        });
    },
    /** 重置所有设置 */
    onResetSettings() {
        this.setData({ showResetConfirm: true });
    },
    onConfirmReset() {
        const defaults = app.getDefaultSettings();
        app.globalData.settings = defaults;
        app.saveSettings();
        this.setData({
            settings: defaults,
            appSettings: { ...defaults },
            showResetConfirm: false,
            showPasswordForm: false,
            showNotificationSettings: false,
            showPrivacySettings: false,
            showDataSettings: false,
        });
        util.showToast('已恢复默认设置', 'success');
    },
    onCancelReset() {
        this.setData({ showResetConfirm: false });
    },
    // ===== 关于 =====
    onToggleAbout() {
        this.setData({ showAbout: !this.data.showAbout });
    },
    onCheckUpdate() {
        util.showToast('已是最新版本', 'info');
    },
    onFeedback() {
        wx.navigateTo({ url: '/pages/feedback/feedback' });
    },
    onAboutPage() {
        wx.navigateTo({ url: '/pages/about/about' });
    },
    /** 阻止事件冒泡 */
    stopPropagation() { },
});

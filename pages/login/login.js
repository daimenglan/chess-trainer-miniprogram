"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 登录/注册页
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
Page({
    data: {
        mode: 'login', // 'login' | 'register'
        username: '',
        password: '',
        confirmPassword: '',
        loading: false,
        error: '',
        // 装饰性浮动棋子（WXML 不支持 Math，位置在 JS 侧预计算）
        floatPieces: ['♚', '♛', '♜', '♝', '♞', '♟', '♔', '♕', '♖', '♗', '♘', '♙'].map((ch, i) => ({
            ch,
            left: (i % 4) * 25 + 10,
            top: Math.floor(i / 4) * 25 + 5,
            size: 32 + i * 8,
            delay: i * 0.5,
        })),
    },
    onSwitchMode() {
        this.setData({
            mode: this.data.mode === 'login' ? 'register' : 'login',
            error: '',
            username: '',
            password: '',
            confirmPassword: '',
        });
    },
    onUsernameInput(e) {
        this.setData({ username: e.detail.value, error: '' });
    },
    onPasswordInput(e) {
        this.setData({ password: e.detail.value, error: '' });
    },
    onConfirmInput(e) {
        this.setData({ confirmPassword: e.detail.value, error: '' });
    },
    onSubmit() {
        const { username, password, mode } = this.data;
        if (!username.trim()) {
            this.setData({ error: '请输入用户名' });
            return;
        }
        if (!password) {
            this.setData({ error: '请输入密码' });
            return;
        }
        if (password.length < 6) {
            this.setData({ error: '密码至少6位' });
            return;
        }
        if (mode === 'register' && password !== this.data.confirmPassword) {
            this.setData({ error: '两次密码不一致' });
            return;
        }
        this.setData({ loading: true, error: '' });
        const request = mode === 'login' ? api.login(username, password) : api.register(username, password);
        request
            .then((res) => {
            if (res?.data?.token) {
                app.setToken(res.data.token);
                // 后端 login/register 返回的 user 字段在 data 顶层（userId, username, ...）
                // 不是嵌套在 data.user 下
                app.saveUser({
                    userId: res.data.userId,
                    username: res.data.username,
                    role: res.data.role,
                    avatarUrl: res.data.avatarUrl,
                });
                wx.showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
                wx.redirectTo({ url: '/pages/choice/choice' });
            }
            else {
                this.setData({ error: res?.error || '操作失败' });
            }
        })
            .catch((err) => {
            this.setData({ error: err.message || '网络错误' });
        })
            .finally(() => {
            this.setData({ loading: false });
        });
    },
    onSkip() {
        wx.switchTab({ url: '/pages/index/index' });
    },
});

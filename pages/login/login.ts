/**
 * 登录/注册/忘记密码页
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({

  /** 同步主题 */
  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    mode: 'login', // 'login' | 'register' | 'forgot'
    // 忘记密码子步骤：'send'（输入邮箱获取验证码）| 'reset'（输入验证码+新密码）
    forgotStep: 'send',
    username: '',
    password: '',
    confirmPassword: '',
    registerEmail: '',   // 注册用邮箱，用于找回密码
    refCode: '',          // 推荐码
    loading: false,
    error: '',
    // 忘记密码相关
    email: '',
    code: '',
    newPassword: '',
    confirmNewPassword: '',
    countdown: 0,           // 倒计时秒数
    _timer: null as any,    // 倒计时定时器
    // 装饰性浮动棋子
    floatPieces: ['♚', '♛', '♜', '♝', '♞', '♟', '♔', '♕', '♖', '♗', '♘', '♙'].map((ch: string, i: number) => ({
      ch,
      left: (i % 4) * 25 + 10,
      top: Math.floor(i / 4) * 25 + 5,
      size: 32 + i * 8,
      delay: i * 0.5,
    })),
  },

  onSwitchMode(e: any) {
    const target = e?.currentTarget?.dataset?.mode || 'login';
    this.clearCountdown();
    this.setData({
      mode: target,
      forgotStep: 'send',
      error: '',
      username: '',
      password: '',
      confirmPassword: '',
      registerEmail: '',
      refCode: '',
      email: '',
      code: '',
      newPassword: '',
      confirmNewPassword: '',
    });
  },

  /** 点击"忘记密码？"进入忘记密码模式 */
  onForgotPassword() {
    this.clearCountdown();
    this.setData({
      mode: 'forgot',
      forgotStep: 'send',
      error: '',
      username: '',
      password: '',
      confirmPassword: '',
      registerEmail: '',
      refCode: '',
      email: '',
      code: '',
      newPassword: '',
      confirmNewPassword: '',
    });
  },

  /** 返回登录模式 */
  onBackToLogin() {
    this.clearCountdown();
    this.setData({
      mode: 'login',
      forgotStep: 'send',
      error: '',
      email: '',
      code: '',
      newPassword: '',
      confirmNewPassword: '',
    });
  },

  onUsernameInput(e: any) {
    this.setData({ username: e.detail.value, error: '' });
  },

  onPasswordInput(e: any) {
    this.setData({ password: e.detail.value, error: '' });
  },

  onConfirmInput(e: any) {
    this.setData({ confirmPassword: e.detail.value, error: '' });
  },

  onRegisterEmailInput(e: any) {
    this.setData({ registerEmail: e.detail.value.trim(), error: '' });
  },

  onRefCodeInput(e: any) {
    this.setData({ refCode: e.detail.value.trim(), error: '' });
  },

  // ---- 忘记密码表单输入 ----
  onEmailInput(e: any) {
    this.setData({ email: e.detail.value.trim(), error: '' });
  },

  onCodeInput(e: any) {
    this.setData({ code: e.detail.value.trim(), error: '' });
  },

  onNewPasswordInput(e: any) {
    this.setData({ newPassword: e.detail.value, error: '' });
  },

  onConfirmNewPasswordInput(e: any) {
    this.setData({ confirmNewPassword: e.detail.value, error: '' });
  },

  /** 发送验证码 */
  onSendCode() {
    const { email } = this.data;

    if (!email) {
      this.setData({ error: '请输入邮箱地址' });
      return;
    }
    // 简单邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setData({ error: '邮箱格式不正确' });
      return;
    }

    this.setData({ loading: true, error: '' });

    api.forgotPassword(email)
      .then((res: any) => {
        wx.showToast({ title: '验证码已发送（若邮箱已注册）', icon: 'none', duration: 3000 });
        this.setData({ forgotStep: 'reset', loading: false });
        this.startCountdown(60);
      })
      .catch((err: any) => {
        this.setData({ error: err.message || '发送失败，请稍后重试', loading: false });
      });
  },

  /** 重设密码 */
  onResetPassword() {
    const { email, code, newPassword, confirmNewPassword } = this.data;

    if (!code) {
      this.setData({ error: '请输入验证码' });
      return;
    }
    if (!newPassword) {
      this.setData({ error: '请输入新密码' });
      return;
    }
    if (newPassword.length < 6) {
      this.setData({ error: '新密码至少6位' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      this.setData({ error: '两次密码不一致' });
      return;
    }

    this.setData({ loading: true, error: '' });

    api.resetPassword(email, code, newPassword)
      .then((res: any) => {
        wx.showToast({ title: '密码重设成功', icon: 'success' });
        this.clearCountdown();
        this.setData({
          mode: 'login',
          forgotStep: 'send',
          loading: false,
          error: '',
          email: '',
          code: '',
          newPassword: '',
          confirmNewPassword: '',
          password: '',
        });
      })
      .catch((err: any) => {
        this.setData({ error: err.message || '重设失败', loading: false });
      });
  },

  /** 登录/注册提交 */
  onSubmit() {
    const { username, password, registerEmail, refCode, mode } = this.data;

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

    const request = mode === 'login'
      ? api.login(username, password)
      : api.register(username, password, this.data.registerEmail || undefined, refCode || undefined);

    request
      .then((res: any) => {
        if (res?.data?.token) {
          app.setToken(res.data.token);
          // 存储用户信息（含会员/教师状态，与网页版同步）
          app.saveUser({
            userId: res.data.userId,
            username: res.data.username,
            role: res.data.role,
            avatarUrl: res.data.avatarUrl,
            membership: res.data.membership || null,
            teacherStatus: res.data.teacherStatus || null,
            lichessUsername: res.data.lichessUsername || null,
          });
          wx.showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
          wx.switchTab({ url: '/pages/choice/choice' });
        } else {
          this.setData({ error: res?.error || '操作失败' });
        }
      })
      .catch((err: any) => {
        this.setData({ error: err.message || '网络错误' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  /** Lichess OAuth 登录 */
  onLichessLogin() {
    this.setData({ loading: true, error: '' });

    api.lichessLogin()
      .then((res: any) => {
        const authUrl = res?.data?.url;
        if (authUrl) {
          // 在小程序中打开 Lichess OAuth 授权页面
          wx.redirectTo({ url: `/pages/webview/webview?url=${encodeURIComponent(authUrl)}` });
        } else {
          this.setData({ error: 'Lichess 登录服务暂时不可用', loading: false });
        }
      })
      .catch((err: any) => {
        this.setData({ error: err.message || 'Lichess 登录失败', loading: false });
      });
  },

  /** 开启倒计时 */
  startCountdown(seconds: number) {
    this.clearCountdown();
    this.setData({ countdown: seconds });
    this.data._timer = setInterval(() => {
      let c = this.data.countdown - 1;
      if (c <= 0) {
        this.clearCountdown();
        this.setData({ countdown: 0 });
      } else {
        this.setData({ countdown: c });
      }
    }, 1000);
  },

  /** 清除倒计时 */
  clearCountdown() {
    if (this.data._timer) {
      clearInterval(this.data._timer);
      this.data._timer = null;
    }
  },

  onShow() {
    this._syncTheme();
  },

  onUnload() {
    this.clearCountdown();
  },

});export {}
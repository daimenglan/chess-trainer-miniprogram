/**
 * 重置密码页
 */
const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    step: 'email',
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
    error: '',
    loading: false,
    countdown: 0,
  },

  _syncTheme() {
    try {
      const app = getApp();
      const theme = app?.globalData?.settings?.uiTheme || 'dark';
      if (this.data.__theme__ !== theme) {
        this.setData({ __theme__: theme });
      }
    } catch(e) { /* non-critical */ }
  },

  onEmailInput(e: any) { this.setData({ email: e.detail.value.trim(), error: '' }); },
  onCodeInput(e: any) { this.setData({ code: e.detail.value.trim(), error: '' }); },
  onNewPasswordInput(e: any) { this.setData({ newPassword: e.detail.value, error: '' }); },
  onConfirmPasswordInput(e: any) { this.setData({ confirmPassword: e.detail.value, error: '' }); },

  onSendCode() {
    const { email } = this.data;
    if (!email) { this.setData({ error: '请输入邮箱地址' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.setData({ error: '邮箱格式不正确' }); return; }
    this.setData({ loading: true, error: '' });
    api.forgotPassword(email)
      .then(() => {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.setData({ step: 'reset', loading: false });
        this.startCountdown(60);
      })
      .catch((err: any) => { this.setData({ error: err.message || '发送失败', loading: false }); });
  },

  onResetPassword() {
    const { email, code, newPassword, confirmPassword } = this.data;
    if (!code) { this.setData({ error: '请输入验证码' }); return; }
    if (newPassword.length < 6) { this.setData({ error: '新密码至少6位' }); return; }
    if (newPassword !== confirmPassword) { this.setData({ error: '两次密码不一致' }); return; }
    this.setData({ loading: true, error: '' });
    api.resetPassword(email, code, newPassword)
      .then(() => {
        wx.showToast({ title: '密码重设成功', icon: 'success' });
        setTimeout(() => { wx.reLaunch({ url: '/pages/login/login' }); }, 2000);
      })
      .catch((err: any) => { this.setData({ error: err.message || '重设失败', loading: false }); });
  },

  startCountdown(seconds: number) {
    this.setData({ countdown: seconds });
    const timer = setInterval(() => {
      if (this.data.countdown <= 1) { clearInterval(timer); this.setData({ countdown: 0 }); }
      else { this.setData({ countdown: this.data.countdown - 1 }); }
    }, 1000);
  },

  onBack() { wx.navigateBack(); },
});

export {};
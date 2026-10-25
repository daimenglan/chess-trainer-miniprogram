/**
 * 设置页 - 系统主题/棋盘主题/显示选项/分析设置/AI难度/通知/隐私/数据管理/关于
 */
const app = getApp();
const api = require('../../utils/api');
const util = require('../../utils/util');
const subscribeMessage = require('../../utils/subscribeMessage');

/** 四类服务通知的 key → 展示名（toast 提示用）。
 *  用 as const 让 key 收敛为字面量联合类型，后续索引 pushPrefs 才类型安全 */
const PUSH_LABELS = {
  puzzle: '每日习题提醒',
  opening: '每日开局提醒',
  review: '每日复盘提醒',
  play: '每日对弈提醒',
} as const;

/** 服务通知类别（与 utils/subscribeMessage.PushCategory 同源） */
type PushCategory = keyof typeof PUSH_LABELS;

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
    // 微信服务通知（每日习题/开局/复盘/对弈）
    pushLoaded: false,
    pushLoading: false,
    pushEnabled: false,
    pushShowSwitches: false,
    pushPrefs: { puzzle: true, opening: true, review: true, play: true },
    pushTemplates: {} as Record<string, string>,
    pushMiniappReady: false,
    pushOfficialReady: false,
    pushHint: '',
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

  onLoad(options: any) {
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
    this.loadPushPreferences();
  },

  // ===== 微信服务通知 =====

  /**
   * 拉取推送偏好与通道状态。
   *
   * 未登录时后端返回 401：此时不显示四类开关（pushLoaded 保持 false），
   * 也不弹错误——设置页的其它区块同样是登录态才有效。
   */
  loadPushPreferences() {
    if (!app.globalData.token) {
      this.setData({ pushLoaded: false });
      return;
    }
    api.getPushPreferences()
      .then((res: any) => {
        const d = res?.data || res || {};
        const prefs = d.preferences || {};
        const templates = d.miniappTemplates || {};
        const miniappReady = !!d.miniappReady;
        const officialReady = !!d.officialReady;
        const enabled = !!d.enabled;
        this.setData({
          pushLoaded: true,
          pushEnabled: enabled,
          // 总开关关闭时不显示四类开关，只展示「功能未开放」提示
          pushShowSwitches: enabled,
          pushPrefs: {
            puzzle: prefs.puzzle !== false,
            opening: prefs.opening !== false,
            review: prefs.review !== false,
            play: prefs.play !== false,
          },
          pushTemplates: templates,
          pushMiniappReady: miniappReady,
          pushOfficialReady: officialReady,
          pushHint: this._buildPushHint(enabled, miniappReady, officialReady),
        });
      })
      .catch(() => {
        // 拉取失败不阻塞设置页其它功能，四类开关保持隐藏
        this.setData({ pushLoaded: false });
      });
  },

  /** 根据总开关与两条通道的可用状态给出引导文案 */
  _buildPushHint(enabled: boolean, miniappReady: boolean, officialReady: boolean): string {
    if (!enabled) {
      return '每日服务通知推送暂未开放，可在「我的 → 管理后台」开启';
    }
    if (miniappReady && officialReady) {
      return '开启时会请求微信授权，每次同意可下发 1 条；额度用完后自动改走服务号通知。';
    }
    if (miniappReady) {
      return '开启时会请求微信授权，每次同意可下发 1 条。';
    }
    if (officialReady) {
      return '开启后将在微信「服务通知」中推送，需先关注 mychess 服务号。';
    }
    return '服务通知暂未开放，可先在「消息信箱」查看训练提醒。';
  },

  /**
   * 点击某类服务通知开关。
   *
   * 打开与关闭的路径不同：
   *  - 打开：必须先弹 wx.requestSubscribeMessage（微信要求授权只能在用户点击的
   *    同步回调里请求），用户勾了同意才真正落库；拒绝则开关保持关闭。
   *  - 关闭：不需要授权，直接更新偏好。
   */
  onTogglePush(e: any) {
    const cat = e.currentTarget.dataset.cat as PushCategory;
    if (!cat || !(cat in PUSH_LABELS)) return;
    if (this.data.pushLoading) return;

    const currentlyOn = !!this.data.pushPrefs[cat];

    if (currentlyOn) {
      this._savePushPref(cat, false);
      return;
    }

    // 打开：先取授权
    this.setData({ pushLoading: true });
    // 必须在点击的同步调用栈里请求授权，不能在 .then 里（微信会静默失败）。
    // 因此这里直接同步调用，结果通过 Promise 拿。
    const results = subscribeMessage.requestPushSubscribeOne(cat, this.data.pushTemplates) as any;
    Promise.resolve(results)
      .then(async (list: any[]) => {
        const first = Array.isArray(list) ? list[0] : null;
        if (!first) {
          // 非小程序环境或该类别未配置模板
          wx.showToast({ title: '当前环境不支持授权', icon: 'none' });
          return;
        }
        if (!first.granted) {
          wx.showToast({ title: `未授权，${PUSH_LABELS[cat]}保持关闭`, icon: 'none' });
          return;
        }
        // 上报授权累加额度，再落库开关
        const tmplId = this.data.pushTemplates[cat] as string;
        try {
          await api.reportSubscribeGrant({ category: cat, tmplId, granted: true });
        } catch (err) { /* 上报失败不阻断开关，额度下次补记 */ }
        await this._savePushPref(cat, true);
        wx.showToast({ title: `${PUSH_LABELS[cat]}已开启`, icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '授权失败，请重试', icon: 'none' });
      })
      .finally(() => {
        this.setData({ pushLoading: false });
      });
  },

  /** 更新某类开关（失败时回滚本地状态，避免界面与后端不一致） */
  _savePushPref(cat: PushCategory, value: boolean): Promise<any> {
    const prev = { ...this.data.pushPrefs };
    const next = { ...prev, [cat]: value };
    this.setData({ pushPrefs: next });
    const body: Record<string, boolean> = {};
    body[cat] = value;
    return api.updatePushPreferences(body)
      .then((res: any) => {
        const d = res?.data || res || {};
        if (d.preferences) {
          this.setData({ pushPrefs: { ...next, ...d.preferences } });
        }
      })
      .catch((err: any) => {
        // 回滚，让开关回到服务端的真实状态
        this.setData({ pushPrefs: prev });
        wx.showToast({ title: err?.message || '保存失败', icon: 'none' });
      });
  },

  // ===== 主题设置 =====

  onThemeSwitch(e: any) {
    const theme = e.currentTarget.dataset.theme;
    if (theme === 'dark' || theme === 'light') {
      app.setTheme(theme);
      this.setData({
        appSettings: { ...app.globalData.settings },
        __theme__: theme,
      });
    }
  },

  onThemeSelect(e: any) {
    const key = e.currentTarget.dataset.key;
    const settings = { ...this.data.settings, boardColorPreset: key };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  // ===== 显示选项 =====

  onToggle(e: any) {
    const key = e.currentTarget.dataset.key;
    const settings = { ...this.data.settings, [key]: !this.data.settings[key] };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  onSliderChange(e: any) {
    const key = e.currentTarget.dataset.key;
    const value = parseInt(e.detail.value);
    const settings = { ...this.data.settings, [key]: value };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  onDepthChange(e: any) {
    const value = parseInt(e.detail.value);
    const settings = { ...this.data.settings, analysisDepth: value };
    app.globalData.settings = settings;
    app.saveSettings();
    this.setData({ settings });
  },

  onMultiPvChange(e: any) {
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

  onOldPwdInput(e: any) { this.setData({ oldPassword: e.detail.value, passwordError: '' }); },
  onNewPwdInput(e: any) { this.setData({ newPassword: e.detail.value, passwordError: '' }); },
  onConfirmPwdInput(e: any) { this.setData({ confirmNewPassword: e.detail.value, passwordError: '' }); },

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
      .catch((err: any) => {
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

  onNotificationToggle(e: any) {
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

  onPrivacyToggle(e: any) {
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
      } catch {}
      this.setData({
        appVersion: '1.0.0',
        cacheSize: (cacheSize / 1024).toFixed(1) + 'KB',
      });
    } catch {}
  },

  /** 清除缓存 */
  onClearCache() {
    wx.showModal({
      title: '确认清除缓存',
      content: '将清除本地缓存数据（设置、偏好等），不影响账号数据',
      success: (res: any) => {
        if (res.confirm) {
          try {
            // 保留关键数据
            const token = (wx as any).getStorageSync('auth_token');
            const user = (wx as any).getStorageSync('user_info');
            const settings = (wx as any).getStorageSync('app_settings');
            // 清除所有缓存
            (wx as any).clearStorage();
            // 恢复关键数据
            if (token) (wx as any).setFileSync('auth_token', token);
            if (user) (wx as any).setFileSync('user_info', user);
            if (settings) (wx as any).setFileSync('app_settings', settings);
            util.showToast('缓存已清除', 'success');
            this.loadAppInfo();
          } catch (err: any) {
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
      success: (res: any) => {
        if (res.confirm) {
          util.showLoading('导出中...');
          api.getProfile()
            .then((profileRes: any) => {
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
                fail: (err: any) => {
                  util.hideLoading();
                  util.showToast('导出失败: ' + (err.errMsg || '未知错误'));
                },
              });
            })
            .catch((err: any) => {
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
  stopPropagation() {},
});

export {}
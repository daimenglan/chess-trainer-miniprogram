/**
 * 用户自建习题解答页
 */
const api = require('../../../utils/api');
const util = require('../../../utils/util');

Page({
  data: {
    __theme__: (typeof getApp === "function" ? (getApp().globalData?.settings?.uiTheme || "dark") : "dark"),
    puzzle: null as any,
    loading: true,
    puzzleId: 0,
    result: null as any,
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

  onLoad(e: any) {
    this._syncTheme();
    const id = parseInt(e.id) || 0;
    this.setData({ puzzleId: id });
    if (!util.requireLogin('习题记录')) {
      return;
    }
    this.loadPuzzle();
  },

  async loadPuzzle() {
    this.setData({ loading: true });
    try {
      const res = await api.getUserPuzzleDetail(this.data.puzzleId);
      const data = res?.data || res;
      this.setData({ puzzle: data, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  onSolve(correct: boolean) {
    api.solveUserPuzzle(this.data.puzzleId, correct)
      .then((res: any) => {
        const data = res?.data || res;
        this.setData({ result: data });
        wx.showToast({ title: correct ? '答对了！' : '答错了', icon: correct ? 'success' : 'none' });
      })
      .catch((err: any) => {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },

  onBack() {
    wx.navigateBack();
  },
});

export {};
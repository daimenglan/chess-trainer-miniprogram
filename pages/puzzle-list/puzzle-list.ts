/**
 * 错题本与收藏页
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
    activeTab: 'wrong',
    // 错题本
    wrongItems: [] as any[],
    loadingWrong: false,
    wrongPage: 1,
    // 收藏
    favItems: [] as any[],
    loadingFav: false,
    favPage: 1,
    // 分页
    limit: 20,
    hasMore: false,
  },

  onShow() {
    this._syncTheme();
    this.loadWrongBook();
  },

  onTabSwitch(e: any) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'wrong') this.loadWrongBook();
    else this.loadFavorites();
  },

  async loadWrongBook() {
    this.setData({ loadingWrong: true });
    try {
      const res = await api.getWrongBook(this.data.wrongPage, this.data.limit, false);
      const items = res?.data?.items || [];
      this.setData({
        wrongItems: this.data.wrongPage === 1 ? items : [...this.data.wrongItems, ...items],
        hasMore: items.length >= this.data.limit,
        loadingWrong: false,
      });
    } catch {
      this.setData({ loadingWrong: false });
    }
  },

  async loadFavorites() {
    this.setData({ loadingFav: true });
    try {
      const res = await api.getPuzzleFavorites(this.data.favPage, this.data.limit);
      const items = res?.data?.items || [];
      this.setData({
        favItems: this.data.favPage === 1 ? items : [...this.data.favItems, ...items],
        hasMore: items.length >= this.data.limit,
        loadingFav: false,
      });
    } catch {
      this.setData({ loadingFav: false });
    }
  },

  onLoadMore() {
    if (this.data.activeTab === 'wrong') {
      this.setData({ wrongPage: this.data.wrongPage + 1 });
      this.loadWrongBook();
    } else {
      this.setData({ favPage: this.data.favPage + 1 });
      this.loadFavorites();
    }
  },

  onPracticeWrong(e: any) {
    const puzzleId = e.currentTarget.dataset.puzzleid;
    wx.navigateTo({ url: `/pages/puzzles/puzzles?puzzleId=${puzzleId}&auto=1` });
  },

  async onResolveWrong(e: any) {
    const puzzleId = e.currentTarget.dataset.puzzleid;
    try {
      await api.resolveWrongBook(puzzleId);
      util.showToast('已标记为已掌握', 'success');
      this.setData({ wrongItems: [], wrongPage: 1 });
      this.loadWrongBook();
    } catch (err: any) {
      util.showToast(err.message || '操作失败');
    }
  },

  onPracticeFav(e: any) {
    const puzzleId = e.currentTarget.dataset.puzzleid;
    wx.navigateTo({ url: `/pages/puzzles/puzzles?puzzleId=${puzzleId}&auto=1` });
  },

  async onRemoveFav(e: any) {
    const puzzleId = e.currentTarget.dataset.puzzleid;
    try {
      await api.removePuzzleFavorite(puzzleId);
      util.showToast('已移除', 'success');
      this.setData({ favItems: [], favPage: 1 });
      this.loadFavorites();
    } catch (err: any) {
      util.showToast(err.message || '操作失败');
    }
  },

  phaseLabel(p: string): string {
    return p === 'opening' ? '开局' : p === 'middlegame' ? '中局' : p === 'endgame' ? '残局' : '综合';
  },
});
export {}
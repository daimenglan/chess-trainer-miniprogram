/**
 * 关于页
 */
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
    version: '2.0.0',
    features: [
      { icon: '🤖', title: 'AI 对弈', desc: '基于 Stockfish 引擎，1-10级难度调节' },
      { icon: '📊', title: '实时分析', desc: '候选走法评分、优缺点、战术标签' },
      { icon: '💬', title: 'AI 教练', desc: '自然语言问答，随时指导你的每一步' },
      { icon: '📚', title: '棋谱库', desc: '导入、回放、分析经典棋谱' },
      { icon: '🔍', title: '复盘分析', desc: '自动识别好坏走法，生成棋手档案' },
      { icon: '♟', title: '手动推演', desc: '自由推演变化，探索最佳走法' },
      { icon: '🧩', title: '习题训练', desc: '多维筛选、AI讲解、错题本、等级分' },
      { icon: '📋', title: '训练计划', desc: '个性化推荐，弱点分析提升方案' },
            { icon: '👑', title: '会员体系', desc: '多等级会员、权益配额、兑换码' },
    ],
  },

  onShow() {
    this._syncTheme();
  },

  /** 打开《用户服务协议》/《隐私政策》 */
  onOpenAgreement(e: any) {
    const doc = e?.currentTarget?.dataset?.doc === 'privacy' ? 'privacy' : 'service';
    wx.navigateTo({ url: `/pages/agreement/agreement?doc=${doc}` });
  },

});export {}

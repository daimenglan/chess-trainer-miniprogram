/**
 * 不良走法确认弹窗
 */
Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    moveDesc: {
      type: String,
      value: '',
    },
    userScore: {
      type: Number,
      value: 0,
    },
    bestScore: {
      type: Number,
      value: 0,
    },
    loss: {
      type: Number,
      value: 0,
    },
  },

  data: {
    isCritical: false,
    isSignificant: false,
    warningText: '',
    userScoreText: '0.00',
    bestScoreText: '0.00',
    lossText: '0.00',
  },

  observers: {
    'loss, userScore, bestScore': function (loss: number, userScore: number, bestScore: number) {
      const isCritical = loss >= 1.5;
      const isSignificant = loss >= 1.0;
      let warningText = '此走法可能不是最佳选择';
      if (isCritical) warningText = '⚠️ 这是一个严重失误！';
      else if (isSignificant) warningText = '⚠️ 此走法有较大风险';
      // WXML 不支持 toFixed，文本在 JS 侧预格式化
      this.setData({
        isCritical,
        isSignificant,
        warningText,
        userScoreText: (userScore || 0).toFixed(2),
        bestScoreText: (bestScore || 0).toFixed(2),
        lossText: (loss || 0).toFixed(2),
      });
    },
  },

  methods: {
    onExplore() {
      this.triggerEvent('explore');
    },

    onAutoExplore() {
      this.triggerEvent('autoexplore');
    },

    onConfirm() {
      this.triggerEvent('confirm');
    },

    onCancel() {
      this.triggerEvent('cancel');
    },

    // 阻止事件冒泡（内层卡片 catchtap 配套的空处理器）
    stopPropagation() {},
  },
});

export {};
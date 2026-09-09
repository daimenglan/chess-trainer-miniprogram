/**
 * 走法历史组件
 */
const CLASSIFICATION_ICONS: Record<string, string> = {
  best: '⭐',
  good: '👍',
  inaccuracy: '⚠️',
  mistake: '❌',
  blunder: '💥',
};

Component({
  properties: {
    moveHistory: {
      type: Array,
      value: [],
    },
    moveReviews: {
      type: Object,
      value: {},
    },
    replayIndex: {
      type: Number,
      value: -1,
    },
    isReplay: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    movePairs: [] as any[],
  },

  observers: {
    'moveHistory, moveReviews': function (history: any[], reviews: Record<number, any>) {
      // WXML 不能调用 JS 函数，复盘图标在 JS 侧预计算
      const pairs: any[] = [];
      for (let i = 0; i < history.length; i += 2) {
        pairs.push({
          number: Math.floor(i / 2) + 1,
          white: history[i],
          whiteIndex: i,
          whiteReviewIcon: reviews && reviews[i] ? (CLASSIFICATION_ICONS[reviews[i].classification] || '') : '',
          black: history[i + 1] || null,
          blackIndex: i + 1,
          blackReviewIcon: reviews && reviews[i + 1] ? (CLASSIFICATION_ICONS[reviews[i + 1].classification] || '') : '',
        });
      }
      this.setData({ movePairs: pairs });
    },
  },

  methods: {
    onMoveTap(e: any) {
      const index = parseInt(e.currentTarget.dataset.index);
      if (!isNaN(index)) {
        this.triggerEvent('gotomove', { index });
      }
    },
  },
});

export {};
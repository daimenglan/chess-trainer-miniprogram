/**
 * 关于页
 */
Page({
  data: {
    version: '1.0.0',
    features: [
      { icon: '🤖', title: 'AI 对弈', desc: '基于 Stockfish 引擎，1-10级难度调节' },
      { icon: '📊', title: '实时分析', desc: '候选走法评分、优缺点、战术标签' },
      { icon: '💬', title: 'AI 教练', desc: '自然语言问答，随时指导你的每一步' },
      { icon: '📚', title: '棋谱库', desc: '导入、回放、分析经典棋谱' },
      { icon: '🔍', title: '复盘分析', desc: '自动识别好坏走法，生成棋手档案' },
      { icon: '♟', title: '手动推演', desc: '自由推演变化，探索最佳走法' },
    ],
  },
});export {}

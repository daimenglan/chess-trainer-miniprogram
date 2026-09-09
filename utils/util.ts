/**
 * 通用工具函数
 */

/**
 * 格式化时间（秒 → MM:SS）
 */
function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 格式化日期
 */
function formatDate(dateStr: string, format: string = 'YYYY-MM-DD'): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const map: Record<string, string> = {
    'YYYY': d.getFullYear().toString(),
    'MM': (d.getMonth() + 1).toString().padStart(2, '0'),
    'DD': d.getDate().toString().padStart(2, '0'),
    'HH': d.getHours().toString().padStart(2, '0'),
    'mm': d.getMinutes().toString().padStart(2, '0'),
    'SS': d.getSeconds().toString().padStart(2, '0'),
  };
  let result = format;
  for (const [key, val] of Object.entries(map)) {
    result = result.replace(key, val);
  }
  return result;
}

/**
 * 格式化评分（引擎分数）
 */
function formatScore(score: number | undefined | null): string {
  if (score === undefined || score === null) return '—';
  if (score === 0) return '0.00';
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

/**
 * 评分标签
 */
function getScoreLabel(score: number): string {
  if (score > 3) return '胜势';
  if (score > 1.5) return '优势';
  if (score > 0.5) return '稍优';
  if (score > -0.5) return '均势';
  if (score > -1.5) return '稍差';
  if (score > -3) return '劣势';
  return '败势';
}

/**
 * 获取评分颜色
 */
function getScoreColor(score: number): string {
  if (score > 0.3) return '#4ade80';
  if (score > -0.3) return '#facc15';
  return '#f87171';
}

/**
 * 获取评分背景色
 */
function getScoreBg(score: number): string {
  if (score > 0.3) return 'rgba(34, 197, 94, 0.15)';
  if (score > -0.3) return 'rgba(234, 179, 8, 0.15)';
  return 'rgba(239, 68, 68, 0.15)';
}

/**
 * 获取结果徽章样式
 */
function getResultBadge(result: string, playerSide: string): { cls: string; text: string } {
  if (result === 'draw' || result === '1/2-1/2') return { cls: 'badge-draw', text: '和棋' };
  if (result === playerSide || (result === '1-0' && playerSide === 'white') || (result === '0-1' && playerSide === 'black')) {
    return { cls: 'badge-win', text: '胜' };
  }
  return { cls: 'badge-loss', text: '负' };
}

/**
 * 翻译结果
 */
function translateResult(result: string): string {
  const map: Record<string, string> = {
    '1-0': '白方胜',
    '0-1': '黑方胜',
    '1/2-1/2': '和棋',
    'playing': '进行中',
    'white': '白方胜',
    'black': '黑方胜',
    'draw': '和棋',
    'stalemate': '逼和',
  };
  return map[result] || result;
}

/**
 * 显示toast提示
 */
function showToast(title: string, icon: 'none' | 'success' | 'loading' = 'none'): void {
  wx.showToast({
    title: title,
    icon: icon,
    duration: 2000,
  });
}

/**
 * 显示加载提示
 */
function showLoading(title: string = '加载中...'): void {
  wx.showLoading({ title, mask: true });
}

function hideLoading(): void {
  wx.hideLoading();
}

/**
 * 显示模态对话框
 */
function showModal(options: { title?: string; content?: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '提示',
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      success(res) {
        resolve(res.confirm);
      },
    });
  });
}

/**
 * 防抖
 */
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number = 300): (...args: Parameters<T>) => void {
  let timer: number | null = null;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timer ?? undefined);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流
 */
function throttle<T extends (...args: any[]) => any>(fn: T, interval: number = 300): (...args: Parameters<T>) => void {
  let last = 0;
  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 深度克隆
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 将字符串数组转为带唯一键的对象数组，避免 wx:key="*this" 在重复项时告警
 */
function keyedList(arr: string[] | undefined | null, prefix: string): Array<{ key: string; text: string }> {
  return (arr || []).map((text, i) => ({ key: prefix + '_' + i + '_' + text, text }));
}

export {
  formatTime,
  formatDate,
  formatScore,
  getScoreLabel,
  getScoreColor,
  getScoreBg,
  getResultBadge,
  translateResult,
  showToast,
  showLoading,
  hideLoading,
  showModal,
  debounce,
  throttle,
  deepClone,
  keyedList,
};
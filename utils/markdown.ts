/**
 * 轻量 Markdown → 块级结构解析（供 AI 训练周报渲染）
 *
 * 后端周报固定输出「### 小标题 + 段落 + - 列表 + **加粗**」这套子集
 * （见 backend/src/services/llmService.ts 的 generateWeeklyTrainingReport 提示词）。
 * 小程序没有 markdown 渲染能力，这里把该子集解析成块级数组，交给 WXML 用
 * view/text 逐块渲染，避免依赖第三方组件。
 */

export interface MarkdownRun {
  /** 行内片段在块内的序号（供 wx:key 使用） */
  key: number;
  text: string;
  bold: boolean;
}

export interface MarkdownBlock {
  /** 块序号（供 wx:key 使用） */
  key: number;
  /** h=标题 p=段落 li=列表项 */
  type: 'h' | 'p' | 'li';
  /** 行内片段（按 **加粗** 切分） */
  runs: MarkdownRun[];
}

/** 解析行内 **加粗** 标记为片段数组 */
function parseInline(text: string): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ key: runs.length, text: text.slice(last, m.index), bold: false });
    runs.push({ key: runs.length, text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ key: runs.length, text: text.slice(last), bold: false });
  return runs.filter((r) => r.text.length > 0);
}

/** 去除行内残留标记（*斜体*、`代码`）。加粗在 parseInline 中保留为片段。 */
function cleanInline(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    // 单星号斜体：不用后行断言（部分小程序 JS 引擎不支持），改为按字符类排除双星号
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2');
}

/** Markdown 文本 → 块级数组 */
export function parseMarkdown(md: string): MarkdownBlock[] {
  if (!md) return [];
  const blocks: MarkdownBlock[] = [];
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');

  const push = (type: MarkdownBlock['type'], runs: MarkdownRun[]) => {
    blocks.push({ key: blocks.length, type, runs });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 分隔线
    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) continue;

    // 标题（# ~ ####）
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      push('h', parseInline(cleanInline(heading[2].trim())));
      continue;
    }

    // 列表项（- / * / + 或 1. ）
    const bullet = /^(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      push('li', parseInline(cleanInline(bullet[1].trim())));
      continue;
    }

    push('p', parseInline(cleanInline(line)));
  }

  return blocks;
}

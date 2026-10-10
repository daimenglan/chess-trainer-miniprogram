/**
 * WXML 结构与角色校验（编译前静态检查）
 *
 * 覆盖导致微信开发者工具构建失败的常见问题：
 *  1. 页面 json 误标 "component": true（页面/组件角色冲突）
 *  2. 组件 json 缺少 "component": true
 *  3. WXML 使用未在 usingComponents 声明的自定义标签
 *  4. 标签未闭合 / 交叉闭合
 *  5. {{ }} 跨行表达式
 *  6. 非内置标签（如 <br>）
 *  7. 同一标签内重复属性
 *  8. 组件循环依赖
 *
 * 用法： node test/check-wxml.js
 */
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', '.automator', '__pycache__', '.zcode', 'test']);
const ROOT = path.resolve(__dirname, '..');

// WXML 内置标签
const BUILTIN = new Set([
  'view', 'scroll-view', 'swiper', 'swiper-item', 'movable-area', 'movable-view',
  'cover-view', 'cover-image', 'text', 'rich-text', 'progress', 'icon', 'button',
  'checkbox', 'checkbox-group', 'form', 'input', 'label', 'picker', 'picker-view',
  'picker-view-column', 'radio', 'radio-group', 'slider', 'switch', 'textarea',
  'navigator', 'functional-page-navigator', 'audio', 'image', 'video', 'camera',
  'live-player', 'live-pusher', 'map', 'canvas', 'open-data', 'web-view', 'ad',
  'official-account', 'block', 'template', 'import', 'include', 'wxs', 'slot',
  'page-meta', 'navigation-bar', 'keyboard-accessory', 'match-media', 'page-container',
  'share-element', 'root-portal', 'voip-room', 'editor', 'channel-live', 'channel-video',
  'grid-view', 'list-view', 'snapshot', 'span', 'sticky-header', 'sticky-section',
  'open-container', 'cursor', 'ad-custom', 'page-wrapper',
]);

function walk(dir, acc, match) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc, match);
    else if (match(e.name)) acc.push(p);
  }
  return acc;
}

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// 跳过注释与 {{ }}，按引号配对扫描标签
function tokenize(s) {
  const toks = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); i = e === -1 ? n : e + 3; continue; }
    if (s.startsWith('{{', i)) { const e = s.indexOf('}}', i + 2); i = e === -1 ? n : e + 2; continue; }
    if (s[i] === '<') {
      let j = i + 1;
      while (j < n) {
        if (s.startsWith('{{', j)) { const e2 = s.indexOf('}}', j + 2); j = e2 === -1 ? n : e2 + 2; continue; }
        const c = s[j];
        if (c === '"' || c === "'") { const q = c; j++; while (j < n && s[j] !== q) j++; j++; continue; }
        if (c === '>') break;
        j++;
      }
      toks.push({ text: s.slice(i, j + 1), index: i });
      i = j + 1;
      continue;
    }
    i++;
  }
  return toks;
}

const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;

const problems = [];
const add = (file, line, msg) => problems.push({ file, line, msg });

const app = readJson(path.join(ROOT, 'app.json'));
const pages = new Set((app.pages || []).map(p => p.replace(/\\/g, '/')));
const globalComps = new Set(Object.keys(app.usingComponents || {}));

// 收集所有 json
const allJson = walk(ROOT, [], n => n.endsWith('.json'));
const wxmls = walk(ROOT, [], n => n.endsWith('.wxml'));

// 1 & 2：页面/组件角色
for (const p of app.pages || []) {
  const jf = path.join(ROOT, p + '.json');
  if (!fs.existsSync(jf)) { add(p + '.json', 0, '页面缺少 .json 文件'); continue; }
  const j = readJson(jf);
  if (j && j.component === true) add(rel(jf), 1, '页面 json 不应包含 "component": true');
}
for (const jf of allJson) {
  if (!rel(jf).startsWith('components/')) continue;
  const j = readJson(jf);
  if (j && j.component !== true) add(rel(jf), 1, '组件 json 缺少 "component": true');
}

// 3 & 4 & 5 & 6 & 7：逐 WXML
for (const f of wxmls) {
  const s = fs.readFileSync(f, 'utf8');
  const jf = f.replace(/\.wxml$/, '.json');
  const j = fs.existsSync(jf) ? readJson(jf) : null;
  const declared = new Set(Object.keys((j && j.usingComponents) || {}));

  // 标签闭合
  const stack = [];
  for (const t of tokenize(s)) {
    const m = /^<\s*(\/?)\s*([a-zA-Z][\w-]*)/.exec(t.text);
    if (!m) continue;
    const tag = m[2];
    const closing = m[1] === '/';
    const selfClose = /\/\s*>$/.test(t.text);
    const line = lineOf(s, t.index);
    if (closing) {
      if (!stack.length) add(rel(f), line, `多余的 </${tag}>`);
      else { const top = stack.pop(); if (top.tag !== tag) add(rel(f), line, `</${tag}> 与 <${top.tag}>（第 ${top.line} 行）不匹配`); }
    } else if (!selfClose && tag !== 'import' && tag !== 'include' && tag !== 'wxs') {
      stack.push({ tag, line });
    }
  }
  for (const t of stack) add(rel(f), t.line, `<${t.tag}> 未闭合`);

  // 未声明标签
  const seen = new Set();
  for (const t of tokenize(s)) {
    const m = /^<\s*\/?\s*([a-zA-Z][\w-]*)/.exec(t.text);
    if (!m) continue;
    const tag = m[1];
    if (BUILTIN.has(tag) || declared.has(tag) || globalComps.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    add(rel(f), lineOf(s, t.index), `未声明的自定义标签 <${tag}>（需在 usingComponents 中注册）`);
  }

  // 跨行 {{ }} 表达式
  let i = 0;
  while ((i = s.indexOf('{{', i)) !== -1) {
    const end = s.indexOf('}}', i + 2);
    if (end === -1) { add(rel(f), lineOf(s, i), '未闭合的 {{'); break; }
    if (s.slice(i, end).includes('\n')) add(rel(f), lineOf(s, i), 'WXML 表达式不能跨行');
    i = end + 2;
  }

  // 重复属性
  for (const t of tokenize(s)) {
    if (/^<\s*\//.test(t.text)) continue;
    const body = t.text.replace(/^<[a-zA-Z][\w-]*/, '').replace(/\/?>$/, '');
    const names = [];
    const re = /([:@a-zA-Z_][\w:.-]*)\s*=/g;
    let a;
    while ((a = re.exec(body))) {
      // 跳过 {{ }} 内部的等号
      const before = body.slice(0, a.index);
      if ((before.match(/\{\{/g) || []).length !== (before.match(/\}\}/g) || []).length) continue;
      names.push(a[1]);
    }
    const dup = names.filter((x, k) => names.indexOf(x) !== k);
    if (dup.length) add(rel(f), lineOf(s, t.index), `标签属性重复: ${[...new Set(dup)].join(', ')}`);
  }
}

// 8：组件循环依赖
const graph = {};
for (const jf of allJson) {
  const base = rel(jf).replace(/\.json$/, '');
  const j = readJson(jf);
  if (!j) continue;
  graph[base] = Object.values(j.usingComponents || {})
    .filter(v => !String(v).startsWith('plugin://'))
    .map(v => path.join(path.dirname(jf), v).split(path.sep).join('/').replace(/^\.\//, ''));
}
const seenCycle = new Set();
(function dfsAll() {
  const visited = new Set();
  const rec = (node, stack) => {
    if (stack.includes(node)) { seenCycle.add(stack.slice(stack.indexOf(node)).concat(node).join(' -> ')); return; }
    if (visited.has(node)) return;
    visited.add(node);
    for (const nx of graph[node] || []) rec(nx, stack.concat(node));
  };
  for (const n of Object.keys(graph)) rec(n, []);
})();
for (const c of seenCycle) add('(components)', 0, '组件循环依赖: ' + c);

// 输出
if (problems.length === 0) {
  console.log(`  ✅ WXML 结构与页面/组件角色校验通过（${wxmls.length} 个 WXML，${allJson.length} 个 JSON）`);
  process.exit(0);
}
console.log(`  ❌ 发现 ${problems.length} 个问题：`);
for (const p of problems) console.log(`     ${p.file}${p.line ? ':' + p.line : ''}  ${p.msg}`);
process.exit(1);

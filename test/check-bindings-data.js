/**
 * WXML 数据绑定与页面 data/methods 交叉检查
 *
 * 找出 WXML 里引用、但页面 data 与 methods 都没有的标识符 —— 这类遗漏在运行时
 * 只表现为空值（不报错），典型的如「走棋历史」绑定了不存在的字段而永远不显示。
 *
 * 用法: node test/check-bindings-data.js [页面目录...]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test', '__pycache__', '.tscheck']);
// WXML 内建/循环变量，不参与检查
const BUILTIN = new Set([
  'true', 'false', 'null', 'undefined', 'item', 'index', 'idx',
  'row', 'sq', 'rowIdx', 'mastersIdx', 'recIdx', 'l', 'c',
]);

let issues = 0;
let checkedPages = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      walk(full);
      continue;
    }
    if (!name.endsWith('.wxml')) continue;

    const tsPath = full.replace('.wxml', '.ts');
    const jsPath = full.replace('.wxml', '.js');
    const srcPath = fs.existsSync(tsPath) ? tsPath : (fs.existsSync(jsPath) ? jsPath : null);
    if (!srcPath) continue;

    const wxml = fs.readFileSync(full, 'utf8');
    const src = fs.readFileSync(srcPath, 'utf8');
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    checkedPages++;

    // 收集 data 键 + 方法名（顶层声明）
    const declared = new Set();
    // data 块：从 "data: {" 到匹配的花括号
    const di = src.indexOf('data: {');
    if (di >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = src.indexOf('{', di); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const block = src.slice(di, end > 0 ? end : src.length);
      for (const m of block.matchAll(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
        declared.add(m[1]);
      }
    }
    // 方法/属性：`name(` 或 `name:` 在对象字面量层级
    for (const m of src.matchAll(/(?:^|\n)\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/g)) {
      declared.add(m[1]);
    }

    // WXML 中 {{...}} 内引用的标识符。
    // 只取真正的「表达式」位置：排除 class/style 属性里的拼接片段
    // （`{{active ? 'x' : ''}}` 这类三元里的单词、以及主题拼接 `theme-{{__theme__}}`）。
    // 关键：`item.black` 这类循环项属性取首段（item）判断，不把 black 当成 data 键。
    const used = new Set();
    const EXPR_ATTR = /\{\{([\s\S]*?)\}\}/g;
    for (const m of wxml.matchAll(EXPR_ATTR)) {
      const expr = m[1];
      // 前缀上下文：判断这个 {{}} 属于哪个属性
      const before = wxml.slice(Math.max(0, m.index - 60), m.index);
      const attrMatch = before.match(/([a-zA-Z:][a-zA-Z0-9:_-]*)\s*=\s*["'][^"']*$/);
      const attr = attrMatch ? attrMatch[1] : '';
      // class/style 里只关心插值本身，不把三元的字符串字面量当数据字段
      const isClassLike = attr === 'class' || attr === 'style';
      // 去掉字符串字面量
      const cleaned = expr.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ');
      // 匹配完整路径（含点），随后只取第一段
      for (const m2 of cleaned.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g)) {
        const path = m2[0];
        const root = path.split('.')[0];
        if (!root) continue;
        if (BUILTIN.has(root)) continue;
        if (isClassLike && /^-|-$/.test(root)) continue;
        used.add(root);
      }
    }

    const missing = [...used].filter((t) => !declared.has(t)).sort();
    if (missing.length) {
      issues += missing.length;
      console.log('  ⚠️  ' + rel);
      console.log('     未在 ' + path.basename(srcPath) + ' 的 data/methods 中找到: ' + missing.join(', '));
    }
  }
}

walk(ROOT);

if (issues === 0) {
  console.log('  ✅ ' + checkedPages + ' 个页面的 WXML 绑定均可在 data/methods 中找到');
} else {
  console.log('  共 ' + issues + ' 个待确认的绑定（部分可能是字符串字面量误报）');
}

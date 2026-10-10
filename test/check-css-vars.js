/**
 * WXSS 未定义 CSS 变量检查
 *
 * 变量只在 app.wxss 的 .theme-dark / .theme-light 中定义。若页面样式引用了
 * 不存在的变量（常见于从网页版 Tailwind 类名直译，如 --glass-bg / --bg-page），
 * 微信小程序不会报错，只是该属性静默失效 —— 表现为元素「没有背景/没有边框」。
 *
 * 用法: node test/check-css-vars.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test', '__pycache__', '.tscheck']);

const appCss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const defined = new Set();
for (const m of appCss.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);

const covered = new Set();
let issues = 0;
const report = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      walk(full);
      continue;
    }
    if (!name.endsWith('.wxss')) continue;

    const src = fs.readFileSync(full, 'utf8');
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    // 页面/组件内自定义的变量（局部定义）也算有定义
    const local = new Set();
    for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) local.add(m[1]);

    const bad = new Set();
    for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const v = m[1];
      // var(--x, fallback) 有回退值，即使未定义也能正常降级
      const hasFallback = new RegExp('var\\(\\s*' + v + '\\s*,').test(src);
      if (hasFallback) continue;
      if (defined.has(v) || local.has(v)) continue;
      bad.add(v);
    }
    if (bad.size) {
      issues += bad.size;
      report.push('  ❌ ' + rel + ' → ' + [...bad].sort().join(', '));
    }
  }
}

walk(ROOT);

if (issues === 0) {
  console.log('  ✅ 所有 WXSS 引用的 CSS 变量均已定义（app.wxss 共 ' + defined.size + ' 个）');
} else {
  report.sort().forEach((l) => console.log(l));
  console.log('  共 ' + issues + ' 个未定义变量引用');
}

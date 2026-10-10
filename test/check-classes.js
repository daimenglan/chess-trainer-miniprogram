/**
 * WXML/WXSS 类名覆盖检查
 *
 * 找出 WXML 里用了、但本页 wxss 和 app.wxss 都没有定义的类名 —— 这类遗漏在
 * 小程序里不报错，只是「样式不生效」，表现为元素挤在一起/没有背景（本次报障的成因之一）。
 *
 * 用法: node test/check-classes.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test', '__pycache__', '.tscheck']);

const appCss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const appClasses = new Set();
for (const m of appCss.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) appClasses.add(m[1]);

let issues = 0;
const report = [];

function collectCss(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      collectCss(full, out);
      continue;
    }
    if (!name.endsWith('.wxss')) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) out.add(m[1]);
  }
}

function walkPages(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      walkPages(full);
      continue;
    }
    if (!name.endsWith('.wxml')) continue;

    const wxml = fs.readFileSync(full, 'utf8');
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    // 本目录下可用的类名 = 同目录 wxss + app.wxss
    const local = new Set();
    for (const f of fs.readdirSync(path.dirname(full))) {
      if (!f.endsWith('.wxss')) continue;
      const src = fs.readFileSync(path.join(path.dirname(full), f), 'utf8');
      for (const m of src.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) local.add(m[1]);
    }
    // 组件 wxml 可用 app.wxss 的全局类（组件默认不继承页面样式，这里按宽松口径检查）
    const used = new Set();
    for (const m of wxml.matchAll(/class="([^"]*)"/g)) {
      // 把插值替换成占位符：`theme-{{x}}` 这类拼接类名无法静态判断，按整体丢弃
      // （占位符与相邻字符之间没有空格，说明是该 token 的一部分）
      const withPh = m[1].replace(/\{\{[^}]*\}\}/g, '\u0000');
      for (const rawTok of withPh.split(/\s+/)) {
        if (!rawTok) continue;
        const tok = rawTok.trim();
        if (!tok) continue;
        // 含插值的 token：只有恰好被插值整体替换（如 {{cls}}）时才可能命中静态类名，其余跳过
        if (tok.includes('\u0000')) {
          const stripped = tok.replace(/\u0000/g, '');
          if (stripped && !stripped.endsWith('-') && !stripped.startsWith('-') && /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(stripped)) {
            used.add(stripped);
          }
          continue;
        }
        used.add(tok);
      }
    }
    const missing = [...used].filter((c) => !local.has(c) && !appClasses.has(c)).sort();
    if (missing.length) {
      issues += missing.length;
      report.push('  ' + rel + '\n    未定义: ' + missing.join(', '));
    }
  }
}

walkPages(ROOT);

if (issues === 0) {
  console.log('  ✅ 所有 WXML 类名均有样式定义');
} else {
  console.log('=== WXML 类名缺少样式定义 ===');
  report.sort().forEach((l) => console.log(l));
  console.log('  共 ' + issues + ' 个');
}

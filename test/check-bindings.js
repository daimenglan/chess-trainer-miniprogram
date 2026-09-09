/**
 * WXML 事件绑定与 JS/TS 方法交叉检查
 * 用法: node test/check-bindings.js
 */
const fs = require('fs');
const path = require('path');

let issues = 0;

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!f.endsWith('.wxml')) continue;
    const wxml = fs.readFileSync(full, 'utf8');
    // 优先检查 .ts 文件，其次 .js 文件
    let jsFile = full.replace('.wxml', '.ts');
    if (!fs.existsSync(jsFile)) {
      jsFile = full.replace('.wxml', '.js');
    }
    if (!fs.existsSync(jsFile)) continue;
    const js = fs.readFileSync(jsFile, 'utf8');

    // 提取 bind*/catch* 事件处理函数名（排除组件自定义事件如 bind:squaretap）
    const handlers = [...wxml.matchAll(/(?:bind|catch)[a-zA-Z]+="([a-zA-Z_][a-zA-Z0-9_]*)"/g)]
      .map((m) => m[1]);
    // WXML 调用的数据字段（{{xxx}} 顶层标识符）
    for (const h of [...new Set(handlers)]) {
      const pattern = new RegExp(h + '\\s*\\(|' + h + '\\s*:|' + h + '\\s*=');
      if (!pattern.test(js)) {
        console.log('  ❌ ' + full + ' 缺少事件处理方法: ' + h);
        issues++;
      }
    }
  }
}

walk('pages');
walk('components');

if (issues === 0) {
  console.log('  ✅ 所有 WXML 事件绑定都有对应 JS/TS 方法');
} else {
  console.log('  共 ' + issues + ' 个问题');
  process.exit(1);
}
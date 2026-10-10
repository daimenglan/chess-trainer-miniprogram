/**
 * 相对 require 路径可达性预检
 *
 * 本项目 .js 是发布产物，由 .ts 剥离类型生成。若迁移页面时目录深度变化而
 * require 前缀未同步（如 pages/x/index.js 写 '../../../utils/api'），
 * 开发者工具只会在运行时抛 "module not found"，静态检查很难发现。
 *
 * 用法: node test/check-requires.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test', '__pycache__', '.tscheck']);

let issues = 0;
let checked = 0;

const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      walk(full);
      continue;
    }
    if (!name.endsWith('.js')) continue;
    if (name === 'check-requires.js') continue;

    const src = fs.readFileSync(full, 'utf8');
    checked++;
    REQUIRE_RE.lastIndex = 0;
    let m;
    while ((m = REQUIRE_RE.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(full), spec);
      const okFile = fs.existsSync(target + '.js');
      const okDir = fs.existsSync(path.join(target, 'index.js'));
      if (okFile || okDir) continue;

      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const outside = !target.startsWith(ROOT + path.sep) && target !== ROOT;
      issues++;
      console.log(
        '  ❌ ' + rel + '\n     require("' + spec + '")' +
        (outside ? ' 指向 app 根目录之外' : ' 目标不存在')
      );
      console.log('     → ' + target.replace(/\\/g, '/'));
    }
  }
}

walk(ROOT);

if (issues === 0) {
  console.log('  ✅ ' + checked + ' 个 JS 文件的相对 require 路径均可解析');
} else {
  console.log('  共 ' + issues + ' 处不可解析的 require');
  process.exit(1);
}

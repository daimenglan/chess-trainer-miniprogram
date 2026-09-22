/**
 * 小程序运行时 JS 语法预检
 *
 * 本项目 app.js / *.js 是发布产物（.ts 已在 packOptions.ignore 中排除），
 * 由 .ts 手工/脚本剥离类型注解生成。该过程若漏掉某处类型标注（如 `[] as any[]`、
 * `(res: any[])`），.js 里就会残留 TS 语法，微信开发者工具直接报
 * `Expected ',', got 'as'` 而无法编译。
 *
 * 用法: node test/check-syntax.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOTS = ['pages', 'components', 'utils'];
const ROOT_FILES = ['app.js'];

let issues = 0;
let checked = 0;

function check(file) {
  const code = fs.readFileSync(file, 'utf8');
  checked++;
  try {
    // 仅编译不执行，用于捕获所有语法错误（含残留的 TS 语法）
    new vm.Script(code, { filename: path.resolve(file) });
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    issues++;
    console.log('  ❌ ' + file + ' 语法错误: ' + e.message);
    // 打印出错行，便于定位（与开发者工具的报错位置对应）
    const at = /:(\d+)\s*$/.exec(String(e.stack || '').split('\n')[0].trim());
    const lineNo = at ? Number(at[1]) : 0;
    const text = lineNo ? code.split(/\r?\n/)[lineNo - 1] : '';
    if (text) console.log('     ' + lineNo + ' | ' + text.trim());
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (f.endsWith('.js')) check(full);
  }
}

ROOTS.forEach(walk);
ROOT_FILES.forEach((f) => { if (fs.existsSync(f)) check(f); });

if (issues === 0) {
  console.log('  ✅ ' + checked + ' 个 JS 文件语法正确');
} else {
  console.log('  共 ' + issues + ' 个文件存在语法错误（很可能是 .ts 剥离类型时残留的 TS 语法）');
  process.exit(1);
}

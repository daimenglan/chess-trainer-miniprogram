/**
 * WXSS 结构合法性检查
 *
 * 微信开发者工具对 WXSS 的注释解析是「遇到星号加斜杠就结束」，不会跟踪嵌套。
 * 因此注释里只要出现「类名通配写法紧跟斜杠」（如 .dt- 紧接 星号 斜杠），
 * 注释会提前闭合，后面的中文说明被当作 CSS 解析，编译直接报 unexpected 字符。
 * check-classes.js / check-css-vars.js 都只用正则扫类名与变量，不解析结构，
 * 这类问题会一路漏到开发者工具里才暴露。
 *
 * 这里校验三件事：
 *   1. 注释配对（无未闭合注释，无游离的闭合符）
 *   2. 花括号配平
 *   3. 注释外的非 ASCII 字符（选择器/属性值里不该有中文，出现即为注释提前闭合）
 *
 * 用法: node test/check-wxss-structure.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test', '__pycache__', '.tscheck']);

let issues = 0;
const report = [];

/** 逐字符扫描一遍，同时收集注释错误与「注释外非 ASCII」 */
function checkComments(rel, css) {
  let i = 0;
  let line = 1;
  const errs = [];
  const nonAscii = [];

  while (i < css.length) {
    if (css[i] === '\n') line++;
    if (css[i] === '/' && css[i + 1] === '*') {
      const startLine = line;
      i += 2;
      while (i < css.length && !(css[i] === '*' && css[i + 1] === '/')) {
        if (css[i] === '\n') line++;
        i++;
      }
      if (i >= css.length) errs.push(`未闭合注释（起于第 ${startLine} 行）`);
      i += 2;
      continue;
    }
    if (css[i] === '*' && css[i + 1] === '/') {
      errs.push(`游离的 */ （第 ${line} 行，注释提前闭合）`);
      i += 2;
      continue;
    }
    // 注释外的非 ASCII：WXSS 选择器与属性值应为纯 ASCII，
    // 出现中文说明文字即说明某处注释被提前闭合
    if (css.charCodeAt(i) > 127) {
      nonAscii.push(`第 ${line} 行：${css.slice(Math.max(0, i - 20), i + 20).replace(/\n/g, ' ').trim()}`);
      // 跳到本行末尾，避免同一行重复上报
      while (i < css.length && css[i] !== '\n') i++;
      continue;
    }
    i++;
  }

  if (errs.length > 0) {
    issues += errs.length;
    report.push(`  ❌ ${rel} → ${errs.join('; ')}`);
  }
  if (nonAscii.length > 0) {
    issues += nonAscii.length;
    report.push(`  ❌ ${rel} → 注释外出现非 ASCII 字符（疑似注释提前闭合）`);
    nonAscii.slice(0, 5).forEach((l) => report.push(`       ${l}`));
  }
  return errs.length === 0 && nonAscii.length === 0;
}

/** 花括号配平（先剥掉注释，避免注释里的花括号干扰） */
function checkBraces(rel, css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let premature = 0;
  for (const ch of stripped) {
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) {
        premature++;
        depth = 0;
      }
    }
  }
  if (depth !== 0 || premature > 0) {
    issues++;
    report.push(`  ❌ ${rel} → 花括号不配平（结束深度 ${depth}，多余右括号 ${premature} 个）`);
    return false;
  }
  return true;
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.wxss')) continue;

    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    const css = fs.readFileSync(full, 'utf8');
    checkComments(rel, css);
    checkBraces(rel, css);
  }
}

walk(ROOT);

if (issues === 0) {
  console.log('  ✅ 所有 WXSS 注释配对、花括号配平、注释外无非 ASCII 字符');
} else {
  report.forEach((l) => console.log(l));
  console.log('  共 ' + issues + ' 处结构问题');
}

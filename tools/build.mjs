/**
 * 洛谷 · 菲林斯主题 —— 构建脚本
 *
 *   dist/flins.css        = src/_tokens.generated.css + src/flins.css
 *   dist/flins.user.js    = src/userscript.js（注入样式表 / 徽记 / 内嵌背景图）
 *   dist/flins-emblem.svg = assets/flins-emblem.svg
 *   dist/assets/*.jpg     = 可直接上传到洛谷图床的完整尺寸背景图
 *
 * 用法：node tools/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const ASSETS = join(ROOT, 'assets');

const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

function read(p) {
  if (!existsSync(p)) {
    console.error(`✗ 缺少文件：${p}`);
    process.exit(1);
  }
  return readFileSync(p, 'utf8');
}

mkdirSync(join(DIST, 'assets'), { recursive: true });

// ── 1. 样式表 ───────────────────────────────────────────────────────────────
const banner = `/*! 洛谷 · 菲林斯主题「终夜长茔 · 夜巡」v1.0.0
 *  构建产物，请勿直接编辑。源码：src/flins.css + src/_tokens.generated.css
 *  用法：Stylus 新建样式，作用域填 luogu.com.cn，粘贴本文件全部内容。
 */\n`;

const tokensCss = read(join(SRC, '_tokens.generated.css'));
const themeCss = read(join(SRC, 'flins.css'));
const fullCss = `${banner}\n${tokensCss}\n\n${themeCss}`;
writeFileSync(join(DIST, 'flins.css'), fullCss, 'utf8');
console.log(`✓ dist/flins.css            ${kb(join(DIST, 'flins.css'))}`);

// ── 2. 徽记 ─────────────────────────────────────────────────────────────────
const emblemSvg = read(join(ASSETS, 'flins-emblem.svg')).trim();
copyFileSync(join(ASSETS, 'flins-emblem.svg'), join(DIST, 'flins-emblem.svg'));
console.log(`✓ dist/flins-emblem.svg     ${kb(join(DIST, 'flins-emblem.svg'))}`);

// ── 3. 背景图 ───────────────────────────────────────────────────────────────
const bgFiles = {
  dark: join(ASSETS, 'flins-bg-dark-web.jpg'),
  light: join(ASSETS, 'flins-bg-light-web.jpg'),
};
const BUILTIN_BG = {};
for (const [key, p] of Object.entries(bgFiles)) {
  if (!existsSync(p)) {
    console.warn(`! 缺少 ${basename(p)}，内置背景将为空（先跑 python tools/make_backgrounds.py）`);
    BUILTIN_BG[key] = '';
    continue;
  }
  BUILTIN_BG[key] = `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
}

for (const f of ['flins-bg-dark.jpg', 'flins-bg-light.jpg', 'flins-bg-dark-2x.jpg']) {
  const src = join(ASSETS, f);
  if (existsSync(src)) copyFileSync(src, join(DIST, 'assets', f));
}

// ── 4. 油猴脚本 ─────────────────────────────────────────────────────────────
let user = read(join(SRC, 'userscript.js'));

function replaceBlock(text, startMark, endMark, payload) {
  const re = new RegExp(
    `(${startMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[\\s\\S]*?(${endMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
  );
  if (!re.test(text)) {
    console.error(`✗ 用户脚本里找不到注入标记：${startMark}`);
    process.exit(1);
  }
  return text.replace(re, `$1${payload}$2`);
}

user = replaceBlock(user, '/* @flins:css */', '/* @flins:css-end */', JSON.stringify(fullCss));
user = replaceBlock(user, '/* @flins:bg */', '/* @flins:bg-end */', JSON.stringify(BUILTIN_BG));
user = replaceBlock(user, '/* @flins:emblem */', '/* @flins:emblem-end */', JSON.stringify(emblemSvg));

// ── 版本号每次构建自动递增 ─────────────────────────────────────────────────
// 之前 @version 恒为 1.0.0，Tampermonkey 面板里看不出装的是哪一版 ——
// 结果「改了没生效」其实只是装到了旧快照上，白折腾好几轮。
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}.${p2(d.getMonth() + 1)}${p2(d.getDate())}.${p2(d.getHours())}${p2(d.getMinutes())}`;
const before = user;
user = user.replace(/^\/\/ @version\s+\S+$/m, `// @version      ${stamp}`);
if (user === before) {
  console.error('✗ 没能替换 @version，检查 src/userscript.js 的头部格式');
  process.exit(1);
}

writeFileSync(join(DIST, 'flins.user.js'), user, 'utf8');

// ── 自检 ────────────────────────────────────────────────────────────────────
// 这一步不是多余的：构建脚本的日志如果被管道截断（比如 PowerShell 的
// `| Select-Object -First 2`），Node 写 stdout 会拿到 EPIPE 直接退出，
// 后面的 writeFileSync 根本不会执行 —— 于是 dist 里留着上一次的旧产物，
// 而人还以为「刚构建过」。下面把刚写的文件读回来，确认注入的样式表确实是本轮的。
function assertFresh(file, needle, what) {
  const back = readFileSync(file, 'utf8');
  if (!back.includes(needle)) {
    console.error(`\n✗ 自检失败：${what} 里没有找到本轮构建的内容。`);
    console.error(`  文件：${file}`);
    console.error('  多半是构建脚本的输出被管道截断导致中途退出，请完整重跑 node tools/build.mjs。');
    process.exit(1);
  }
}

const cssNeedle = JSON.stringify(fullCss).slice(0, 160);
const bgNeedle = JSON.stringify(BUILTIN_BG).slice(0, 80);
assertFresh(join(DIST, 'flins.user.js'), cssNeedle, 'dist/flins.user.js');
assertFresh(join(DIST, 'flins.user.js'), bgNeedle, 'dist/flins.user.js 的内嵌背景');

console.log(`✓ dist/flins.user.js        ${kb(join(DIST, 'flins.user.js'))}`);

// ── 5. Chrome 扩展（MV3）——不需要装油猴，直接「加载已解压的扩展程序」 ─────────
const EXT = join(DIST, 'flins-extension');
mkdirSync(join(EXT, 'icons'), { recursive: true });

// 版本号与用户脚本保持一致，这样 edge://extensions 里一眼能看出装的是哪一版
const extVersion = stamp.split('.').slice(0, 3).join('.').replace(/^(\d+)\.(\d{4})(\d{2})\.(\d{4})$/, '$1.$2$3.$4');

// content.js 就是同一个脚本：里面已经写好 GM_* 缺失时的兜底分支
writeFileSync(join(EXT, 'content.js'), user, 'utf8');
assertFresh(join(EXT, 'content.js'), cssNeedle, 'dist/flins-extension/content.js');

const manifest = {
  manifest_version: 3,
  name: '洛谷 · 菲林斯主题「终夜长茔 · 夜巡」',
  version: extVersion,
  description: '为洛谷换上《原神》菲林斯主题：深靛蓝夜色 + 提灯冷蓝焰 + 金色新月 + 灯塔剪影。背景图片可在设置面板里随时更换。',
  icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  content_scripts: [
    {
      matches: ['*://*.luogu.com.cn/*', '*://*.luogu.com/*', '*://*.luogu.me/*'],
      run_at: 'document_start',
      all_frames: false,
      js: ['content.js'],
    },
  ],
};
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// 图标：把誓灯徽记栅格化成三种尺寸
const iconSrc = join(ASSETS, 'icons');
if (existsSync(iconSrc)) {
  for (const size of ['16', '48', '128']) {
    const p = join(iconSrc, `${size}.png`);
    if (existsSync(p)) copyFileSync(p, join(EXT, 'icons', `${size}.png`));
  }
}
console.log(`✓ dist/flins-extension/     manifest.json + content.js`);

// ── 语法自检（放在最后：EXT 等常量此时才都已初始化） ───────────────────────
// 构建只是把文本拼进去，不做语法分析。源码里一旦有语法错误（比如重复声明同一个
// let），产物照样写得出来、看上去还挺正常，但浏览器一执行整个脚本就没了 ——
// 页面「一点效果都没有」，而且极难联想到是构建的锅。所以这里必须检查。
// ⚠️ 这里用 node:vm 直接编译，【不要】改回 spawnSync(node --check)。
//    子进程的 stdio 管道在受限/沙箱环境里会直接 EPERM，status 是 null、
//    stderr 是空的 —— 于是一次完全正常的构建被报成「语法检查未通过」，
//    人还以为是源码坏了（这个假警报真发生过）。
//    new vm.Script(src) 只编译不执行，与 node --check 等价，还不用起进程。
import { Script } from 'node:vm';
function compileError(file) {
  const src = readFileSync(file, 'utf8');
  try {
    new Script(src, { filename: file });
    return null;
  } catch (e) {
    return e;
  }
}

for (const f of [join(DIST, 'flins.user.js'), join(EXT, 'content.js')]) {
  const err = compileError(f);
  if (err) {
    console.error(`\n✗ 语法检查未通过：${f}`);
    console.error(String(err.message || err).split('\n').slice(0, 8).join('\n'));
    console.error('\n  产物是坏的，别拿去装。修好 src/userscript.js 再构建。');
    process.exit(1);
  }
}
console.log('✓ 语法自检通过');

console.log('\n安装方式（任选其一）：');
console.log('  1) 油猴：把 dist/flins.user.js 拖进浏览器');
console.log('  2) 扩展：chrome://extensions → 打开「开发者模式」→「加载已解压的扩展程序」→ 选 dist/flins-extension');
console.log('  3) Stylus：新建样式，粘 dist/flins.css');

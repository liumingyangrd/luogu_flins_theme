/**
 * 读取本机 Chrome / Edge 的真实用户配置，回答三个问题：
 *   1. 开发者模式开了没有？（没开的话「加载已解压的扩展程序」是按不动的）
 *   2. 我们这套扩展到底有没有被登记进去？
 *   3. 登记了的话，处于什么状态（启用 / 被禁用 / 有错误）？
 *
 * 只读，不修改任何东西。
 * 用法：node tools/check-installed.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.LOCALAPPDATA || '';
const EXT_MARK = 'luogu-flins-theme';

const BROWSERS = [
  { key: 'Edge',   dir: join(HOME, 'Microsoft', 'Edge', 'User Data') },
  { key: 'Chrome', dir: join(HOME, 'Google', 'Chrome', 'User Data') },
];

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/** 扩展状态位（Chromium 的 disable_reasons，新版是字符串数组） */
function describeReasons(reasons) {
  if (!reasons) return '正常';
  if (Array.isArray(reasons)) {
    if (!reasons.length) return '正常（已启用）';
    const map = {
      USER_ACTION: '用户手动停用',
      PERMISSIONS_INCREASE: '权限增加待确认',
      UNSUPPORTED_MANIFEST_VERSION: '不受支持的清单版本',
      POLICY: '被策略禁用',
      DEPENDENCY_EXTENSION_MISSING: '依赖扩展缺失',
      UNSUPPORTED_DEVELOPER_EXTENSION: 'Edge 停用了开发者模式扩展',
      UNSUPPORTED_DEVELOPER_EXTENSION_AND_POLICY: '开发者扩展 + 策略',
      CORRUPTED: '扩展已损坏',
      RELOAD: '待重新加载',
    };
    return reasons.map((r) => map[r] || r).join(' / ');
  }
  if (typeof reasons === 'number') {
    if (!reasons) return '正常（已启用）';
    const bits = { 1: '用户手动停用', 2: '权限增加待确认', 4: '不受支持的清单版本',
      8: '被策略禁用', 16: '依赖扩展缺失' };
    return Object.entries(bits).filter(([b]) => reasons & Number(b))
      .map(([, l]) => l).join(' / ') || ('未知(' + reasons + ')');
  }
  return '正常（已启用）';
}

for (const b of BROWSERS) {
  console.log('\n══════════════════════════════════════');
  console.log('  ' + b.key);
  console.log('══════════════════════════════════════');
  if (!existsSync(b.dir)) { console.log('  未安装 / 没有配置目录：' + b.dir); continue; }

  let profiles = [];
  try {
    profiles = readdirSync(b.dir).filter((n) => {
      const p = join(b.dir, n);
      return statSync(p).isDirectory() && (n === 'Default' || /^Profile \d+$/.test(n));
    });
  } catch (e) { /* ignore */ }

  if (!profiles.length) { console.log('  没找到任何配置文件（Default / Profile N）'); continue; }

  for (const prof of profiles) {
    const pdir = join(b.dir, prof);
    const secure = readJson(join(pdir, 'Secure Preferences'));
    const plain = readJson(join(pdir, 'Preferences'));
    const prefs = secure || plain;
    console.log(`\n  ── 配置文件：${prof}`);
    if (!prefs) { console.log('     读不到配置（浏览器可能正在运行，或文件格式变了）'); continue; }

    const devMode = prefs.extensions && prefs.extensions.ui
      && prefs.extensions.ui.developer_mode;
    console.log('     开发者模式：' + (devMode ? '已开启 ✓' : '未开启 ✗（未开启时无法「加载已解压的扩展程序」）'));

    const settings = (prefs.extensions && prefs.extensions.settings) || {};
    const entries = Object.entries(settings);
    console.log('     已登记扩展数：' + entries.length);

    const ours = entries.filter(([, v]) => {
      const s = JSON.stringify(v || {});
      return s.includes(EXT_MARK) || /flins-extension/i.test(s);
    });

    if (!ours.length) {
      console.log('     ✗ 没有找到本主题的扩展（说明「加载已解压的扩展程序」这一步没成功）');
      const unpacked = entries.filter(([, v]) => v && v.location === 4);
      if (unpacked.length) {
        console.log('     不过这个配置里有 ' + unpacked.length + ' 个「已解压」扩展，路径分别是：');
        unpacked.slice(0, 8).forEach(([id, v]) => {
          console.log('       · ' + (v.path || '(无 path)') + '   状态：' + describeReasons(v.disable_reasons));
        });
      } else {
        console.log('     这个配置里一个「已解压」扩展都没有。');
      }
    } else {
      for (const [id, v] of ours) {
        const reasons = describeReasons(v.disable_reasons);
        const disabled = !!(v.disable_reasons && v.disable_reasons.length);
        console.log('     ' + (disabled ? '✗' : '✓') + ' 找到本主题扩展' + (disabled ? '（但处于停用状态）' : ''));
        console.log('       id      : ' + id);
        console.log('       名称    : ' + (v.manifest && v.manifest.name ? v.manifest.name : '(无)'));
        console.log('       路径    : ' + (v.path || '(无)'));
        console.log('       状态    : ' + reasons);
        console.log('       location: ' + v.location + '（4 = 已解压）');
        const cs = v.manifest && v.manifest.content_scripts;
        if (cs) console.log('       匹配    : ' + JSON.stringify(cs[0].matches));
        if (disabled) {
          console.log('');
          console.log('  ┌─ 怎么修 ────────────────────────────────────────────');
          console.log('  │ Edge 重启后经常把「开发者模式」加载的扩展自动停掉');
          console.log('  │ （会弹一条「停用开发人员模式扩展程序」的提示）。');
          console.log('  │');
          console.log('  │ 1. 打开 edge://extensions');
          console.log('  │ 2. 找到「洛谷 · 菲林斯主题『终夜长茔 · 夜巡』」');
          console.log('  │ 3. 把右下角的开关重新打开');
          console.log('  │ 4. 刷新任意洛谷页面（右下角会出现灯形按钮）');
          console.log('  │');
          console.log('  │ 嫌每次都要重开的话，改用油猴：Edge 加载项商店装');
          console.log('  │ Tampermonkey，再把 dist/flins.user.js 拖进去。');
          console.log('  │ 商店装的扩展不会被这样停用。');
          console.log('  └────────────────────────────────────────────────────');
        }
      }
    }
  }
}

console.log('\n提示：如果浏览器正在运行，配置可能还没落盘；请先完全退出浏览器再跑一次。\n');

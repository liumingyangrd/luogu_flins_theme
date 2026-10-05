/**
 * 真站验证：用 CDP 驱动真实 Chrome，在 document-start 把主题脚本注入 luogu.com.cn，
 * 然后回报诊断信息并截图。
 *
 * 为什么不用 --load-extension：本机无头 Chrome 会忽略它（已用最小探针扩展验证过），
 * 所以改用 Page.addScriptToEvaluateOnNewDocument —— 与油猴 @run-at document-start 等价。
 *
 * 用法：node tools/live-check.mjs [更多URL...]
 * 产物：.realtest/<host>-<n>.png 与 stdout 上的诊断 JSON
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, '.realtest');
const PROFILE = process.env.FLINS_PROFILE_DIR || join(OUT, 'profile');
const CHROME = process.env.FLINS_CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.FLINS_CDP_PORT || 9333);

const URLS = process.argv.slice(2);
if (!URLS.length) URLS.push('https://www.luogu.com.cn/problem/P1001');

mkdirSync(PROFILE, { recursive: true });
const script = readFileSync(join(ROOT, 'dist', 'flins.user.js'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(400);
  }
  throw new Error('DevTools 端口没起来');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时: ${method}`)); }
      }, 40000);
    });
  }
}

const DIAG = `(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const themePage = document.querySelector('.theme-page');
  const card = document.querySelector('.l-card');
  const fab = document.querySelector('.flins-fab');
  const panel = document.querySelector('.flins-panel');
  const styles = [...document.querySelectorAll('style')].map(s => (s.textContent || '').length);
  return JSON.stringify({
    url: location.href,
    readyState: document.readyState,
    htmlClass: root.className,
    styleTags: document.querySelectorAll('style').length,
    styleBytes: styles.reduce((a, b) => a + b, 0),
    themeCssPresent: [...document.querySelectorAll('style')]
      .some(s => (s.textContent || '').includes('--flins-night-900')),
    varPrimary: cs.getPropertyValue('--lcolor--primary').trim(),
    varAccent: cs.getPropertyValue('--flins-accent').trim(),
    varBgIsNone: cs.getPropertyValue('--flins-bg-image').trim() === 'none',
    varBgLen: cs.getPropertyValue('--flins-bg-image').trim().length,
    themePageBg: themePage ? getComputedStyle(themePage).backgroundColor : null,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
    naviBack: getComputedStyle(document.querySelector('.top-bar') || root)
      .getPropertyValue('--theme-navi-back').trim(),
    fab: !!fab,
    panel: !!panel,
    bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 48),
    errors: (window.__flinsErrors || []).slice(0, 6)
  }, null, 2);
})()`;

const bootstrap = `window.__flinsErrors = [];
window.addEventListener('error', (e) => window.__flinsErrors.push(String(e.message) + ' @' + (e.filename || '') + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', (e) => window.__flinsErrors.push('rejection: ' + String(e.reason)));
${(() => {
    // FLINS_PRESET 传完整 JSON（可以一次改多个设置项）；
    // 只用 FLINS_MODE 时是它的简写。
    let cfg = null;
    if (process.env.FLINS_PRESET) {
      try { cfg = JSON.parse(process.env.FLINS_PRESET); } catch (e) { cfg = null; }
    }
    if (!cfg && process.env.FLINS_MODE) cfg = { mode: process.env.FLINS_MODE };
    if (!cfg && process.env.FLINS_LAYOUT) cfg = { layout: process.env.FLINS_LAYOUT };
    if (!cfg) return '';
    return `try { localStorage.setItem('flins-theme-v1', ${JSON.stringify(JSON.stringify(cfg))}); } catch (e) {}`;
  })()}
`;

/**
 * 白块审计：深色主题最典型的破绽就是「漏了某个硬编码 #fff 的容器」。
 * 与其一个个追类名，不如扫全页把所有「接近白色的可见背景」连同类名一起报出来。
 */
const AUDIT = `(() => {
  const out = [];
  const seen = new Set();
  const parse = (bg) => {
    const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(bg);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    // 阈值别设太大：题库翻页条那些按钮只有 24×26，
    // 设成 26 以上就会整片漏掉（曾经就是这么漏的）
    if (r.width < 20 || r.height < 14) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.5) return;
    const bg = parse(cs.backgroundColor);
    if (!bg || bg.a < 0.55) return;
    // 近白：三通道都很亮且彼此接近
    if (Math.min(bg.r, bg.g, bg.b) < 195) return;
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    const key = el.tagName + '|' + cls;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: cls.slice(0, 70),
      bg: cs.backgroundColor,
      w: Math.round(r.width), h: Math.round(r.height),
      text: (el.textContent || '').trim().slice(0, 24),
      inThemePage: !!el.closest('.theme-page'),
      inFrosted: !!el.closest('.theme-frosted'),
      cardVar: cs.getPropertyValue('--theme-card-background').trim(),
      parentCls: (el.parentElement && typeof el.parentElement.className === 'string')
        ? el.parentElement.className.trim().slice(0, 50) : ''
    });
  });
  return JSON.stringify({ count: out.length, items: out.slice(0, 30) }, null, 2);
})()`;


/**
 * 「是谁给它上的色」：遍历文档里所有样式表，找出真正匹配某元素、
 * 且声明了背景/颜色的规则。排查白块时比逐个 grep CSS 快得多。
 * 用法：FLINS_WHY="code.language-cpp" node tools/live-check.mjs <url>
 */
function whyExpr(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return '没找到元素: ' + ${JSON.stringify(selector)};
    const hits = [];
    const walk = (list, ctx, href) => {
      for (const r of list) {
        if (r.cssRules) { walk(r.cssRules, r.conditionText || r.name || ctx, href); continue; }
        if (!r.selectorText) continue;
        let m = false;
        try { m = el.matches(r.selectorText); } catch (e) { continue; }
        if (!m) continue;
        const b = r.style.backgroundColor || r.style.background || '';
        const c = r.style.color || '';
        if (!b && !c) continue;
        hits.push({ sel: r.selectorText.slice(0, 120), bg: b, color: c, imp: r.style.getPropertyPriority('background-color') || '', src: href, ctx: ctx || '' });
      }
    };
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      walk(rules, '', sheet.href ? sheet.href.split('/').pop().slice(0, 46) : '(inline style)');
    }
    return JSON.stringify({ el: el.tagName + '.' + (el.className || ''), computed: getComputedStyle(el).backgroundColor, hits }, null, 2);
  })()`;
}

/**
 * 对比度审计：白块之外的另一类破绽是「文字发灰看不清」。
 * 这里按 WCAG 算每个含文字元素的前景/背景对比度，低于 4.5:1 的列出来。
 * 背景逐级向上找第一个不透明背景；中途遇到背景图就跳过（算不准）。
 */
const CONTRAST = `(() => {
  const parse = (s) => {
    const m = /rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,/\\s]+([\\d.]+))?\\s*\\)/.exec(s || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = (c) => {
    const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const bgOf = (el) => {
    let p = el;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a >= 0.9) return [bg.r, bg.g, bg.b];
      p = p.parentElement;
    }
    return [8, 11, 33];
  };
  const out = [], seen = new Set();
  document.querySelectorAll('body *').forEach((el) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.4) return;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) return;
    const mix = fg.a >= 1 ? [fg.r, fg.g, fg.b]
      : [fg.a * fg.r + (1 - fg.a) * bg[0], fg.a * fg.g + (1 - fg.a) * bg[1], fg.a * fg.b + (1 - fg.a) * bg[2]];
    const L1 = lum(mix), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio >= 4.5) return;
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    const key = el.tagName + '|' + cls + '|' + cs.color;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      tag: el.tagName.toLowerCase(), cls: cls.slice(0, 46), ratio: +ratio.toFixed(2),
      color: cs.color, bg: 'rgb(' + bg.map(Math.round).join(',') + ')',
      text: (el.textContent || '').trim().slice(0, 20)
    });
  });
  out.sort((a, b) => a.ratio - b.ratio);
  return JSON.stringify({ count: out.length, items: out.slice(0, 26) }, null, 2);
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--window-size=1600,1100',
    'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  try {
    const wsUrl = await cdpTarget();
    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new CDP(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: script });

    let n = 0;
    for (const url of URLS) {
      n += 1;
      console.log(`\n──────── ${url}`);
      await cdp.send('Page.navigate', { url });
      await sleep(9000);

      const diag = await cdp.send('Runtime.evaluate', { expression: DIAG, returnByValue: true });
      console.log(diag.result.value);

      if (process.env.FLINS_AUDIT) {
        const audit = await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true });
        console.log('── 白块审计 ──');
        console.log(audit.result.value);
      }

      if (process.env.FLINS_CONTRAST) {
        const ct = await cdp.send('Runtime.evaluate', { expression: CONTRAST, returnByValue: true });
        const parsed = JSON.parse(ct.result.value);
        console.log(`── 对比度审计（< 4.5:1 共 ${parsed.count} 处）──`);
        for (const it of parsed.items) {
          console.log(`  ${String(it.ratio).padStart(5)}:1  ${it.tag}.${it.cls.split(/\\s+/).join('.')}  ${it.color} on ${it.bg}  「${it.text}」`);
        }
      }

      if (process.env.FLINS_RECT) {
        const rects = await cdp.send('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const sels = ${JSON.stringify(process.env.FLINS_RECT)}.split(';');
            const out = sels.map((s) => {
              const el = document.querySelector(s.trim());
              if (!el) return { sel: s.trim(), miss: true };
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              return {
                sel: s.trim(),
                x: +r.x.toFixed(1), y: +r.y.toFixed(1),
                w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                left: cs.left, right: cs.right, width: cs.width, margin: cs.margin,
                boxSizing: cs.boxSizing, position: cs.position, zIndex: cs.zIndex,
                radius: cs.borderRadius, bg: cs.backgroundColor,
              };
            });
            return JSON.stringify(out, null, 2);
          })()`,
        });
        console.log('── 几何量测 ──');
        console.log(rects.result.value);
      }

      if (process.env.FLINS_WHY) {
        for (const sel of process.env.FLINS_WHY.split(';')) {
          const why = await cdp.send('Runtime.evaluate', { expression: whyExpr(sel.trim()), returnByValue: true });
          console.log(`── 谁给 ${sel.trim()} 上的色 ──`);
          console.log(why.result.value);
        }
      }

      // FLINS_AT="1000,1075" —— 报告该坐标上是哪个元素、它的背景/文字色与尺寸
      if (process.env.FLINS_AT) {
        for (const pair of process.env.FLINS_AT.split(';')) {
          const [x, y] = pair.split(',').map(Number);
          const r = await cdp.send('Runtime.evaluate', {
            returnByValue: true,
            expression: `(() => {
              const el = document.elementFromPoint(${x}, ${y});
              if (!el) return '该点没有元素';
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              const chain = [];
              let p = el;
              for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
                const pcs = getComputedStyle(p);
                chain.push(p.tagName.toLowerCase() + '.' + (typeof p.className === 'string' ? p.className.trim().split(/\\s+/).join('.') : '')
                  + ' → bg=' + pcs.backgroundColor + ' img=' + (pcs.backgroundImage || 'none').slice(0, 30)
                  + ' ' + Math.round(p.getBoundingClientRect().width) + 'x' + Math.round(p.getBoundingClientRect().height));
              }
              return JSON.stringify({
                命中: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim() : ''),
                文字: (el.textContent || '').trim().slice(0, 12),
                尺寸: Math.round(r.width) + 'x' + Math.round(r.height),
                背景色: cs.backgroundColor, 背景图: (cs.backgroundImage || 'none').slice(0, 40),
                文字色: cs.color,
                祖先链: chain
              }, null, 2);
            })()`,
          });
          console.log(`── 坐标 ${x},${y} 上是 ──`);
          console.log(r.result.value);
        }
      }
      // 自愈功能验收：往页面里塞一个「纯色近白容器」，看脚本会不会把它压暗
      if (process.env.FLINS_PATCHTEST) {
        const res = await cdp.send('Runtime.evaluate', {
          returnByValue: true,
          awaitPromise: true,
          expression: `(async () => {
            const mk = (bg, fg) => {
              const d = document.createElement('div');
              d.style.cssText = 'width:320px;height:60px;background:' + bg + ';color:' + fg + ';padding:8px';
              d.textContent = '白块自愈测试';
              d.id = 'flins-patchtest-' + Math.random().toString(36).slice(2, 7);
              document.body.appendChild(d);
              return d;
            };
            const white = mk('#ffffff', '#f0f0f0');   // 白底白字（私信气泡那种）
            const kv = mk('#fafafa', '#222222');      // 白底深字
            const dark = mk('#101635', '#e6ebfb');    // 本来就深，不该被动
            await new Promise((r) => setTimeout(r, 2500));
            const g = (el) => getComputedStyle(el).backgroundColor;
            return JSON.stringify({
              白底白字: g(white),
              白底深字: g(kv),
              本来就深: g(dark),
              应该都被改成深色: g(white) === g(dark) && g(kv) === g(dark)
            }, null, 2);
          })()`,
        });
        console.log('── 白块自愈验收 ──');
        console.log(res.result.value);
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const name = `real-${n}.png`;
      writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
      console.log(`截图 → .realtest/${name}`);
    }
  } finally {
    try { ws && ws.close(); } catch (e) { /* ignore */ }
    chrome.kill();
  }
  console.log('\n完成。');
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1); });

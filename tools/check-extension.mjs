/**
 * 真机装扩展验证：把 dist/flins-extension 作为一个真实扩展装进 Chrome / Edge，
 * 打开洛谷，回报内容脚本到底有没有跑起来。
 *
 * 为什么不用无头：本机实测 --headless=new 会忽略 --load-extension
 * （连一个「只写 title」的最小探针扩展都不注入），所以这里用有头模式。
 * 扩展装在独立的临时 profile 里，不会碰你自己浏览器的配置。
 *
 * 用法：
 *   node tools/check-extension.mjs chrome
 *   node tools/check-extension.mjs edge
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXT = join(ROOT, 'dist', 'flins-extension');
const PROFILE = join(ROOT, '.exttest', 'profile');
const PORT = 9444;

const BROWSERS = {
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
};

const which = (process.argv[2] || 'chrome').toLowerCase();
const exe = BROWSERS[which];
if (!exe) { console.error('用法：node tools/check-extension.mjs chrome|edge'); process.exit(1); }
if (!existsSync(exe)) { console.error('找不到浏览器：' + exe); process.exit(1); }
if (!existsSync(join(EXT, 'manifest.json'))) { console.error('找不到扩展：' + EXT); process.exit(1); }

mkdirSync(PROFILE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(400);
  }
  throw new Error('DevTools 端口没起来');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('超时: ' + method)); }, 40000);
    });
  }
}

const PROBE = `JSON.stringify({
  url: location.href,
  readyState: document.readyState,
  htmlClass: document.documentElement.className,
  contentScriptRan: !!document.getElementById('flins-theme-style'),
  styleBytes: [...document.querySelectorAll('style')].reduce((a,s)=>a+(s.textContent||'').length,0),
  accent: getComputedStyle(document.documentElement).getPropertyValue('--flins-accent').trim(),
  fab: !!document.querySelector('.flins-fab'),
  errors: (window.__flinsErrors || []).slice(0, 6)
}, null, 2)`;

const BOOT = `window.__flinsErrors = window.__flinsErrors || [];
window.addEventListener('error', (e) => window.__flinsErrors.push(String(e.message)));
`;

async function main() {
  console.log(`浏览器: ${which}  (${exe})`);
  console.log(`扩展  : ${EXT}`);
  console.log(`配置  : ${PROFILE}\n`);

  const reuse = !!process.env.FLINS_REUSE;
  const args = [
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1000',
  ];
  if (!reuse) {
    args.push(`--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`);
  }
  args.push('about:blank');
  console.log(reuse ? '（复用已有配置，不再传 --load-extension：验证持久化）\n' : '');

  const child = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: false });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

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
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });

    // 先直接看扩展有没有被登记
    const extList = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    console.log('CDP 可见目标：');
    for (const t of extList) console.log(`  ${t.type.padEnd(16)} ${(t.title || '').slice(0, 40)}  ${(t.url || '').slice(0, 60)}`);

    await cdp.send('Page.navigate', { url: 'https://www.luogu.com.cn/problem/P1001' });
    await sleep(10000);

    const out = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    console.log('\n── 页面探测 ──');
    console.log(out.result.value);

    // 顺手读一下浏览器自己的扩展管理页：装没装上、有没有被禁用、报不报错
    const EXT_PAGE = which === 'edge' ? 'edge://extensions/' : 'chrome://extensions/';
    try {
      await cdp.send('Page.navigate', { url: EXT_PAGE });
      await sleep(3500);
      const dump = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const mgr = document.querySelector('extensions-manager');
          if (!mgr || !mgr.shadowRoot) return '（读不到扩展管理页，跳过）';
          const list = mgr.shadowRoot.querySelector('extensions-item-list');
          if (!list || !list.shadowRoot) return '（读不到列表，跳过）';
          const items = [...list.shadowRoot.querySelectorAll('extensions-item')];
          return JSON.stringify(items.map((it) => {
            const sr = it.shadowRoot;
            const name = sr && sr.querySelector('#name') ? sr.querySelector('#name').textContent.trim() : '?';
            const enable = sr && sr.querySelector('#enableToggle');
            return {
              name,
              id: it.getAttribute('id') || it.id || '',
              enabled: enable ? enable.checked : null,
              errors: sr && sr.querySelector('#errors-button') ? '有错误按钮' : '无'
            };
          }), null, 2);
        })()`,
      });
      console.log('\n── 浏览器扩展管理页里登记的扩展 ──');
      console.log(dump.result.value);
    } catch (e) {
      console.log('\n（读扩展管理页失败：' + e.message + '）');
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    const png = join(ROOT, '.exttest', `${which}-extension.png`);
    writeFileSync(png, Buffer.from(shot.data, 'base64'));
    console.log('截图 → ' + png);
  } finally {
    try { ws && ws.close(); } catch (e) { /* ignore */ }
    await sleep(500);
    child.kill();
  }

  const interesting = stderr.split('\n').filter((l) =>
    /extension|manifest|Failed|ERROR|load/i.test(l)).slice(0, 15);
  if (interesting.length) {
    console.log('\n── 浏览器 stderr 里与扩展相关的行 ──');
    interesting.forEach((l) => console.log('  ' + l.trim()));
  }
  console.log('\n完成。');
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1); });

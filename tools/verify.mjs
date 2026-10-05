/**
 * 布局验证：题目页原侧栏是否保留、信息栏位置、主栏宽度。
 * 用法：FLINS_PROFILE_DIR=.login/profile-auth node tools/verify.mjs [url]
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROFILE = process.env.FLINS_PROFILE_DIR || join(ROOT, '.login', 'profile-auth');
const URL_ = process.argv[2] || 'https://www.luogu.com.cn/problem/P1001';
const PORT = Number(process.env.FLINS_CDP_PORT || 9678);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCRIPT = readFileSync(join(ROOT, 'dist', 'flins.user.js'), 'utf8');
mkdirSync(PROFILE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) { /* wait */ }
    await sleep(400);
  }
  throw new Error('no cdp');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { const x = this.p.get(m.id); this.p.delete(m.id); m.error ? x.reject(new Error(JSON.stringify(m.error))) : x.resolve(m.result); } }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('timeout ' + method)); }, 30000); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result && r.result.value; }
}

const Q = `JSON.stringify((() => {
  const sy = Math.round(window.scrollY);
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return sel + ': MISSING';
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return sel + ': x=' + Math.round(r.x) + ' w=' + Math.round(r.width)
      + ' yDoc=' + Math.round(r.y + sy) + ' h=' + Math.round(r.height)
      + ' display=' + cs.display + ' flex=' + cs.flex + ' dir=' + cs.flexDirection;
  };
  const out = [
    'scrollY=' + sy,
    box('.top-bar'),
    box('nav.sidebar'),
    box('.columba-content-wrap'),
    box('.sidebar-container'),
    box('.sidebar-container > .main'),
    box('.side'),
    box('.l-card.problem'),
    box('.header-card')
  ];
  const p = document.querySelector('.l-card.problem');
  if (p) {
    const pb = getComputedStyle(p, '::before');
    const pa = getComputedStyle(p, '::after');
    out.push('problem_before=bg:' + pb.backgroundColor + ' bd:' + pb.borderTopWidth + ' sh:' + pb.boxShadow);
    out.push('problem_after=bg:' + pa.backgroundColor + ' bd:' + pa.borderTopWidth + ' sh:' + pa.boxShadow);
    const wrap = p.querySelector('.lfe-marked-wrap');
    if (wrap) {
      const wr = wrap.getBoundingClientRect();
      out.push('marked_wrap=w:' + Math.round(wr.width) + ' x:' + Math.round(wr.x));
    }
  }
  const side = document.querySelector('.side');
  if (side) {
    out.push('side_children=' + [...side.children].map(c => (typeof c.className === 'string' ? c.className.trim().slice(0, 30) : c.tagName) + '(' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height) + ')').join(' | '));
  }
  const main = document.querySelector('.sidebar-container > .main');
  if (main) {
    out.push('main_children=' + [...main.children].map(c => (typeof c.className === 'string' ? c.className.trim().slice(0, 30) : c.tagName) + '(' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height) + ')').join(' | '));
  }
  out.push('patchErrs=' + JSON.stringify(window.__flinsPatchErrors || []));
  return out;
})(), null, 1)`;

async function main() {
  const child = spawn(EDGE, [
    `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
    '--no-first-run', '--no-default-browser-check', '--window-size=1600,1000', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let ws;
  try {
    ws = new WebSocket(await target());
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    const preset = JSON.stringify({ mode: 'dark', layout: 'flins', navMode: 'inline' });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('flins-theme-v1',${JSON.stringify(preset)});}catch(e){}` + SCRIPT });
    await cdp.send('Page.navigate', { url: URL_ });
    await sleep(12000);
    console.log(await cdp.eval(Q));
  } finally {
    try { ws && ws.close(); } catch (e) { /* ignore */ }
    child.kill();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });

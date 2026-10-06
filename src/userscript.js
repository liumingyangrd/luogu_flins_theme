// ==UserScript==
// @name         洛谷 · 菲林斯主题「终夜长茔 · 夜巡」
// @namespace    https://github.com/liumingyangrd/luogu_flins_theme
// @homepageURL  https://github.com/liumingyangrd/luogu_flins_theme
// @updateURL    https://raw.githubusercontent.com/liumingyangrd/luogu_flins_theme/main/dist/flins.user.js
// @downloadURL  https://raw.githubusercontent.com/liumingyangrd/luogu_flins_theme/main/dist/flins.user.js
// @version      1.2.0
// @description  为洛谷换上一套《原神》菲林斯主题：深靛蓝夜色 + 提灯冷蓝焰 + 金色新月 + 灯塔剪影。支持自定义背景图片（内置 / 链接 / 本地上传）、深浅两套形态、四种强调色与毛玻璃开关。
// @author       Flins Theme
// @license      MIT
// @match        *://*.luogu.com.cn/*
// @match        *://*.luogu.com/*
// @match        *://*.luogu.me/*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230B0F2B'/%3E%3Cpath d='M52.4 6.4a8.8 8.8 0 1 0 6.3 10.6 7 7 0 1 1-6.3-10.6z' fill='%23F0C070'/%3E%3Crect x='24.6' y='16.2' width='10.8' height='13.4' rx='1.8' fill='%230B0F2B' stroke='%23C8CBD6' stroke-width='1.3'/%3E%3Cpath d='M30 18.4c2.7 3.3 3.9 5.1 3.9 7.1a3.9 3.9 0 0 1-7.8 0c0-2 1.2-3.8 3.9-7.1z' fill='%2360E0F0'/%3E%3Cpath d='M25.6 30.4h8.8l2.4 19.0H23.2z' fill='%23101640'/%3E%3C/svg%3E
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

/* eslint-disable no-multi-spaces */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
     构建产物 —— 不要手改本文件
     源码：src/userscript.js + src/flins.css + src/_tokens.generated.css
     构建：node tools/build.mjs
     ══════════════════════════════════════════════════════════════════════ */

  /** 主题样式表（由构建脚本注入） */
  const THEME_CSS = /* @flins:css */ "" /* @flins:css-end */;

  /** 内置背景图（由构建脚本注入 base64；默认自带「夜巡」插画） */
  const BUILTIN_BG = /* @flins:bg */ {} /* @flins:bg-end */;

  /** 誓灯徽记（由构建脚本注入） */
  const EMBLEM_SVG = /* @flins:emblem */ "" /* @flins:emblem-end */;

  // ────────────────────────────────────────────────────────────────────────
  // 配置
  // ────────────────────────────────────────────────────────────────────────
  const STORE_KEY = 'flins-theme-v1';

  const PRESET_ACCENTS = {
    ghost: { name: '幽焰青', hex: '#60E0F0' },
    volt:  { name: '雷紫',   hex: '#9C8CFF' },
    lamp:  { name: '提灯金', hex: '#F0C070' },
    // 洛谷原生蓝：给「想要改动最小」的人用
    luogu: { name: '洛谷蓝', hex: '#3498DB' },
  };

  const DEFAULTS = {
    mode: 'auto',            // auto | dark | light
    accent: 'ghost',         // 预设名，或 'custom'
    accentCustom: '#60E0F0',
    bgSource: 'auto',        // auto | builtin-dark | builtin-light | url | upload | none
    bgUrl: '',
    bgUpload: '',            // data URL
    bgBlur: 0,
    bgBrightness: 1,
    bgZoom: 1,
    bgPosition: 'center center',
    bgSize: 'cover',
    bgRepeat: 'no-repeat',
    bgScrim: 0.5,
    glass: true,
    ornaments: true,
    motion: true,
    autoPatch: true,         // 自动修补遗漏的白块 / 低对比度文字（仅深色形态）
    ornamentStyle: 'lamp',   // 标题小灯：lamp 灯芯 / moon 新月 / none 无
    layout: 'flins',         // 菲林斯版式 / classic 洛谷原版
    navMode: 'inline',       // 导航形态：inline 并入顶栏 / stack 双行融合 / side 左侧竖栏
    fabImage: '',            // 右下角小灯按钮的自定义图片（空 = 用内置誓灯徽记）
    emblemImage: '',         // 顶栏左上角誓灯徽记的自定义图片（空 = 用内置 SVG）
    lampImage: '',           // 标题小灯的自定义图片（空 = 用内置灯芯/新月）
  };

  const store = {
    read() {
      try {
        if (typeof GM_getValue === 'function') {
          const raw = GM_getValue(STORE_KEY, null);
          if (raw) return Object.assign({}, DEFAULTS, typeof raw === 'string' ? JSON.parse(raw) : raw);
        }
      } catch (e) { /* 落到 localStorage */ }
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
      } catch (e) { /* 用默认值 */ }
      return Object.assign({}, DEFAULTS);
    },
    write(cfg) {
      const payload = JSON.stringify(cfg);
      try {
        if (typeof GM_setValue === 'function') { GM_setValue(STORE_KEY, payload); return; }
      } catch (e) { /* 落到 localStorage */ }
      try { localStorage.setItem(STORE_KEY, payload); } catch (e) { /* 忽略超配额 */ }
    },
  };

  /** 洛谷官方在低端机上会自动关掉毛玻璃并写入这个键；我们必须尊重它。 */
  function luoguBlurDisabled() {
    try { return localStorage.getItem('themeBlurPreference') === 'disabled'; } catch (e) { return false; }
  }

  let cfg = store.read();

  // ────────────────────────────────────────────────────────────────────────
  // 工具
  // ────────────────────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [96, 224, 240];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function toHex(rgb) {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  function mix(c, target, t) {
    return c.map((v, i) => v + (target[i] - v) * t);
  }

  function resolveMode() {
    if (cfg.mode === 'dark' || cfg.mode === 'light') return cfg.mode;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) { return 'dark'; }
  }

  function currentAccent() {
    if (cfg.accent === 'custom') return { hex: cfg.accentCustom, name: '自定义' };
    return PRESET_ACCENTS[cfg.accent] || PRESET_ACCENTS.ghost;
  }

  function currentBgImage(isLight) {
    switch (cfg.bgSource) {
      // 跟随形态：深色配「夜巡」插画，浅色配「霜晨」插画
      case 'auto':          return (isLight ? BUILTIN_BG.light : BUILTIN_BG.dark)
                                   ? 'url("' + (isLight ? BUILTIN_BG.light : BUILTIN_BG.dark) + '")' : 'none';
      case 'builtin-dark':  return BUILTIN_BG.dark ? 'url("' + BUILTIN_BG.dark + '")' : 'none';
      case 'builtin-light': return BUILTIN_BG.light ? 'url("' + BUILTIN_BG.light + '")' : 'none';
      case 'url':           return cfg.bgUrl ? 'url("' + cfg.bgUrl.replace(/"/g, '\\"') + '")' : 'none';
      case 'upload':        return cfg.bgUpload ? 'url("' + cfg.bgUpload + '")' : 'none';
      default:              return 'none';
    }
  }

  function glassEffective() {
    return cfg.glass && !luoguBlurDisabled();
  }

  // ────────────────────────────────────────────────────────────────────────
  // 白块自愈
  //
  // 为什么需要它：洛谷有「新版外壳 + 老版内容」两套前端，样式还拆成
  // 几十个按需加载的 chunk，其中不少把 background 直接写死成 #fff。
  // 靠人工枚举选择器永远追不完 —— 尤其登录后才会出现的犇犇、多选翻页条、
  // 关注/粉丝列表这些，未登录根本看不到。
  //
  // 所以这里做运行时兜底：扫出「近白背景 + 深色文字 + 纯色（无背景图）」的
  // 容器，就地改成主题表面色。宁可保守漏掉一些，也不要误伤。
  // ────────────────────────────────────────────────────────────────────────
  // 注意 BUTTON 不在这里：题库翻页条的页码就是 <button>，
  // 白底白字（background:#fff + color:#fff），把 button 排除掉就永远修不到它。
  const SKIP_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'INPUT',
    'TEXTAREA', 'SELECT', 'OPTION', 'CODE', 'PRE', 'HR', 'BR', 'PATH']);

  function parseColor(str) {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/.exec(str || '');
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  /** 找出页面上「本该是深色却还是白的」容器 */
  function findWhitePatches() {
    const hits = [];
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.closest('.flins-panel, .flins-fab, #flins-theme-style, .cm-editor')) continue;

      const r = el.getBoundingClientRect();
      // 阈值别设太大：题库翻页条的页码按钮只有 24×26，
      // 阈值不要调大：设成 26 以上会整片漏掉
      if (r.width < 20 || r.height < 14) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.5) continue;
      // 有背景图（渐变、图片、纹理）的一律不碰，容易误伤
      if (cs.backgroundImage && cs.backgroundImage !== 'none') continue;

      const bg = parseColor(cs.backgroundColor);
      if (!bg || bg.a < 0.6) continue;
      if (Math.min(bg.r, bg.g, bg.b) < 200) continue;      // 只看近白
      if (Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) > 26) continue; // 排除彩色

      // 注意：这里【不能】要求「文字必须是深色」。
      // 私信气泡就是反例——它原本是白底深字，主题把 body 文字色改成近白之后
      // 变成白底白字，如果还要求 fg 是深色就会被整片漏掉。
      // 深色形态下，任何「纯色近白容器」都是错的，一律修。

      // 祖先里已经有白色容器的话，改最外层就够 —— 这个优化【不能要】。
      // 私信的联系人条目就是个反例：容器是深色的，条目自己写了
      // background:#e8e8e8，如果因为「某个祖先也偏白」就跳过它，
      // 那一整条浅灰底会一直留着。所以逐个元素独立判断。

      hits.push(el);
    }
    return hits;
  }

  /** 就地修补；返回 { fixed, sample } */
  function patchWhitePatches() {
    const hits = findWhitePatches();
    const sample = [];
    for (const el of hits) {
      const cls = typeof el.className === 'string' ? el.className.trim().slice(0, 60) : '';
      if (sample.length < 12) sample.push(el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\s+/).join('.') : ''));
      markFix(el, 'background-color', 'var(--flins-surface)');
      markFix(el, 'color', el.tagName === 'A' ? 'var(--lcolor--link)' : 'var(--flins-text)');
    }
    return { fixed: hits.length, sample };
  }

  // ── 自愈补丁的记账 ──────────────────────────────────────────────────────
  // 补丁不能用行内样式写死：切换深浅形态时旧值必须能还原。
  // 因此每一次写入都记账，切换形态时先全部还原，再重新决定要不要打。
  const appliedFixes = [];

  function markFix(el, prop, value) {
    appliedFixes.push({
      el, prop,
      prev: el.style.getPropertyValue(prop),
      prevPri: el.style.getPropertyPriority(prop),
    });
    el.style.setProperty(prop, value, 'important');
  }

  function clearFixes() {
    for (let i = appliedFixes.length - 1; i >= 0; i -= 1) {
      const f = appliedFixes[i];
      try {
        if (f.prev) f.el.style.setProperty(f.prop, f.prev, f.prevPri);
        else f.el.style.removeProperty(f.prop);
      } catch (e) { /* 元素可能已被移除 */ }
    }
    appliedFixes.length = 0;
  }

  /** 找文字元素时，长度阈值别设成 >1：
   *  咕值那种「社区贡献 7」是单个数字，>1 会把它们整片漏掉。 */
  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length >= 1) return true;
    }
    return false;
  }

  let patchTimer = null;

  // ── 对比度自愈 ──────────────────────────────────────────────────────────
  // 洛谷有大量组件把文字色写死成 rgba(0,0,0,.85) / rgb(64,64,64) 这类深色
  // （本来是给白底用的）。深色主题下它们压在深色底上，实测对比度只有 1.07:1，
  // 等于隐形。这类写死的颜色散落在几十个按需加载的 chunk 里，还有登录后才
  // 出现的（私信、犇犇），没法靠枚举选择器追完 —— 所以运行时算对比度直接修。
  function relLum(c) {
    const f = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }

  /** 逐级向上找第一个不透明背景。
   *  ⚠️ 一定要给兜底值：本主题把所有容器都设成了透明，好让 html::before 的
   *  背景图透出来 —— 于是往上走到 <html> 都找不到不透明背景。
   *  这里必须返回兜底色：返回 null 会让每一条都被 continue 掉，自愈形同虚设。 */
  function bgBehind(el) {
    let p = el;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') break;
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a >= 0.9) return [bg.r, bg.g, bg.b];
      p = p.parentElement;
    }
    // 兜底＝背景图上那层夜色蒙版的近似色，够算对比度了
    return resolveMode() === 'light' ? [236, 242, 253] : [11, 15, 43];
  }

  function patchLowContrast() {
    const fixed = [];
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.closest('.flins-panel, .flins-fab, .cm-editor')) continue;
      // 用户组名色 / 洛谷语义色是【有意为之】的，不能当成「对比度不足」去改。
      // 「橙名变黑名」就是这么来的：洛谷用 .lg-fg-orange 之类给用户名上色，
      // 自愈一看对比度不够就把它刷成了正文色。
      if (el.closest('[class*="lg-fg-"], [class*="lcolor--"], [class*="lcolor-var-"]')) continue;
      // 注意：不要再整类跳过 username / user-name / a[href^=/user/]。
      // 洛谷新外壳的 .luogu-username.user-name 不带语义色类，深色形态下
      // 计算色是 rgb(64,64,64)，肉眼就是「黑名」；整类跳过永远修不掉它。
      // 真正的橙名走 .lg-fg-orange 或 var(--lfe-color--orange-3)，亮度 L1≈0.45，
      // 不会命中下面的 L1<0.2 分支，因此也不会被误刷成正文色。
      // 只处理「直接含文字」的元素，避免把整块容器染色
      const hasText = hasOwnText(el);
      if (!hasText) continue;

      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.4) continue;

      const fg = parseColor(cs.color);
      const bg = bgBehind(el);
      if (!fg || !bg) continue;

      const mix = fg.a >= 1 ? [fg.r, fg.g, fg.b] : [
        fg.a * fg.r + (1 - fg.a) * bg[0],
        fg.a * fg.g + (1 - fg.a) * bg[1],
        fg.a * fg.b + (1 - fg.a) * bg[2],
      ];
      const L1 = relLum(mix), L2 = relLum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio >= 4.5) continue;

      // 别用「文字是否比背景暗」来判断 —— 主题的底非常暗（#080b21 亮度仅 0.0045），
      // 连 rgb(39,39,39) 都比它亮，于是那种 1.3:1 的深灰字反而被判成「正常」。
      // 正确做法是看文字的绝对亮度：深色主题下，文字本身偏暗就是错的。
      const fgIsDark = L1 < 0.2;
      if (fgIsDark) {
        // 情况一：文字本身是深色（洛谷大量组件写死 rgba(0,0,0,.85)、rgb(64,64,64)…）
        if (fixed.length < 400) {
          markFix(el, 'color', 'var(--flins-text)');
          fixed.push(describe(el) + '(' + ratio.toFixed(2) + ':1)');
        }
      } else if (isNearAccent(bg)) {
        // 情况二：亮字压在我自己的强调色底上（选中态、实心按钮），
        // 白字对比度只有 1.5:1 左右，要换成近黑。
        //
        // ⚠️ 判据必须是「背景接近主题强调色」，不能只看亮度。
        // 不能只按亮度判断：洛谷的「普及」难度徽标是金底 #ffc116，亮度 0.60，
        // 按亮度会被误判成强调色底，把白字刷黑，与相邻徽标不一致。
        if (fixed.length < 400) {
          markFix(el, 'color', 'var(--flins-on-accent)');
          fixed.push(describe(el) + '(' + ratio.toFixed(2) + ':1,强调色底)');
        }
      }
    }
    return fixed;
  }

  function describe(el) {
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    return cls ? el.tagName.toLowerCase() + '.' + cls.split(/\s+/)[0] : el.tagName.toLowerCase();
  }

  /** 背景是否接近当前主题强调色。用于区分「我自己的底色」与洛谷的语义徽标。 */
  function isNearAccent(bg) {
    const acc = hexToRgb(currentAccent().hex);
    const tol = 52;
    return Math.abs(bg[0] - acc[0]) < tol
        && Math.abs(bg[1] - acc[1]) < tol
        && Math.abs(bg[2] - acc[2]) < tol;
  }

  /** 第三种破绽：CSS 三角形（气泡的「小尖」）
   *  做法是 width/height 为 0、靠 border 撑出形状的元素，颜色写在
   *  border-*-color 上而不是 background 上 —— 前两种自愈都查不到它。
   *  这类元素的颜色原本是跟着白底气泡走的，主题把气泡改成深色之后，
   *  尖就单独留着一块浅色，非常显眼。这里把它改成最近的不透明祖先底色。 */
  function patchTriangleTails() {
    const fixed = [];
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.width), h = parseFloat(cs.height);
      if (w > 3 || h > 3) continue;                       // 只可能是三角形
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const sides = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
      let light = 0, solid = 0;
      const vals = {};
      for (const s of sides) {
        const c = parseColor(cs[s]);
        const width = parseFloat(cs[s.replace('Color', 'Width')]) || 0;
        if (width <= 0 || !c || c.a < 0.5) continue;
        solid += 1;
        vals[s] = c;
        if (Math.min(c.r, c.g, c.b) >= 190) light += 1;
      }
      if (!solid || light !== solid) continue;             // 至少要有一边实心，且全为浅色
      // 找最近的不透明祖先底色，让尖和气泡本体同色
      let p = el.parentElement, target = null;
      while (p && p !== document.documentElement) {
        const pcs = getComputedStyle(p);
        const bg = parseColor(pcs.backgroundColor);
        if (bg && bg.a >= 0.6) { target = pcs.backgroundColor; break; }
        p = p.parentElement;
      }
      if (!target) target = 'var(--flins-surface)';
      for (const s of Object.keys(vals)) {
        markFix(el, 'border-' + s.replace('border', '').replace('Color', '').toLowerCase() + '-color', target);
      }
      fixed.push(describe(el) + '→' + target);
    }
    return fixed;
  }

  let patchDeadline = 0;

  /** 题目页操作条（复制 Markdown / 中文 / 展开 / IDE 模式）点击修复。
   *
   *  为什么 CSS 修不动：洛谷题面第一个 h2（题目背景）自带 position/层级，
   *  实测会把操作条整条盖住 —— elementFromPoint 落在 h2 上，链接收不到点击。
   *  CSS 层写了 .l-card.problem .problem-block-actions { position: relative; z-index: 5 }
   *  但洛谷自己的规则特异性/顺序把它压掉了（computed 仍是 static）。
   *  这里直接用 inline style 钉死，inline 的优先级高于一切样式表。 */
  function patchProblemActions() {
    const bar = document.querySelector('.problem-block-actions');
    if (!bar) return 0;
    const style = bar.style;
    style.position = 'relative';
    style.zIndex = '999';
    style.pointerEvents = 'auto';
    // 链接也保证可点
    for (const a of bar.querySelectorAll('a')) {
      a.style.position = 'relative';
      a.style.zIndex = '999';
      a.style.pointerEvents = 'auto';
    }
    return bar.querySelectorAll('a').length;
  }

  function runPatches() {
    // 补丁不能静默吞异常：中途抛错会让后续元素全部修不到，且表面上无迹可寻。
    // 错误统一记到 window.__flinsPatchErrors，审计工具会读出来。
    const errs = (window.__flinsPatchErrors = window.__flinsPatchErrors || []);
    const out = { white: null, dim: null, tails: null };
    try { out.white = patchWhitePatches(); } catch (e) { errs.push('white: ' + (e && e.message)); }
    try { out.dim = patchLowContrast(); } catch (e) { errs.push('dim: ' + (e && e.message)); }
    try { out.tails = patchTriangleTails(); } catch (e) { errs.push('tails: ' + (e && e.message)); }
    try { out.actions = patchProblemActions(); } catch (e) { errs.push('actions: ' + (e && e.message)); }
    // 面包屑可能异步渲染完（宽度变化），导航边界跟着重算
    try { syncNavBounds(); } catch (e) { errs.push('navbounds: ' + (e && e.message)); }
    return out;
  }

  // ⚠️ 防抖必须带「最长等待」。
  // 私信 / 犇犇 这类页面 DOM 一直在变（消息流、动画、轮询），
  // 纯 clearTimeout + setTimeout 的防抖会被无限重置，补丁永远等不到执行 ——
  // 联系人条目那块浅灰底就是这么活下来的。
  function schedulePatch() {
    if (!cfg.autoPatch) return;
    if (resolveMode() !== 'dark') return;
    const now = Date.now();
    if (!patchDeadline) patchDeadline = now + 1500;   // 最迟 1.5 秒内一定要跑一次
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
      patchDeadline = 0;
      runPatches();
    }, Math.max(0, Math.min(600, patchDeadline - now)));
  }

  // ────────────────────────────────────────────────────────────────────────
  // 应用配置：把结果写成 CSS 变量，样式表完全靠变量驱动
  // ────────────────────────────────────────────────────────────────────────
  function apply() {
    const root = document.documentElement;
    const isLight = resolveMode() === 'light';
    const accent = currentAccent();
    const rgb = hexToRgb(accent.hex);

    // 切换形态前先把上一轮自愈打的补丁全部还原：
    // 补丁用的是行内样式，不还原的话，深色下被提亮的用户名到了浅色里
    // 会变成 --flins-text（近黑）——「橙名变黑名」就是这么来的。
    clearFixes();

    root.classList.toggle('flins-light', isLight);
    root.classList.toggle('flins-dark', !isLight);
    root.classList.toggle('flins-glass-off', !glassEffective());
    root.classList.toggle('flins-ornaments-off', !cfg.ornaments);
    root.classList.toggle('flins-motion-off', !cfg.motion);
    // 标题小灯样式（灯芯 / 新月 / 无）
    for (const s of ['lamp', 'moon', 'none']) {
      root.classList.toggle('flins-orn-' + s, cfg.ornamentStyle === s);
    }
    // 强调色预设：把 .flins-accent-* 类挂到 html，
    // 否则 _tokens.generated.css 里的雷紫/提灯金/洛谷蓝语义色块永远是死代码，
    // .lcolor--link / .lcolor--background 等会一直停留在幽焰青。
    for (const name of Object.keys(PRESET_ACCENTS)) {
      root.classList.toggle('flins-accent-' + name, cfg.accent === name);
    }
    // 版式（菲林斯 / 洛谷原版）+ 导航形态（单行 / 双行融合 / 左侧竖栏）
    root.classList.toggle('flins-layout-flins', cfg.layout === 'flins');
    root.classList.toggle('flins-layout-classic', cfg.layout !== 'flins');
    for (const nm of ['inline', 'stack', 'side']) {
      root.classList.toggle('flins-nav-' + nm, cfg.layout === 'flins' && cfg.navMode === nm);
    }

    const base = isLight ? '233, 239, 250' : '6, 9, 26';
    // 菲林斯版式把蒙版减薄三成：卡片已经是厚玻璃了，再压一层重蒙版
    // 等于把背景插画白画了（灯塔、新月全看不见）。
    const k = cfg.bgScrim * (cfg.layout === 'flins' ? 0.62 : 1);
    const clamp = (v) => Math.max(0, Math.min(0.98, v));
    const scrim = cfg.bgSource === 'none'
      ? (isLight ? 'linear-gradient(180deg, #EEF3FC 0, #E6EDF9 100%)'
                 : 'linear-gradient(180deg, #0B0F2B 0, #080B21 100%)')
      : 'linear-gradient(180deg,'
        + ' rgba(' + base + ', ' + clamp(k + 0.18) + ') 0,'
        + ' rgba(' + base + ', ' + clamp(k - 0.1) + ') 240px,'
        + ' rgba(' + base + ', ' + clamp(k + 0.04) + ') 62%,'
        + ' rgba(' + base + ', ' + clamp(k + 0.22) + ') 100%)';

    const vars = {
      '--flins-bg-image': currentBgImage(isLight),
      '--flins-bg-size': cfg.bgSize,
      '--flins-bg-position': cfg.bgPosition,
      '--flins-bg-repeat': cfg.bgRepeat,
      '--flins-bg-blur': cfg.bgBlur + 'px',
      '--flins-bg-brightness': String(cfg.bgBrightness),
      '--flins-bg-zoom': String(cfg.bgZoom),
      '--flins-bg-scrim': scrim,
      '--flins-accent': accent.hex,
      '--flins-accent-rgb': rgb.join(', '),
      '--flins-accent-soft': toHex(mix(rgb, [255, 255, 255], 0.45)),
      '--flins-emblem': 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(EMBLEM_SVG) + '")',
      '--flins-fab-image': cfg.fabImage ? 'url("' + cfg.fabImage + '")' : 'none',
      '--flins-emblem-image': cfg.emblemImage ? 'url("' + cfg.emblemImage + '")' : 'none',
      '--flins-lamp-image': cfg.lampImage ? 'url("' + cfg.lampImage + '")' : 'none',
      // 强调色同时驱动洛谷语义令牌：自定义取色需要在脚本里写死三元组
      '--lcolor--primary': rgb.join(', '),
      '--lfe-color--primary': accent.hex,
    };

    for (const name of Object.keys(vars)) {
      root.style.setProperty(name, vars[name], 'important');
    }
    // 按钮本体在 mountPanel 之后才存在，这里顺手同步一下状态
    if (fabEl) fabEl.dataset.img = cfg.fabImage ? '1' : '0';
    // 两处灯换成自定义图片时，切到"图片模式"的类
    root.classList.toggle('flins-emblem-img', !!cfg.emblemImage);
    root.classList.toggle('flins-lamp-img', !!cfg.lampImage);

    // 单行导航的左右边界：实测品牌区与用户区宽度，写进 CSS 变量。
    // 固定数值不可用：面包屑长度随页面变化，会产生「导航条比左侧文字短一截」
    // 或者压到搜索框上的问题。
    syncNavBounds();
  }

  /* ────────────────────────────────────────────────────────────────────────
     单行导航的边界自适应

     nav.sidebar 不在 .top-bar 的 DOM 里（是它的兄弟节点），只能 fixed 定位，
     所以左右边界必须自己算。实测顶栏里两个块的宽度：
       · 品牌区 = 左内边距 + logo 宽 + 间隙（面包屑在它右侧，宽度随页面变）
       · 用户区 = 搜索 / 私信 / 铃铛 / 头像 的总宽
     每次布局变化（面包屑文字变长、登录态变化）都重算一遍。
     ──────────────────────────────────────────────────────────────────────── */
  function syncNavBounds() {
    if (cfg.layout !== 'flins' || cfg.navMode !== 'inline') return;
    const bar = document.querySelector('.top-bar');
    if (!bar) return;
    const left = bar.querySelector('.left');
    const right = bar.querySelector('.right');
    if (!left || !right) return;

    const logo = left.querySelector('.logo-link');
    const crumb = left.querySelector('.breadcrumb');

    // 品牌区宽度：logo 右边缘相对顶栏左边界的距离
    let brandW = 0;
    if (logo) {
      const lr = logo.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      brandW = Math.round(lr.right - br.left);
    }
    // 面包屑宽度：只取它实际占的宽度（已被 CSS 截断过）
    let crumbW = 0;
    if (crumb) {
      const cr = crumb.getBoundingClientRect();
      crumbW = Math.round(cr.width);
    }
    // 用户区宽度 + 左侧发丝线
    let userW = 0;
    {
      const rr = right.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      userW = Math.round(br.right - rr.left);
    }

    const root = document.documentElement;
    root.style.setProperty('--flins-brand-w', brandW + 'px', 'important');
    root.style.setProperty('--flins-crumb-w', crumbW + 'px', 'important');
    root.style.setProperty('--flins-user-w', userW + 'px', 'important');
  }

  // ────────────────────────────────────────────────────────────────────────
  // 样式注入
  //
  // ⚠️ 这里是整套脚本最容易挂的地方，务必保持现在的写法：
  //    @run-at document-start 时 document.head 与 document.documentElement
  //    「都可能是 null」（文档还是完全空的）。这里若直接
  //    (document.head || document.documentElement).appendChild(...) 会抛
  //    TypeError，整个 boot() 就此中断，页面上一点效果都没有。
  //    所以：① 等根元素出现再插 ② 不用 GM_addStyle，自己管 <style> 的 id，
  //    这样 ensure() 能检测到它丢了并补回来。
  // ────────────────────────────────────────────────────────────────────────
  const STYLE_ID = 'flins-theme-style';
  const PANEL_STYLE_ID = 'flins-panel-style';

  /** documentElement 还不存在时，等它出现再回调。 */
  function whenRoot(fn) {
    if (document.documentElement) { fn(); return; }
    let done = false;
    const run = () => {
      if (done || !document.documentElement) return;
      done = true;
      try { obs.disconnect(); } catch (e) { /* ignore */ }
      clearInterval(timer);
      fn();
    };
    const obs = new MutationObserver(run);
    try { obs.observe(document, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
    const timer = setInterval(run, 8);
  }

  function addStyle(css, id) {
    const put = () => {
      const host = document.head || document.documentElement;
      if (!host) return false;
      if (id && document.getElementById(id)) return true;
      const s = document.createElement('style');
      if (id) s.id = id;
      s.textContent = css;
      host.appendChild(s);
      return true;
    };
    if (put()) return true;
    whenRoot(put);
    return false;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 设置面板样式
  // 注意：这里的 transition 一律写「显式属性」而不是 all——
  //       写 all 会把「继承自面板的 visibility」也纳入过渡，
  //       面板展开后子元素会长时间停在 hidden（按钮整片看不见）。
  // ────────────────────────────────────────────────────────────────────────
  const T_BTN = 'border-color .16s, background-color .16s, color .16s, box-shadow .16s';

  const PANEL_CSS = [
    '.flins-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:46px;height:46px;',
    '  border:1px solid rgba(var(--flins-accent-rgb),.45);border-radius:50%;cursor:pointer;padding:0;',
    '  background-image:var(--flins-fab-image, none),',
    '    radial-gradient(circle at 50% 42%,rgba(var(--flins-accent-rgb),.28),rgba(10,14,36,.94) 68%);',
    '  background-size:cover, auto;background-position:center, center;background-repeat:no-repeat, no-repeat;',
    '  box-shadow:0 10px 26px -12px #000,0 0 0 1px rgba(255,255,255,.04) inset;',
    '  backdrop-filter:blur(10px);display:grid;place-items:center;',
    '  transition:transform .18s ease,box-shadow .18s ease}',
    /* 换成自定义图片时，把内置的誓灯 SVG 收起来 */
    '.flins-fab[data-img="1"] svg{display:none}',
    '.flins-fab:hover{transform:translateY(-2px);box-shadow:0 14px 30px -12px #000}',
    '.flins-fab svg{width:26px;height:26px;display:block}',

    '.flins-panel{position:fixed;right:20px;bottom:78px;z-index:2147483000;width:330px;',
    '  max-height:min(78vh,720px);overflow:auto;overscroll-behavior:contain;padding:16px 16px 14px;',
    '  border-radius:16px;border:1px solid rgba(var(--flins-accent-rgb),.28);',
    '  background:linear-gradient(180deg,rgba(13,18,44,.975),rgba(8,11,30,.985));',
    '  color:#E6EBFB;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
    '  box-shadow:0 30px 70px -24px #000,0 0 0 1px rgba(255,255,255,.04) inset;',
    '  backdrop-filter:blur(16px) saturate(1.2);',
    '  opacity:0;visibility:hidden;transform:translateY(10px) scale(.985);',
    '  transition:opacity .18s ease,transform .18s ease,visibility .18s}',
    /* 展开态：既放开面板自身，也强制子元素可见（见上面的注释） */
    '.flins-panel[data-open="1"]{opacity:1;visibility:visible;transform:none}',
    '.flins-panel[data-open="1"] *{visibility:visible}',
    '.flins-panel *{box-sizing:border-box}',
    '.flins-panel h4{margin:0 0 2px;font:600 15px/1.4 Georgia,"Noto Serif SC","Songti SC",serif;',
    '  letter-spacing:.06em;color:#F2F4F8}',
    '.flins-panel .sub{margin:0 0 12px;font-size:11.5px;letter-spacing:.08em;color:rgba(150,162,196,.85)}',
    '.flins-sec{margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid rgba(150,190,235,.12)}',
    '.flins-sec:last-of-type{border-bottom:0;padding-bottom:2px}',
    '.flins-lab{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;',
    '  font-size:11.5px;letter-spacing:.1em;color:#8E9BBB}',
    '.flins-lab b{font-weight:600;color:rgba(var(--flins-accent-rgb),.95);font-variant-numeric:tabular-nums}',

    '.flins-seg{display:flex;gap:6px;flex-wrap:wrap}',
    '.flins-seg button{flex:1 1 auto;min-width:60px;padding:7px 8px;border-radius:9px;cursor:pointer;',
    '  border:1px solid rgba(150,190,235,.18);background:rgba(255,255,255,.03);color:#B7C2DE;',
    '  font:inherit;font-size:12px;transition:' + T_BTN + '}',
    '.flins-seg button:hover{border-color:rgba(var(--flins-accent-rgb),.5);color:#E6EBFB}',
    '.flins-seg button[aria-pressed="true"]{border-color:rgba(var(--flins-accent-rgb),.85);color:#04121A;',
    '  background:linear-gradient(135deg,rgba(var(--flins-accent-rgb),1),#4C6FE8);font-weight:600;',
    '  box-shadow:0 0 16px -5px rgba(var(--flins-accent-rgb),.9)}',

    '.flins-panel input[type=text],.flins-panel input[type=url]{width:100%;padding:7px 9px;border-radius:9px;',
    '  border:1px solid rgba(150,190,235,.2);background:rgba(4,7,20,.72);color:#E6EBFB;font:inherit;font-size:12px}',
    '.flins-panel input[type=text]:focus,.flins-panel input[type=url]:focus{outline:none;',
    '  border-color:rgba(var(--flins-accent-rgb),.8);box-shadow:0 0 0 1px rgba(var(--flins-accent-rgb),.35)}',
    '.flins-row{display:flex;gap:6px;align-items:center}',
    '.flins-row > *{min-width:0;flex:1}',
    '.flins-row button{flex:0 0 auto;padding:7px 10px;border-radius:9px;cursor:pointer;white-space:nowrap;',
    '  border:1px solid rgba(var(--flins-accent-rgb),.45);background:rgba(var(--flins-accent-rgb),.12);',
    '  color:#DCE6FB;font:inherit;font-size:12px;transition:' + T_BTN + '}',
    '.flins-row button:hover{background:rgba(var(--flins-accent-rgb),.24)}',
    '.flins-drop{margin-top:7px;padding:14px 10px;border-radius:10px;text-align:center;cursor:pointer;',
    '  border:1px dashed rgba(150,190,235,.32);color:#8E9BBB;font-size:11.5px;transition:' + T_BTN + '}',
    '.flins-drop:hover,.flins-drop[data-over="1"]{border-color:rgba(var(--flins-accent-rgb),.8);',
    '  color:#DCE6FB;background:rgba(var(--flins-accent-rgb),.09)}',
    '.flins-panel input[type=range]{width:100%;accent-color:rgb(var(--flins-accent-rgb));height:18px;margin:2px 0 10px}',
    '.flins-panel select{width:100%;padding:6px 8px;border-radius:9px;font:inherit;font-size:12px;',
    '  border:1px solid rgba(150,190,235,.2);background:rgba(4,7,20,.72);color:#E6EBFB}',
    '.flins-panel select option{background:#0B0F2B;color:#E6EBFB}',
    '.flins-sw{display:flex;align-items:center;justify-content:space-between;padding:5px 0;font-size:12.5px;',
    '  color:#C3CEE8;cursor:pointer}',
    '.flins-sw input{appearance:none;width:38px;height:21px;border-radius:99px;position:relative;cursor:pointer;margin:0;',
    '  background:rgba(255,255,255,.1);border:1px solid rgba(150,190,235,.2);',
    '  transition:background-color .18s ease,border-color .18s ease}',
    '.flins-sw input::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;',
    '  background:#8E9BBB;transition:left .18s ease,background-color .18s ease,box-shadow .18s ease}',
    '.flins-sw input:checked{background:rgba(var(--flins-accent-rgb),.35);border-color:rgba(var(--flins-accent-rgb),.7)}',
    '.flins-sw input:checked::after{left:19px;background:rgb(var(--flins-accent-rgb));',
    '  box-shadow:0 0 10px 1px rgba(var(--flins-accent-rgb),.8)}',
    '.flins-foot{display:flex;gap:8px;margin-top:12px}',
    '.flins-foot button{flex:1;padding:8px;border-radius:9px;cursor:pointer;font:inherit;font-size:12px;',
    '  border:1px solid rgba(150,190,235,.22);background:rgba(255,255,255,.03);color:#B7C2DE;transition:' + T_BTN + '}',
    '.flins-foot button:hover{border-color:rgba(255,120,130,.6);color:#FFB3BA}',
    '.flins-note{margin:9px 0 0;font-size:11px;line-height:1.6;color:rgba(142,155,187,.8)}',
    '.flins-hint{font-size:11.5px;color:#8E9BBB}',
    '.flins-swcolor{display:flex;gap:8px;align-items:center}',
    '.flins-swcolor input[type=color]{width:38px;height:30px;padding:0;border-radius:8px;cursor:pointer;flex:0 0 auto;',
    '  border:1px solid rgba(150,190,235,.25);background:transparent}',

    /* ── 浅色「霜晨」形态：面板和「小灯」按钮也必须跟着翻过去，
          否则白底页面上挂一个深夜色圆钮，非常割裂 ── */
    'html.flins-light .flins-fab{',
    '  background:radial-gradient(circle at 50% 42%,rgba(var(--flins-accent-rgb),.30),rgba(255,255,255,.97) 68%);',
    '  border-color:rgba(var(--flins-accent-rgb),.55);',
    '  box-shadow:0 10px 26px -16px rgba(28,48,92,.45),0 0 0 1px rgba(255,255,255,.9) inset}',
    'html.flins-light .flins-panel{',
    '  background:linear-gradient(180deg,rgba(255,255,255,.985),rgba(243,247,254,.99));',
    '  color:#16203C;border-color:rgba(var(--flins-accent-rgb),.35);',
    '  box-shadow:0 30px 70px -28px rgba(28,48,92,.42),0 0 0 1px rgba(255,255,255,.9) inset}',
    'html.flins-light .flins-panel h4{color:#101A33}',
    'html.flins-light .flins-panel .sub{color:#7C89A8}',
    'html.flins-light .flins-lab{color:#6B7899}',
    'html.flins-light .flins-hint{color:#7C89A8}',
    'html.flins-light .flins-sec{border-bottom-color:rgba(52,84,148,.14)}',
    'html.flins-light .flins-seg button{border-color:rgba(52,84,148,.20);background:rgba(20,40,90,.035);color:#4A5877}',
    'html.flins-light .flins-seg button:hover{border-color:rgba(var(--flins-accent-rgb),.6);color:#16203C}',
    'html.flins-light .flins-seg button[aria-pressed="true"]{color:#FFFFFF}',
    'html.flins-light .flins-panel input[type=text],',
    'html.flins-light .flins-panel input[type=url],',
    'html.flins-light .flins-panel select{background:#FFFFFF;border-color:rgba(52,84,148,.20);color:#16203C}',
    'html.flins-light .flins-panel select option{background:#FFFFFF;color:#16203C}',
    'html.flins-light .flins-panel input[type=range]{accent-color:rgb(var(--flins-accent-rgb))}',
    'html.flins-light .flins-sw{color:#3A4767}',
    'html.flins-light .flins-sw input{background:rgba(20,40,90,.12);border-color:rgba(52,84,148,.25)}',
    'html.flins-light .flins-drop{border-color:rgba(52,84,148,.30);color:#6B7899}',
    'html.flins-light .flins-drop:hover,html.flins-light .flins-drop[data-over="1"]{color:#16203C}',
    'html.flins-light .flins-row button{color:#16203C}',
    'html.flins-light .flins-foot button{border-color:rgba(52,84,148,.22);background:rgba(20,40,90,.035);color:#4A5877}',
    'html.flins-light .flins-note{color:#7C89A8}',
    'html.flins-light .flins-swcolor input[type=color]{border-color:rgba(52,84,148,.25)}',
    '@media (max-width:520px){.flins-panel{right:10px;left:10px;width:auto;bottom:74px}.flins-fab{right:14px;bottom:14px}}',
  ].join('\n');

  const EMBLEM_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true">'
    + '<path d="M52.4 6.4a8.8 8.8 0 1 0 6.3 10.6 7 7 0 1 1-6.3-10.6z" fill="#F0C070"/>'
    + '<path d="M24.2 15.6h11.6l-1.6-4.2H25.8z" fill="#C8CBD6"/>'
    + '<rect x="24.6" y="16.2" width="10.8" height="13.4" rx="1.8" fill="#0B0F2B" stroke="#C8CBD6" stroke-width="1.3"/>'
    + '<path d="M30 18.4c2.7 3.3 3.9 5.1 3.9 7.1a3.9 3.9 0 0 1-7.8 0c0-2 1.2-3.8 3.9-7.1z" fill="#60E0F0"/>'
    + '<path d="M25.6 30.4h8.8l2.4 19.0H23.2z" fill="#101640"/>'
    + '<rect x="22.2" y="49.6" width="15.6" height="3.6" rx="1" fill="#C8CBD6" opacity=".85"/></svg>';

  let panelEl = null;
  let fabEl = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => { if (c) node.appendChild(c); });
    return node;
  }

  function seg(current, options, onPick) {
    return el('div', { class: 'flins-seg' }, options.map((o) => el('button', {
      type: 'button',
      'aria-pressed': String(current === o.value),
      text: o.label,
      onclick: () => onPick(o.value),
    })));
  }

  function slider(label, value, min, max, step, fmt, onInput) {
    const out = el('b', { text: fmt(value) });
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
      oninput: (e) => { out.textContent = fmt(Number(e.target.value)); onInput(Number(e.target.value)); },
    });
    return el('div', {}, [el('div', { class: 'flins-lab' }, [el('span', { text: label }), out]), input]);
  }

  function toggle(label, value, onChange) {
    const input = el('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
    input.checked = !!value;
    return el('label', { class: 'flins-sw' }, [el('span', { text: label }), input]);
  }

  function select(options, current, onChange) {
    return el('select', {
      onchange: (e) => onChange(e.target.value),
      html: options.map(([v, t]) => '<option value="' + v + '"' + (current === v ? ' selected' : '') + '>' + t + '</option>').join(''),
    });
  }

  function rebuildPanel() {
    if (!panelEl) return;
    const accent = currentAccent();
    panelEl.innerHTML = '';

    panelEl.appendChild(el('h4', { text: '菲林斯 · 终夜长茔' }));
    panelEl.appendChild(el('p', { class: 'sub', text: '『诡灯陌影』 夜巡主题设置' }));

    // 形态
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '外观形态' })]),
      seg(cfg.mode, [
        { value: 'auto', label: '跟随系统' },
        { value: 'dark', label: '夜巡（深）' },
        { value: 'light', label: '霜晨（浅）' },
      ], (v) => { cfg.mode = v; commit(); }),
    ]));

    // 版式
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '版式' })]),
      seg(cfg.layout, [
        { value: 'flins', label: '菲林斯版式' },
        { value: 'classic', label: '洛谷原版' },
      ], (v) => { cfg.layout = v; commit(); }),
      el('p', { class: 'flins-note', text: '菲林斯版式：背景插画透出、厚玻璃卡片、全站大圆角、居中阅读栏。随时可以切回原版。' }),
    ]));

    // 导航形态（只在菲林斯版式下有意义）
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '导航形态' })]),
      seg(cfg.navMode, [
        { value: 'inline', label: '并入顶栏' },
        { value: 'stack', label: '双行融合' },
        { value: 'side', label: '左侧竖栏' },
      ], (v) => { cfg.navMode = v; commit(); }),
      el('p', { class: 'flins-note', text: '并入顶栏：导航挤在顶栏同一行；双行融合：顶栏在上、导航在下拼成一整块；左侧竖栏：经典侧边栏面板。' }),
    ]));

    // 强调色
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '强调色' }), el('b', { text: accent.name })]),
      seg(cfg.accent === 'custom' ? '__custom' : cfg.accent, [
        { value: 'ghost', label: '幽焰青' },
        { value: 'volt', label: '雷紫' },
        { value: 'lamp', label: '提灯金' },
        { value: 'luogu', label: '洛谷蓝' },
      ], (v) => { cfg.accent = v; commit(); }),
      el('div', { class: 'flins-swcolor', style: 'margin-top:8px' }, [
        el('input', {
          type: 'color', value: cfg.accent === 'custom' ? cfg.accentCustom : accent.hex,
          oninput: (e) => { cfg.accent = 'custom'; cfg.accentCustom = e.target.value; commit(); },
        }),
        el('span', { class: 'flins-hint', text: '自定义取色（拖动即生效）' }),
      ]),
    ]));

    // 背景图片
    const urlInput = el('input', {
      type: 'url', placeholder: 'https://… 图片直链', value: cfg.bgUrl,
      onchange: (e) => { cfg.bgUrl = e.target.value.trim(); cfg.bgSource = 'url'; commit(); },
    });
    const fileInput = el('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      onchange: (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) readImageFile(f, 2560, (url) => { cfg.bgUpload = url; cfg.bgSource = 'upload'; commit(); });
      },
    });
    const drop = el('div', {
      class: 'flins-drop',
      text: '拖入图片，或点击选择本地文件（自动压到 2560px 内）',
      onclick: () => fileInput.click(),
      ondragover: (e) => { e.preventDefault(); drop.dataset.over = '1'; },
      ondragleave: () => { drop.dataset.over = '0'; },
      ondrop: (e) => {
        e.preventDefault(); drop.dataset.over = '0';
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f && /^image\//.test(f.type)) {
          readImageFile(f, 2560, (url) => { cfg.bgUpload = url; cfg.bgSource = 'upload'; commit(); });
        }
      },
    });

    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '背景图片' })]),
      seg(cfg.bgSource, [
        { value: 'auto', label: '跟随形态' },
        { value: 'builtin-dark', label: '内置夜巡' },
        { value: 'builtin-light', label: '内置霜晨' },
        { value: 'url', label: '图片链接' },
        { value: 'upload', label: '本地上传' },
        { value: 'none', label: '无背景' },
      ], (v) => { cfg.bgSource = v; commit(); }),
      el('div', { style: 'margin-top:8px' }, [urlInput]),
      drop, fileInput,
      slider('模糊', cfg.bgBlur, 0, 24, 1, (v) => v + 'px', (v) => { cfg.bgBlur = v; commit(); }),
      slider('明暗', cfg.bgBrightness, 0.3, 1.8, 0.02, (v) => v.toFixed(2) + '×', (v) => { cfg.bgBrightness = v; commit(); }),
      slider('缩放', cfg.bgZoom, 1, 1.8, 0.01, (v) => v.toFixed(2) + '×', (v) => { cfg.bgZoom = v; commit(); }),
      slider('蒙版浓度', cfg.bgScrim, 0, 0.95, 0.01, (v) => Math.round(v * 100) + '%', (v) => { cfg.bgScrim = v; commit(); }),
      el('div', { class: 'flins-lab', style: 'margin-top:9px' }, [el('span', { text: '对齐 / 平铺' })]),
      el('div', { class: 'flins-row' }, [
        select([['center center', '居中'], ['center top', '顶部'], ['center bottom', '底部'],
                ['left center', '靠左'], ['right center', '靠右']], cfg.bgPosition,
               (v) => { cfg.bgPosition = v; commit(); }),
        select([['cover', '铺满'], ['contain', '完整显示'], ['auto', '原始平铺']], cfg.bgSize,
               (v) => { cfg.bgSize = v; cfg.bgRepeat = v === 'auto' ? 'repeat' : 'no-repeat'; commit(); }),
      ]),
    ]));

    // 效果开关
    const extra = [
      toggle('毛玻璃（卡片 / 顶栏）', glassEffective(), (v) => { cfg.glass = v; commit(); }),
      toggle('装饰元素（徽记 / 极光 / 铭牌）', cfg.ornaments, (v) => { cfg.ornaments = v; commit(); }),
      toggle('动效（灯火呼吸 / 选中脉动）', cfg.motion, (v) => { cfg.motion = v; commit(); }),
      toggle('自动修补遗漏的白块', cfg.autoPatch, (v) => { cfg.autoPatch = v; commit(); if (v) schedulePatch(); }),
    ];
    if (luoguBlurDisabled() && cfg.glass) {
      extra.push(el('p', { class: 'flins-note', text: '洛谷已因性能原因关闭毛玻璃，本主题一并跟随。' }));
    }
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '效果' })]),
    ].concat(extra)));

    // 标题小灯：三种内置样式，或者换成自己的图片
    let lampFile;
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '标题小灯' })]),
      seg(cfg.ornamentStyle, [
        { value: 'lamp', label: '灯芯' },
        { value: 'moon', label: '新月' },
        { value: 'none', label: '无' },
      ], (v) => { cfg.ornamentStyle = v; commit(); }),
      el('p', { class: 'flins-note', text: '标题左边那个发光的小标记。浅色形态下会自动换成深青（深色形态用亮青）。' }),
      // 换成自己的图片
      lampFile = el('input', {
        type: 'file', accept: 'image/*', style: 'display:none',
        onchange: (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) readImageFile(f, 128, (dataUrl) => { cfg.lampImage = dataUrl; commit(); });
        },
      }),
      el('div', { class: 'flins-row', style: 'margin-top:8px' }, [
        el('input', {
          type: 'url', placeholder: '自定义小灯图片直链', value: cfg.lampImage && cfg.lampImage.slice(0, 5) !== 'data:' ? cfg.lampImage : '',
          onchange: (e) => { cfg.lampImage = e.target.value.trim(); commit(); },
        }),
        el('button', { type: 'button', text: '选图', onclick: () => lampFile.click() }),
        el('button', { type: 'button', text: '恢复', onclick: () => { cfg.lampImage = ''; commit(); } }),
      ]),
      lampFile,
    ]));

    // 右下角那颗「小灯」按钮的外观
    const fabFile = el('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      onchange: (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) readImageFile(f, 256, (dataUrl) => { cfg.fabImage = dataUrl; commit(); });
      },
    });
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '右下角小灯' })]),
      el('div', { class: 'flins-row' }, [
        el('input', {
          type: 'url', placeholder: '自定义图标图片直链', value: cfg.fabImage && cfg.fabImage.slice(0, 5) !== 'data:' ? cfg.fabImage : '',
          onchange: (e) => { cfg.fabImage = e.target.value.trim(); commit(); },
        }),
        el('button', { type: 'button', text: '选图', onclick: () => fabFile.click() }),
      ]),
      el('div', { class: 'flins-row', style: 'margin-top:6px' }, [
        el('button', { type: 'button', text: '恢复默认（誓灯徽记）', onclick: () => { cfg.fabImage = ''; commit(); } }),
      ]),
      fabFile,
      el('p', { class: 'flins-note', text: '内置的誓灯徽记是程序化画的；嫌丑的话，换一张你自己的图（建议正方形、透明背景）。' }),
    ]));

    // 顶栏左上角那颗誓灯徽记（很多人第一眼就看见它）
    const emblemFile = el('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      onchange: (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) readImageFile(f, 128, (dataUrl) => { cfg.emblemImage = dataUrl; commit(); });
      },
    });
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '左上角誓灯徽记' })]),
      el('div', { class: 'flins-row' }, [
        el('input', {
          type: 'url', placeholder: '自定义徽记图片直链（留空 = 内置）', value: cfg.emblemImage && cfg.emblemImage.slice(0, 5) !== 'data:' ? cfg.emblemImage : '',
          onchange: (e) => { cfg.emblemImage = e.target.value.trim(); commit(); },
        }),
        el('button', { type: 'button', text: '选图', onclick: () => emblemFile.click() }),
        el('button', { type: 'button', text: '恢复', onclick: () => { cfg.emblemImage = ''; commit(); } }),
      ]),
      emblemFile,
      el('p', { class: 'flins-note', text: '就是「洛谷」标志右边那颗小灯。换图后建议用正方形、透明背景的 PNG。' }),
    ]));

    // 白块诊断：把我看不到的页面（登录后的犇犇、私信、翻页条等）里的漏网之鱼报出来
    const report = el('p', { class: 'flins-note', text: '深色形态下如果还有发白的区域，点一下上面那个开关旁边的按钮。' });
    const scanBtn = el('button', {
      type: 'button', text: '扫描并修复',
      onclick: () => {
        const res = runPatches();
        const white = res.white || { fixed: 0, sample: [] };
        const dim = res.dim || [];
        const tails = res.tails || [];
        const parts = [];
        if (white.fixed) parts.push('白块 ' + white.fixed);
        if (dim.length) parts.push('过暗文字 ' + dim.length);
        if (tails.length) parts.push('气泡尖角 ' + tails.length);
        if (!parts.length) {
          report.textContent = '没发现问题。若你仍看到异常，把它截图发我。';
          return;
        }
        report.textContent = '已修复 ' + parts.join(' / ') + ' 处（明细已复制到剪贴板）';
        try {
          navigator.clipboard.writeText('[菲林斯主题] 修复报告\n'
            + '白块 ' + white.fixed + ':\n' + white.sample.join('\n')
            + '\n过暗文字 ' + dim.length + ':\n' + dim.join('\n')
            + '\n气泡尖角 ' + tails.length + ':\n' + tails.join('\n'));
        } catch (e) { /* 忽略 */ }
      },
    });
    panelEl.appendChild(el('div', { class: 'flins-sec' }, [
      el('div', { class: 'flins-lab' }, [el('span', { text: '漏网的白块' })]),
      el('div', { class: 'flins-row' }, [scanBtn]),
      report,
    ]));

    // 底部
    panelEl.appendChild(el('div', { class: 'flins-foot' }, [
      el('button', { type: 'button', text: '恢复默认', onclick: () => { cfg = Object.assign({}, DEFAULTS); commit(); } }),
      el('button', {
        type: 'button', text: '复制配置',
        onclick: (e) => {
          const btn = e.currentTarget;
          try { navigator.clipboard.writeText(JSON.stringify(cfg)); } catch (err) { /* 忽略 */ }
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = '复制配置'; }, 1400);
        },
      }),
    ]));

    panelEl.appendChild(el('p', {
      class: 'flins-note',
      text: '本地上传的图片只存在你自己的浏览器里，不会上传到任何服务器。',
    }));
  }

  function readImageFile(file, maxSide, onDone) {
    const max = maxSide || 2560;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        // 图标类保留透明通道，用 PNG；大背景用 JPEG 省体积
        const url = max <= 512 ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
        onDone(url);
      };
      img.onerror = () => onDone(String(reader.result));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function commit() {
    store.write(cfg);
    apply();
    rebuildPanel();
  }

  function mountPanel() {
    if (fabEl || !document.body) return;
    addStyle(PANEL_CSS, PANEL_STYLE_ID);

    panelEl = el('div', {
      class: 'flins-panel', role: 'dialog', 'aria-label': '菲林斯主题设置', 'data-open': '0',
    });
    fabEl = el('button', {
      class: 'flins-fab', type: 'button', title: '菲林斯主题设置（点击展开）',
      'aria-label': '菲林斯主题设置', 'data-open': '0',
      html: EMBLEM_ICON,
      onclick: () => {
        const open = fabEl.dataset.open === '1' ? '0' : '1';
        fabEl.dataset.open = open;
        panelEl.dataset.open = open;
      },
    });

    document.body.appendChild(panelEl);
    document.body.appendChild(fabEl);
    if (fabEl) fabEl.dataset.img = cfg.fabImage ? '1' : '0';
    rebuildPanel();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fabEl && fabEl.dataset.open === '1') {
        fabEl.dataset.open = '0';
        panelEl.dataset.open = '0';
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // 启动
  //
  // 每一步都单独 try：document-start 阶段 DOM 是空的，任何一个环节抛异常
  // 都不应该把后面的步骤一起带走。
  // ────────────────────────────────────────────────────────────────────────
  function boot() {
    const steps = [
      // 1. 主题样式表（根元素还没出现时会自动等）
      () => addStyle(THEME_CSS, STYLE_ID),

      // 2. 挂形态 / 配色变量到 <html>
      () => whenRoot(apply),

      // 3. 设置面板（要等 <body>）
      () => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
        } else {
          mountPanel();
        }
      },

      // 4. 自愈：样式表或面板被清掉就补回来；顺带修补漏网的白块
      () => {
        const ensure = () => {
          if (!document.getElementById(STYLE_ID)) addStyle(THEME_CSS, STYLE_ID);
          if (!document.documentElement) return;
          const cl = document.documentElement.classList;
          if (!cl.contains('flins-dark') && !cl.contains('flins-light')) apply();
          if (!document.body) return;
          if (!fabEl || !document.body.contains(fabEl)) {
            fabEl = null; panelEl = null;
            mountPanel();
          }
          schedulePatch();
        };
        try { new MutationObserver(ensure).observe(document, { childList: true, subtree: true }); } catch (e) { /* 忽略 */ }
        setInterval(ensure, 2500);
        // 补丁的时机很要紧。洛谷有些内容是异步来的（私信的联系人列表、
        // 犇犇的消息流），只压几个固定时刻很容易刚好错过，表现为
        // 「同一块浅色这次修掉了、下次还在」。所以前 30 秒密集重扫，
        // 之后转稀疏，长期挂着也不费什么。
        let fast = 0;
        const fastTimer = setInterval(() => {
          schedulePatch();
          fast += 1;
          if (fast >= 25) clearInterval(fastTimer);   // 25 × 1.2s ≈ 30 秒
        }, 1200);
        setInterval(schedulePatch, 6000);
      },

      // 5. 跟随系统深浅
      () => {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if (cfg.mode === 'auto') apply();
        });
      },

      // 6. 油猴菜单（非油猴环境没有这个 API，跳过即可）
      () => {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('打开菲林斯主题设置', () => {
          const f = document.querySelector('.flins-fab');
          if (f) f.click();
        });
        GM_registerMenuCommand('切换深色 / 浅色', () => {
          cfg.mode = resolveMode() === 'dark' ? 'light' : 'dark';
          commit();
        });
        GM_registerMenuCommand('恢复默认设置', () => {
          cfg = Object.assign({}, DEFAULTS);
          commit();
        });
      },
    ];

    for (const step of steps) {
      try { step(); } catch (e) {
        try { console.warn('[flins-theme] 初始化步骤失败：', e); } catch (e2) { /* ignore */ }
      }
    }
  }

  boot();
})();

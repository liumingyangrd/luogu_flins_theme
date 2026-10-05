// 从洛谷真实页面快照中，抽出「class → data-v-* 作用域属性」映射。
// 洛谷前端用 Vue scoped CSS，选择器形如 .top-bar[data-v-6449c5ae]；
// 离线预览必须带上同样的属性，否则组件样式整片失效。
//
// 用法：node tools/extract-vue-attrs.mjs <dump.html> [more.html ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法：node tools/extract-vue-attrs.mjs <dump.html> ...');
  process.exit(1);
}

/** class 组合 → data-v-* 属性集合 */
const map = new Map();

for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const tagRe = /<([a-zA-Z][-a-zA-Z0-9]*)((?:\s+[^<>]*?)?)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2] || '';
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1];
    if (!cls) continue;
    const vue = [...attrs.matchAll(/\b(data-v-[0-9a-f]+(?:-s)?)(?:="[^"]*")?/g)].map((x) => x[1]);
    if (!vue.length) continue;
    for (const single of cls.trim().split(/\s+/)) {
      const key = single;
      if (!map.has(key)) map.set(key, new Set());
      vue.forEach((v) => map.get(key).add(v));
    }
  }
}

const out = {};
for (const [k, v] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  out[k] = [...v].sort().join(' ');
}

const dest = join(ROOT, 'preview', 'vue-attrs.json');
writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
console.log(`✓ ${dest}  (${Object.keys(out).length} 个 class)`);

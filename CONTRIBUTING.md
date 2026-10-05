# 参与贡献

先谢谢愿意搭把手。这套主题是一个人写出来的，缺的页面覆盖、漏网的白块、文档错字都欢迎补。

## 先读这两份

- [`README.md`](README.md) —— 装法、特性、已知限制
- [`tools/live-check.mjs`](tools/live-check.mjs) —— 真站验证脚本（跑法写在 README 的「本地开发」）

## 报 Bug / 提需求

请带上这些信息，不然很难复现：

1. **页面完整 URL**（例如 `https://www.luogu.com.cn/problem/P1001`）
2. **深浅形态**（夜巡 / 霜晨）和**强调色**
3. **安装方式**（油猴 / 扩展 / Stylus / 官方主题）
4. **版本号**：油猴脚本头部的 `@version`，或 `dist/flins-extension/manifest.json` 的 `version`
5. **浏览器与版本**
6. **截图**（白块、错位类问题必须带）
7. 控制台报错，或 `node tools/live-check.mjs <url>` 的诊断输出
   （重点看 `window.onerror` 那个数组，正常情况下应该是空的）
8. 是不是**登录态**下出现的问题（私信、犇犇这类页面未登录看不到）

## 开发环境

- Node 18+
- Python 3（`Pillow`、`numpy`，只有重新生成背景图和令牌时才用）

## 构建与验证

```bash
node tools/build.mjs            # 构建 dist/ 与扩展，带语法自检，并自增版本号
python -m http.server 8231      # 离线预览：http://127.0.0.1:8231/preview/index.html
node tools/live-check.mjs https://www.luogu.com.cn/problem/P1001          # 真站诊断
FLINS_AUDIT=1 node tools/live-check.mjs https://www.luogu.com.cn/         # 白块审计（深色态）
FLINS_AT="1000,1075" node tools/live-check.mjs <url>                     # 按坐标查是谁上的色
```

**离线预览不算验证。** 预览页里 DOM 一早就建好了，而注入脚本跑在 `@run-at document-start`，
那时 `document.head` 还是 `null`。这个差别足以让脚本在真站上一行都不执行，
所以改完请务必跑一次 `live-check.mjs`。

## 改样式时的约定

- 优先用 `--flins-*` 变量（见 `src/flins.css` 开头「0. 主题参数」），别散落魔法数字。
- **不要写死 `data-v-*` 选择器** —— 那是洛谷的构建哈希，每次发版都会变。
- 不要引入外部字体 / CDN / 依赖。整套主题零依赖，油猴脚本必须能离线跑。
- 颜色尽量接到洛谷语义令牌（`--lcolor--primary` 等）上，这样强调色切换才能整体生效。
- 改 `src/flins.css` 后必须 `node tools/build.mjs`，`dist/` 是构建产物但也需要一起提交。
- **不要手改** `dist/` 和 `src/_tokens.generated.css`，它们都是生成的。

## PR 自查清单

- [ ] `node tools/build.mjs` 通过（它会校验产物语法与新鲜度）
- [ ] 深色态白块审计没有新增命中
- [ ] 浅色形态也正常（用 `FLINS_MODE=light` 跑一次）
- [ ] `git status --short` 干净，没有误加 `.login` / `.realtest` / `*.log` / 探针输出
- [ ] 版本号交给 `build.mjs` 自动递增，没有手改

## 不要提交这些

```bash
git status --short                     # 提交前一定看一眼
git ls-files | Select-String "\.login|\.realtest|\.exttest|\.shots|\.log$"
```

本仓库的 `.gitignore` 已经把这些挡掉了，其中包括：

- `.login/`（1.66 GB，含浏览器 `Login Data` 与 168 MB 单文件）
- `.realtest/`（含真实 `Cookies`）、`.exttest/`、`.audit/`、`.shots/`
- 各种 `*.log`、`.probe*.txt` 探针输出
- `.cmd` 本地小工具与内部笔记

一旦把登录态推进公开仓库，等于把账号交出去，而且 Git 历史里删不干净 —— 只能改密码 +
重写历史。所以**提交前先看一眼 `git status`**。

## 文本编码（Windows 用户注意）

**不要用 PowerShell 的 `Get-Content` / `Set-Content` 改源码。** Windows PowerShell 5.1
默认按 ANSI（GBK）读，`Set-Content -Encoding utf8` 又会写出带 BOM 的 UTF-8，
往返一次所有中文注释和 `content: "…"` 就全乱了。请用编辑器，或在脚本里显式指定
`Get-Content -Encoding utf8` / `Set-Content -NoNewline`。

## 提交信息

```
feat: 题目列表选中态跟随强调色
fix: 深色下评测记录页翻页条白底白字
style: 卡片圆角统一到 --flins-radius
docs: 补 Stylus 装法说明
tools: live-check 支持按坐标取证
```

## 授权

提交 PR 即表示你同意你的贡献以本仓库的 [MIT 许可证](LICENSE) 发布；
若涉及新的插画 / 图标，请确认它是你自己生成或有权分发的。

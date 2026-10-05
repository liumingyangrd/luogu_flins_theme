# 官方主题格式 · 菲林斯「终夜长茔」

洛谷有一套**官方的主题系统**：页面里会带一段

```html
<script id="luogu-theme" type="application/json">{"id":1,"lNavi":{…},"lBody":{…},"dNavi":{…},"dBody":{…}}</script>
```

前端读这段 JSON，翻译成一组 `--theme-*` CSS 变量（`--theme-navi-back`、`--theme-body-image`、
`--theme-card-background`…）再由样式表消费。所以**只要给出同样格式的 JSON，就是一套合法的洛谷主题**，
不需要装任何脚本。

> 字段含义是从洛谷线上产物 `columba/loader.*.js` 里读出来的，不是猜的；见本仓库 README
> 的「依据」一节。主题编辑器本身要登录才能打开，所以下面的操作步骤写的是**字段对照**而不是
> 逐步截图。

---

## 两个预设

| 文件 | 形态 | 适用 |
|---|---|---|
| `flins-night.json` | 夜巡（深） | 深靛蓝夜色 + 灯塔 + 金色新月 |
| `flins-frost.json` | 霜晨（浅） | 冷白霜晨，白天不刺眼 |

---

## 怎么用

### 1. 先把背景图传到洛谷图床

打开 <https://www.luogu.com.cn/image>，上传：

- 深色用 `dist/assets/flins-bg-dark.jpg`（1920×1080，也可用 `flins-bg-dark-2x.jpg`）
- 浅色用 `dist/assets/flins-bg-light.jpg`

传完会得到一个 `https://cdn.luogu.com.cn/upload/image_hosting/…` 直链。

### 2. 把直链填进 JSON

把两个文件里 `image` 字段的占位串换成你的直链（一共 4 处：`lBody.image` 和 `dBody.image`）。

### 3. 在洛谷建一套自定义主题

打开 <https://www.luogu.com.cn/theme>（需登录）→ 新建 / 编辑自定义主题，
按下面的对照表把 JSON 的字段填进编辑器：

| JSON 字段 | 编辑器里的含义 | 夜巡取值 | 霜晨取值 |
|---|---|---|---|
| `lNavi.back` | 顶栏 / 侧栏背景色 | `#0b0f2b` | `#f7faff` |
| `lNavi.fore` | 顶栏 / 侧栏文字色 | `#e6ebfb` | `#16203c` |
| `lNavi.logo` | Logo 着色（留空＝不改） | `null` | `null` |
| `lBody.back` | 页面底色 | `#080b21` | `#eef3fc` |
| `lBody.image` | 背景图直链 | 你的直链 | 你的直链 |
| `lBody.blur` | 毛玻璃：`0` 关闭 / `1000` 强 / `1010` 弱 | `1000` | `1000` |
| `lBody.fade` | 顶部渐隐：`>0` 由上往下 / `<0` 反之 / `0` 关闭 | `1000` | `1000` |
| `lBody.midOpts.size` | 背景图填充：`cover` / `contain` / `12 30`（百分比） | `cover` | `cover` |
| `lBody.midOpts.position` | 背景图位置，`[x%, y%]` | `[50, 20]` | `[50, 15]` |
| `lBody.midOpts.repeat` | `no-repeat` / `repeat` / `repeat-x` / `repeat-y` | `no-repeat` | `no-repeat` |
| `lBody.color` | 渐变底色（字符串数组），和图片会叠加 | 不用 | 不用 |
| `dNavi.* / dBody.*` | 深色模式下的同一组字段 | 同浅色 | 同浅色 |

### 4. 想更省事？

官方这套只能改**背景图 + 顶栏/底色 + 毛玻璃**，改不了字体、圆角、卡片的冷光边、
侧栏那根幽焰灯芯等等。要那些效果，用油猴脚本 `dist/flins.user.js`——它把这些都做了，
而且背景图同样可以随时换（设置面板里支持内置 / 链接 / 本地上传）。

**两者可以叠加**：官方主题负责「底」，脚本负责「面」。

---

## 一些小提示

- `image` 里的 `{y}` `{m}` `{d}` `{w}` 会被替换成年 / 月 / 日 / 星期，可以用一张图做每日轮换。
- `blur` 为真值（非 0）时官方会给卡片上 `rgba(255,255,255,.75)` 左右的半透明白，
  所以**深色背景上卡片是白的、卡内文字是深的**——这是洛谷官方主题的既定行为，
  不是我们的配色失误。想要「深色卡片 + 浅色文字」，请用油猴脚本那套。
- 洛谷在低端机上会自动关闭毛玻璃，并把结果写进 `localStorage.themeBlurPreference`；
  本仓库的脚本会读取这个键并跟随，官方主题则会弹一条提示。

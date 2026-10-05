# -*- coding: utf-8 -*-
"""
洛谷 · 菲林斯主题 —— 设计令牌生成器

把一组「菲林斯」基准色展开成洛谷 Lentille 需要的两套变量格式：
    --lcolor--<name>-<n> : "R, G, B"   （配合 rgb(var(...)) 使用）
    --lfe-color--<name>-<n> : "#rrggbb"

色阶方向说明（重要）：
洛谷原始色阶 -1 最浅（当浅色底用）、-5 最深（当浅底上的文字用）。
深色主题里必须把这条阶反过来，否则深蓝文字会消失在深蓝背景上：
    -1 → 很深的染色底    -2 → 偏深的染色底    -3 → 本色（提亮）
    -4 → 亮色（可作深底文字）    -5 → 近白染色（可作深底文字）

输出到 stdout，粘贴进 src/flins.css 的令牌区块。
用法：python tools/make_tokens.py
"""

from __future__ import annotations


def hex2rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb2hex(c) -> str:
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)


def mix(a, b, t: float):
    """a、b 为 RGB 元组，t=0 取 a，t=1 取 b。"""
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def lighten(c, t: float):
    return mix(c, (255, 255, 255), t)


# 深色主题的「夜色底」，色阶向它混合
NIGHT = hex2rgb("#0B0F2B")

# 家族 -> 本色（-3）。取自洛谷原色并针对深色底提亮/调温。
FAMILIES: dict[str, str] = {
    # 冷色主轴
    "lapis":  "#5C86E8",   # 洛谷原有的深靛蓝，深色主题下提亮
    "blue":   "#4AA8E8",
    "cyan":   "#40CECE",
    # 语义色
    "green":  "#5ACC78",
    "lgreen": "#84BE64",
    "yellow": "#FADB14",
    "orange": "#F6A234",
    "gold":   "#FCC640",
    "purple": "#AC68EE",
    "pink":   "#FF6878",
    "red":    "#F6665A",
    # 中性
    "grey":   "#96A2C4",
}

# 语义令牌（不属于 -1..-5 色阶）
SEMANTIC: dict[str, str] = {
    "primary":     "@accent",
    "primary-bg":  "#102A3E",
    "link":        "#7EE8F4",
    "clicked":     "#9298F8",
    "disabled":    "#60688A",
    "background":  "#080B21",
    "success":     "#52D096",
    "warning":     "#E8B848",
    "error":       "#FF6E7A",
}


def ramp(solid_hex: str) -> list[tuple[int, int, int]]:
    """把本色展开成深色主题适用的 -1..-5 五档。"""
    s = hex2rgb(solid_hex)
    return [
        mix(NIGHT, s, 0.16),   # -1 很深的染色底
        mix(NIGHT, s, 0.34),   # -2 偏深的染色底
        lighten(s, 0.00),      # -3 本色
        lighten(s, 0.44),      # -4 亮色
        lighten(s, 0.80),      # -5 近白染色
    ]


def _to_css(out: list[str], indent: str = "  ") -> str:
    """把 [name, value] 列表输出成成对的 --lcolor / --lfe-color 声明。"""
    lines: list[str] = []
    for name, hx in out:
        r, g, b = hex2rgb(hx)
        lines.append(f"{indent}--lcolor--{name}: {r}, {g}, {b} !important;"
                     f" --lfe-color--{name}: {hx} !important;")
    return "\n".join(lines)


def build_ramps() -> list[tuple[str, str]]:
    res: list[tuple[str, str]] = []
    for fam, solid in FAMILIES.items():
        for i, c in enumerate(ramp(solid), start=1):
            res.append((f"{fam}-{i}", rgb2hex(c)))
    return res


def build_semantic(accent: str, accent_bg: str, table=None) -> list[tuple[str, str]]:
    table = table or SEMANTIC
    res: list[tuple[str, str]] = []
    for name, val in table.items():
        if val == "@accent":
            val = accent
        elif val == "@accent-bg":
            val = accent_bg
        res.append((name, val))
    return res


# 浅色「霜晨」的语义色：深色主题的深底/浅字在这里必须翻回去
SEMANTIC_LIGHT: dict[str, str] = {
    "primary":     "@accent",
    "primary-bg":  "@accent-bg",
    "link":        "#0B7C86",
    "clicked":     "#3C4BC4",
    "disabled":    "#BFBFBF",
    "background":  "#EFF3FB",
    "success":     "#2E9E63",
    "warning":     "#C08A12",
    "error":       "#D94A5C",
}


DEFAULT_ACCENT = "#60E0F0"
DEFAULT_ACCENT_BG = "#102A3E"

# 洛谷页内样式里另有一批「工具类」，形如
#   .lcolor--pink-3      { color: rgb(254, 76, 97); }
#   .lcolor-bg-pink-3    { background-color: rgb(254, 76, 97); }
# 它们把颜色【硬编码】写死，并不引用 --lcolor--*，所以光改令牌改不动它们。
# 这里统一重写成引用变量，整层工具类才会跟着主题走。
# 注意 .lcolor-var-* 不能动：那是组件自己的局部取色，是有意为之的。
UTILITY_FAMILIES = list(FAMILIES.keys()) + ["vip"]
SEMANTIC_NAMES = list(SEMANTIC.keys())


def build_utilities() -> list[str]:
    names: list[str] = []
    for fam in UTILITY_FAMILIES:
        if fam == "vip":
            names.append("vip")
            continue
        names.extend(f"{fam}-{i}" for i in range(1, 6))
    names.extend(SEMANTIC_NAMES)
    return names


def render_utilities(indent: str = "") -> str:
    lines: list[str] = []
    for name in build_utilities():
        # vip 不在 :root 令牌里，给个金色兜底
        fallback = ", 240, 192, 112" if name == "vip" else ""
        value = f"rgb(var(--lcolor--{name}{fallback}))"
        bg = f"rgb(var(--lcolor--{name}{fallback}))"
        lines.append(f"{indent}.lcolor--{name} {{ color: {value} !important; }}")
        lines.append(f"{indent}.lcolor-bg-{name} {{ background-color: {bg} !important; }}")
    return "\n".join(lines)


def render() -> str:
    L: list[str] = []
    a = L.append
    a("/* ══════════════════════════════════════════════════════════════")
    a("   洛谷 · 菲林斯主题 —— Lentille 设计令牌覆盖（深色「夜巡」）")
    a("   由 tools/make_tokens.py 生成，请勿手改；改色请改该脚本。")
    a("   !important 用于压过洛谷页内 <style> 的 :root 定义；")
    a("   元素自身的 .lcolor-var-* 声明仍可正常覆盖这些值。")
    a("   ══════════════════════════════════════════════════════════════ */")
    a("/* 用 html:not(.flins-light) 而不是 :root：浅色模式直接让这些")
    a("   深色色阶整体失效，回落到洛谷原值，避免逐个还原。 */")
    a("html:not(.flins-light) {")
    a(_to_css(build_ramps() + build_semantic(DEFAULT_ACCENT, DEFAULT_ACCENT_BG)))
    a("}")
    a("")
    a("/* ── 强调色预设：雷紫 ── */")
    a("html.flins-accent-volt {")
    a(_to_css(build_semantic("#9C8CFF", "#231B4A")))
    a("}")
    a("")
    a("/* ── 强调色预设：提灯金 ── */")
    a("html.flins-accent-lamp {")
    a(_to_css(build_semantic("#F0C070", "#3A2A10")))
    a("}")
    a("")
    a("/* ── 强调色预设：洛谷蓝 ── */")
    a("html.flins-accent-luogu {")
    a(_to_css(build_semantic("#3498DB", "#0E3A5C")))
    a("}")
    a("")
    a("/* ── 浅色「霜晨」：家族色阶沿用洛谷原值，只改语义色 ── */")
    a("html.flins-light {")
    a(_to_css(build_semantic("#0E8F98", "#DDF3F5", SEMANTIC_LIGHT)))
    a("}")
    a("")
    a("/* ══════════════════════════════════════════════════════════════")
    a("   工具类重写：洛谷把 .lcolor--X / .lcolor-bg-X 的颜色硬编码成")
    a("   rgb(...)，不引用变量，所以必须在这里改成引用 --lcolor--*，")
    a("   否则难度标签、状态色、页脚底色都不会跟随主题。")
    a("   ══════════════════════════════════════════════════════════════ */")
    a(render_utilities())
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    import os

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dest = os.path.join(here, "src", "_tokens.generated.css")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        f.write(render())
    print(f"wrote {dest} ({os.path.getsize(dest)} bytes)")

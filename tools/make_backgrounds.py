# -*- coding: utf-8 -*-
"""
洛谷 · 菲林斯主题 —— 背景图生成器

按角色视觉锚点程序化生成「终夜长茔 · 夜巡」场景：
  深靛蓝夜色 + 紫/青极光 + 金色新月 + 远海 + 灯塔（冷蓝灯火与光束）
  + 落雪 + 低对比雾带

设计锚点（来自官方立绘采样，见 README「配色来源」）：
  提灯 / 冷蓝火焰 / 金色新月 / 灯塔剪影 / 深靛蓝夜色

输出：
  assets/flins-bg-dark.jpg      深色主题（夜巡）
  assets/flins-bg-light.jpg     浅色主题（霜晨）
  assets/flins-bg-dark-2x.jpg   2560x1440

用法：
  python tools/make_backgrounds.py
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# --------------------------------------------------------------------------
# 「菲林斯」实测配色（自官方立绘像素采样推断，非官方 HEX）
# 使用配比：深靛蓝底 ≈70% / 冷蓝青光 ≈20% / 金 ≤10%
# --------------------------------------------------------------------------
P = {
    "night_900": (11, 15, 43),      # #0B0F2B
    "night_800": (16, 16, 64),      # #101040
    "night_700": (32, 32, 96),      # #202060
    "night_600": (40, 48, 120),     # #283078

    "flame_500": (76, 111, 232),    # #4C6FE8
    "flame_400": (96, 160, 192),    # #60A0C0
    "flame_300": (144, 208, 224),   # #90D0E0
    "flame_200": (96, 224, 240),    # #60E0F0  冷蓝火焰 / 辉光

    "gold_600": (200, 144, 32),     # #C89020
    "gold_500": (224, 176, 32),     # #E0B020
    "gold_300": (240, 192, 112),    # #F0C070

    "ink": (7, 7, 12),
    "ink_soft": (24, 24, 40),
    "silver": (185, 188, 198),
    "silver_bright": (242, 244, 248),

    "violet": (72, 40, 128),        # #482880 极光 / 狂猎虚影
}


# --------------------------------------------------------------------------
# 基础场
# --------------------------------------------------------------------------
def _vgrad(w: int, h: int, stops) -> np.ndarray:
    ys = np.linspace(0.0, 1.0, h)
    pos = np.array([s[0] for s in stops], dtype=np.float64)
    cols = np.array([s[1] for s in stops], dtype=np.float64)
    out = np.empty((h, 3), dtype=np.float64)
    for c in range(3):
        out[:, c] = np.interp(ys, pos, cols[:, c])
    return np.repeat(out[:, None, :], w, axis=1)


def _radial(w: int, h: int, cx: float, cy: float, r: float, power: float = 2.0) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - cx * w) / (r * w)) ** 2 + ((yy - cy * h) / (r * w)) ** 2)
    return np.clip(1.0 - d, 0.0, 1.0) ** power


def _value_noise(w: int, h: int, cell: int, rng) -> np.ndarray:
    gw, gh = w // max(2, cell) + 3, h // max(2, cell) + 3
    g = rng.random((gh, gw))
    img = Image.fromarray((g * 255).astype(np.uint8), mode="L").resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float64) / 255.0


def _noise1d(w: int, cell: int, rng) -> np.ndarray:
    cell = max(2, cell)
    n = w // cell + 3
    g = rng.random(n)
    row = np.repeat(g[:, None], cell, axis=1).reshape(-1)[:w]
    if row.size < w:
        row = np.pad(row, (0, w - row.size), mode="edge")
    img = Image.fromarray((row * 255).astype(np.uint8)[None, :], mode="L")
    return np.asarray(img, dtype=np.float64).reshape(-1)[:w] / 255.0


def _fbm(w: int, h: int, rng, octaves: int = 5, base: int = 8) -> np.ndarray:
    total = np.zeros((h, w))
    amp, norm, cell = 1.0, 0.0, base
    for _ in range(octaves):
        total += amp * _value_noise(w, h, cell, rng)
        norm += amp
        amp *= 0.5
        cell = max(2, cell // 2)
    return total / norm


def _aurora(w: int, h: int, rng, color, y_center: float, thickness: float,
            tilt: float, strength: float, ray_cell: int = 9) -> np.ndarray:
    """极光帘幕：竖直射线 + 下缘锐利、上缘羽化的带状包络。"""
    yy, xx = np.mgrid[0:h, 0:w]
    xn = xx / w
    yn = yy / h

    wob = (0.032 * np.sin(xn * 4.1 + tilt)
           + 0.017 * np.sin(xn * 9.3 + tilt * 2.3)
           + 0.008 * np.sin(xn * 20.0 + tilt * 3.7))
    rel = (yn - (y_center + wob)) / thickness
    env = np.where(rel > 0.0, np.exp(-(rel * 1.30) ** 2), np.exp(-(rel * 0.82) ** 2))

    rays = 0.28 + 0.72 * (_noise1d(w, ray_cell, rng) ** 1.3)
    rays = rays * (0.72 + 0.28 * _noise1d(w, max(2, ray_cell // 3), rng))
    vertical = 0.66 + 0.34 * np.sin(yn * 24.0 + tilt * 5.0)
    fade = np.clip(xn * 2.2, 0, 1) * np.clip((1.0 - xn) * 2.6, 0, 1)

    a = env * rays[None, :] * vertical * fade * strength
    return a[:, :, None] * np.array(color, dtype=np.float64)[None, None, :]


def _composite(base: np.ndarray, mask: np.ndarray, color) -> np.ndarray:
    m = mask[:, :, None]
    return base * (1 - m) + m * np.array(color, dtype=np.float64)[None, None, :]


def _ridge(w: int, h: int, rng, base_y: float, amp: float, octaves: int = 5, phase: float = 0.0) -> np.ndarray:
    xn = np.linspace(0, 1, w)
    profile = np.zeros(w)
    for k in range(1, octaves + 1):
        profile += (rng.random() * 2 - 1) * (amp / (k ** 1.15)) * np.sin(xn * k * math.pi * 1.8 + phase * k + rng.random() * 6.283)
    profile += (rng.random() * 2 - 1) * amp * 0.4
    line = base_y * h + profile
    yy = np.mgrid[0:h, 0:w][0]
    return np.clip((yy - line[None, :]) / 1.4 + 0.5, 0.0, 1.0)


def _snow(w: int, h: int, rng, count: int, ymax: float = 0.92) -> np.ndarray:
    """落雪：大小不一、越靠下越稀的白色小点。"""
    layer = np.zeros((h, w), dtype=np.float64)
    xs = rng.integers(0, w, count)
    ys = (rng.random(count) ** 1.25 * ymax * h).astype(int)
    mag = rng.random(count) ** 1.6
    for x, y, m in zip(xs, ys, mag):
        layer[y, x] = max(layer[y, x], 0.20 + 0.80 * m)
    img = Image.fromarray((np.clip(layer, 0, 1) * 255).astype(np.uint8), "L")
    return np.asarray(img.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float64) / 255.0


def _crescent(w: int, h: int, cx: float, cy: float, r: float, offset: float, softness: float) -> np.ndarray:
    """金色新月：大圆减去偏移的小圆。"""
    yy, xx = np.mgrid[0:h, 0:w]
    R = r * w
    dx = (xx - cx * w) / R
    dy = (yy - cy * h) / R
    outer = np.clip(1.0 - np.sqrt(dx ** 2 + dy ** 2), 0, 1)

    ox = cx * w + offset * R
    oy = cy * h - offset * R * 0.35
    dxi = (xx - ox) / (R * 0.94)
    dyi = (yy - oy) / (R * 0.94)
    inner = np.clip(1.0 - np.sqrt(dxi ** 2 + dyi ** 2), 0, 1)

    ring = np.clip(outer * 6.0, 0, 1) - np.clip(inner * 6.0, 0, 1)
    ring = np.clip(ring, 0, 1)
    if softness > 0:
        img = Image.fromarray((ring * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(softness))
        ring = np.asarray(img, dtype=np.float64) / 255.0
    return ring


# --------------------------------------------------------------------------
# 灯塔 + 小岛（左侧远景）
# --------------------------------------------------------------------------
def _lighthouse_scene(w: int, h: int, rng) -> tuple[np.ndarray, np.ndarray, tuple[float, float]]:
    """返回 (结构遮罩, 灯火辉光, 灯室中心归一化坐标)。"""
    S = 2
    W, H = w * S, h * S
    struct = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(struct)

    bx = 0.205 * w          # 灯塔中轴
    base_y = 0.822 * h      # 岛面
    island_w = 0.30 * w
    tower_h = 0.300 * h

    # 小岛：锯齿状岩体剪影（比椭圆自然）
    pts = [(bx - island_w / 2, base_y + 0.040 * h)]
    n = 22
    for i in range(n + 1):
        t = i / n
        x = bx - island_w / 2 + island_w * t
        # 两端下沉、中间隆起
        prof = math.sin(t * math.pi) ** 0.7
        jitter = (rng.random() - 0.5) * 0.020 * h * prof
        y = base_y - prof * 0.020 * h + jitter
        pts.append((x, y))
    pts.append((bx + island_w / 2, base_y + 0.040 * h))
    d.polygon([(x * S, y * S) for x, y in pts], fill=255)
    # 岛上低矮灌木
    for _ in range(18):
        rx = bx + (rng.random() - 0.5) * island_w * 0.82
        ry = base_y - 0.008 * h - rng.random() * 0.014 * h
        rr = (0.005 + rng.random() * 0.013) * h
        d.ellipse([(rx - rr) * S, (ry - rr * 0.7) * S, (rx + rr) * S, (ry + rr * 0.8) * S], fill=255)

    # 塔身（上窄下宽的塔）
    top_y = base_y - tower_h
    bw = 0.030 * w
    tw = 0.016 * w
    d.polygon([((bx - bw) * S, base_y * S), ((bx + bw) * S, base_y * S),
               ((bx + tw) * S, top_y * S), ((bx - tw) * S, top_y * S)], fill=255)
    # 塔身分节
    for i in range(1, 6):
        yy = base_y - tower_h * i / 6
        k = 1 - 0.45 * (i / 6)
        d.rectangle([(bx - bw * k - 0.0012 * w) * S, (yy - 0.0016 * h) * S,
                     (bx + bw * k + 0.0012 * w) * S, (yy + 0.0016 * h) * S], fill=255)
    # 观景台
    gy = top_y + 0.007 * h
    d.rectangle([(bx - tw * 1.8) * S, gy * S, (bx + tw * 1.8) * S, (gy + 0.007 * h) * S], fill=255)
    # 灯室
    ly0 = gy - 0.030 * h
    d.rectangle([(bx - tw * 1.15) * S, ly0 * S, (bx + tw * 1.15) * S, gy * S], fill=255)
    # 塔顶
    d.polygon([((bx - tw * 1.5) * S, ly0 * S), ((bx + tw * 1.5) * S, ly0 * S),
               (bx * S, (ly0 - 0.022 * h) * S)], fill=255)

    # 墓园：几块低矮的墓碑（克制使用，仅作为剪影语言）
    for i in range(7):
        mx = bx - island_w * 0.44 + i * island_w * 0.147
        mh = (0.010 + rng.random() * 0.009) * h
        mw = mh * 0.48
        d.rectangle([((mx - mw) * S), ((base_y - mh) * S), ((mx + mw) * S), (base_y * S)], fill=255)
        d.ellipse([((mx - mw) * S), ((base_y - mh - mw) * S), ((mx + mw) * S), ((base_y - mh + mw) * S)], fill=255)

    struct = np.asarray(struct.resize((w, h), Image.LANCZOS), dtype=np.float64) / 255.0
    struct = np.asarray(Image.fromarray((struct * 255).astype(np.uint8), "L")
                        .filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float64) / 255.0

    # 灯室辉光（冷蓝火焰）
    lamp = (bx / w, (ly0 + 0.015 * h) / h)
    glow = _radial(w, h, lamp[0], lamp[1], 0.055, 2.0) * 1.0
    glow += _radial(w, h, lamp[0], lamp[1], 0.20, 3.0) * 0.45
    return struct, glow, lamp


def _beam(w: int, h: int, origin: tuple[float, float], angle_deg: float,
          spread_deg: float, length: float, strength: float) -> np.ndarray:
    """灯塔光束：一个细长的加色扇形。"""
    yy, xx = np.mgrid[0:h, 0:w]
    dx = xx - origin[0] * w
    dy = yy - origin[1] * h
    dist = np.sqrt(dx ** 2 + dy ** 2) / (length * w)
    ang = np.degrees(np.arctan2(dy, dx))
    da = np.abs(((ang - angle_deg + 180) % 360) - 180)
    fan = np.clip(1.0 - da / spread_deg, 0, 1) ** 1.8
    falloff = np.clip(1.0 - dist, 0, 1) ** 2.2
    return fan * falloff * strength


# --------------------------------------------------------------------------
# 深色：夜巡
# --------------------------------------------------------------------------
def build_dark(w: int = 1920, h: int = 1080, seed: int = 20250930) -> Image.Image:
    rng = np.random.default_rng(seed)

    canvas = _vgrad(w, h, [
        (0.00, P["night_900"]),
        (0.26, P["night_800"]),
        (0.50, P["night_700"]),
        (0.68, (30, 36, 104)),
        (0.80, (46, 56, 132)),
        (0.86, (26, 30, 84)),
        (0.94, (16, 18, 56)),
        (1.00, (10, 12, 38)),
    ])

    # 星云
    neb = _fbm(w, h, rng, octaves=6, base=6)
    neb = np.clip((neb - 0.46) * 1.6, 0, 1) ** 1.6
    canvas += neb[:, :, None] * np.array([26, 24, 66], dtype=np.float64)[None, None, :]

    # 极光：紫为主，冷蓝为骨（呼应官方立绘的紫色极光带）
    canvas = canvas + _aurora(w, h, rng, P["violet"], 0.315, 0.115, 0.7, 0.42)
    canvas = canvas + _aurora(w, h, rng, P["flame_500"], 0.265, 0.080, 2.1, 0.36)
    canvas = canvas + _aurora(w, h, rng, P["flame_200"], 0.215, 0.048, 4.3, 0.26, ray_cell=6)

    # 金色新月（核心符号之一）
    ccx, ccy, cr = 0.775, 0.175, 0.030
    canvas += _radial(w, h, ccx, ccy, 0.30, 3.0)[:, :, None] * np.array([40, 34, 16], dtype=np.float64)[None, None, :]
    canvas += _radial(w, h, ccx, ccy, 0.115, 2.4)[:, :, None] * np.array([86, 66, 24], dtype=np.float64)[None, None, :]
    ring = _crescent(w, h, ccx, ccy, cr, 0.34, 1.6)
    canvas += ring[:, :, None] * np.array(P["gold_300"], dtype=np.float64)[None, None, :] * 1.25
    halo = _crescent(w, h, ccx, ccy, cr, 0.34, 16.0)
    canvas += halo[:, :, None] * np.array(P["gold_500"], dtype=np.float64)[None, None, :] * 0.60

    # 星野
    layer = np.zeros((h, w))
    xs = rng.integers(0, w, 900)
    ys = (rng.random(900) ** 1.6 * 0.66 * h).astype(int)
    mag = rng.random(900) ** 3.2
    for x, y, m in zip(xs, ys, mag):
        layer[y, x] = max(layer[y, x], 0.20 + 0.80 * m)
    simg = Image.fromarray((np.clip(layer, 0, 1) * 255).astype(np.uint8), "L")
    st = np.asarray(simg, dtype=np.float64) + 0.6 * np.asarray(simg.filter(ImageFilter.GaussianBlur(2.2)), dtype=np.float64)
    st = np.clip(st, 0, 255) / 255.0
    drop = np.clip(1.0 - _radial(w, h, ccx, ccy, 0.10, 1.4), 0, 1)
    canvas += (st * drop)[:, :, None] * np.array([216, 226, 255], dtype=np.float64)[None, None, :] * 1.35

    # 远海 + 海平线
    sea = _ridge(w, h, rng, 0.845, 5, octaves=3, phase=1.3)
    canvas = _composite(canvas, sea * 0.92, (18, 22, 68))
    sea_spec = np.clip(_fbm(w, h, rng, octaves=4, base=90) - 0.60, 0, 1) * 3.0
    canvas += (sea_spec * sea)[:, :, None] * np.array([70, 96, 168], dtype=np.float64)[None, None, :]

    # 灯塔小岛
    struct, lamp_glow, lamp = _lighthouse_scene(w, h, rng)
    canvas = _composite(canvas, struct, (9, 11, 30))
    canvas = canvas * (1 - struct * 0.35)[:, :, None] + (struct * 0.35)[:, :, None] * canvas

    # 光束（两束，一强一弱）
    canvas += _beam(w, h, lamp, -22, 5.5, 0.62, 0.55)[:, :, None] * np.array(P["flame_200"], dtype=np.float64)[None, None, :]
    canvas += _beam(w, h, lamp, -22, 12.0, 0.42, 0.22)[:, :, None] * np.array(P["flame_300"], dtype=np.float64)[None, None, :]
    canvas += _beam(w, h, lamp, 168, 6.0, 0.34, 0.30)[:, :, None] * np.array(P["flame_200"], dtype=np.float64)[None, None, :]

    # 灯室本体（冷蓝火焰）
    canvas += lamp_glow[:, :, None] * np.array(P["flame_200"], dtype=np.float64)[None, None, :] * 0.95
    canvas += _radial(w, h, lamp[0], lamp[1], 0.012, 0.7)[:, :, None] * np.array([232, 250, 255], dtype=np.float64)[None, None, :] * 0.95

    # 低空雾带
    yy, xx = np.mgrid[0:h, 0:w]
    mist = np.exp(-(((yy / h) - 0.845) / 0.030) ** 2) * (0.35 + 0.9 * _fbm(w, h, rng, octaves=4, base=40))
    canvas += np.clip(mist, 0, 1)[:, :, None] * np.array([80, 100, 164], dtype=np.float64)[None, None, :] * 0.34

    # 落雪
    snow = _snow(w, h, rng, 2600)
    canvas += snow[:, :, None] * np.array([224, 234, 255], dtype=np.float64)[None, None, :] * 0.85

    # 顶栏压暗 + 底部收暗 + 暗角
    yn = yy / h
    canvas *= (1.0 - 0.34 * np.clip(1.0 - yn / 0.20, 0, 1))[:, :, None]
    canvas *= (1.0 - 0.24 * np.clip((yn - 0.90) / 0.10, 0, 1))[:, :, None]
    canvas *= (1.0 - 0.32 * _radial(w, h, 0.5, 0.52, 1.02, 3.6))[:, :, None]

    canvas = np.clip(canvas, 0, 255)
    return Image.fromarray(canvas.astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.4))


# --------------------------------------------------------------------------
# 浅色：霜晨
# --------------------------------------------------------------------------
def build_light(w: int = 1920, h: int = 1080, seed: int = 1031) -> Image.Image:
    """只做减法的冷色洗底：亮度全程留在高位，不偏黄，可安全承载正文与卡片。"""
    rng = np.random.default_rng(seed)

    base = _vgrad(w, h, [
        (0.00, (232, 238, 253)),
        (0.20, (243, 247, 255)),
        (0.46, (238, 243, 254)),
        (0.68, (226, 233, 251)),
        (0.84, (214, 223, 246)),
        (1.00, (200, 212, 240)),
    ]).astype(np.float64)

    # 云絮（冷灰，按比例压暗）
    veil = np.clip((_fbm(w, h, rng, octaves=5, base=5) - 0.42) * 1.15, 0, 1)
    base -= veil[:, :, None] * np.array([13, 15, 21], dtype=np.float64)[None, None, :]

    # 霜纹：极淡的斜向极光余韵
    for yc, th, tilt, cell, amt in ((0.26, 0.30, 0.9, 26, 9.0), (0.60, 0.34, 3.1, 34, 7.0)):
        band = _aurora(w, h, rng, (255, 255, 255), yc, th, tilt, 1.0, ray_cell=cell)[:, :, 0] / 255.0
        base -= band[:, :, None] * np.array([amt, amt + 1, amt + 5], dtype=np.float64)[None, None, :]

    # 右下角一盏极淡的冷蓝灯火（呼应提灯）
    base -= (1.0 - _radial(w, h, 0.78, 0.80, 0.42, 2.0))[:, :, None] * np.array([7, 9, 16], dtype=np.float64)[None, None, :]

    # 远海与岛
    sea = _ridge(w, h, rng, 0.862, 5, octaves=3, phase=1.3)
    base = _composite(base, sea * 0.72, (206, 216, 238))
    mist = np.exp(-(((np.mgrid[0:h, 0:w][0] / h) - 0.868) / 0.028) ** 2) * (0.4 + 0.8 * _fbm(w, h, rng, octaves=4, base=40))
    base -= np.clip(mist, 0, 1)[:, :, None] * np.array([10, 11, 17], dtype=np.float64)[None, None, :]

    # 灯塔小岛（浅色版只留很淡的剪影）
    struct, _, lamp = _lighthouse_scene(w, h, rng)
    base = _composite(base, struct * 0.30, (150, 166, 204))
    base -= (1.0 - _radial(w, h, lamp[0], lamp[1], 0.16, 2.4))[:, :, None] * np.array([16, 10, 2], dtype=np.float64)[None, None, :]

    # 金色新月（浅色版更含蓄）
    ccx, ccy, cr = 0.79, 0.16, 0.024
    ring = _crescent(w, h, ccx, ccy, cr, 0.34, 1.4)
    halo = _crescent(w, h, ccx, ccy, cr, 0.34, 14.0)
    base -= (1.0 - np.clip(ring + halo * 0.8, 0, 1))[:, :, None] * np.array([26, 18, 2], dtype=np.float64)[None, None, :]

    # 上下边缘收暗，让卡片浮起
    yn = np.mgrid[0:h, 0:w][0] / h
    edge = np.clip(1.0 - yn / 0.15, 0, 1) * 0.9 + np.clip((yn - 0.87) / 0.13, 0, 1)
    base -= np.clip(edge, 0, 1)[:, :, None] * np.array([24, 28, 38], dtype=np.float64)[None, None, :]

    base = np.clip(base, 0, 255)
    return Image.fromarray(base.astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.5))


def main() -> None:
    os.makedirs(ASSETS, exist_ok=True)
    jobs = [
        ("flins-bg-dark.jpg", build_dark(1920, 1080), 90),
        ("flins-bg-light.jpg", build_light(1920, 1080), 90),
        ("flins-bg-dark-2x.jpg", build_dark(2560, 1440, seed=4242), 88),
    ]
    for name, img, q in jobs:
        path = os.path.join(ASSETS, name)
        img.save(path, "JPEG", quality=q, optimize=True, progressive=True)
        print(f"{name}: {img.size[0]}x{img.size[1]}  {os.path.getsize(path) / 1024:.0f} KB")

    # 供油猴脚本内嵌的精简版（体积敏感：会被 base64 进用户脚本）
    web = [
        ("flins-bg-dark-web.jpg", build_dark(1600, 900, seed=20250930), 78),
        ("flins-bg-light-web.jpg", build_light(1600, 900, seed=1031), 78),
    ]
    for name, img, q in web:
        path = os.path.join(ASSETS, name)
        img.save(path, "JPEG", quality=q, optimize=True, progressive=True)
        print(f"{name}: {img.size[0]}x{img.size[1]}  {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()

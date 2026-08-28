#!/usr/bin/env python3
"""生成红黑榜的图标。

图案：正方形，右上朱红、左下墨黑，沿主对角线分开，中间一道纸黄接缝。
对应 app 里红榜（右上象限）和黑榜（左下象限）的位置。满出血，
所以圆角、圆形、squircle 怎么裁都不会切到内容，maskable 安全区天然满足。

这台机器没装 PIL，也没必要为了画两个三角形去装：
图案是纯几何的，逐像素算 + 4 倍超采样抗锯齿，再自己写 PNG 就够了。

    python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

RED   = (0xC4, 0x3D, 0x2B)   # 朱红
INK   = (0x21, 0x1C, 0x16)   # 墨黑
PAPER = (0xEF, 0xE7, 0xD4)   # 纸黄，接缝用

SEAM_RATIO = 14 / 512        # 接缝宽度占边长的比例，跟设计稿一致
SS = 4                       # 超采样倍数

OUT = Path(__file__).resolve().parent.parent / "icons"
SIZES = {
    "icon-512.png": 512,
    "icon-192.png": 192,
    "apple-touch-icon.png": 180,
    "icon-32.png": 32,
}


def sample(x, y, n, half_seam):
    """(x, y) 在 n×n 画布上该是什么颜色。

    主对角线是 y = x。到它的垂直距离是 |y - x| / √2，
    落在接缝里就是纸黄；线下方（y > x）是黑榜，上方是红榜。
    """
    d = y - x
    if abs(d) <= half_seam:
        return PAPER
    return INK if d > 0 else RED


def render(size):
    """返回 size×size 的 RGB 像素行，SS 倍超采样后取平均做抗锯齿。"""
    n = size * SS
    half_seam = (SEAM_RATIO * n) / 2 * (2 ** 0.5)   # 垂直宽度换成 |y-x| 的阈值
    inv = 1.0 / (SS * SS)

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            for sy in range(SS):
                y = py * SS + sy + 0.5
                for sx in range(SS):
                    x = px * SS + sx + 0.5
                    c = sample(x, y, n, half_seam)
                    r += c[0]; g += c[1]; b += c[2]
            row += bytes((round(r * inv), round(g * inv), round(b * inv)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    """最小 PNG 编码器：RGB、8 位、每行 filter 0。"""
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#c43d2b"/>
  <path d="M0 0 L0 512 L512 512 Z" fill="#211c16"/>
  <path d="M0 0 L512 512" stroke="#efe7d4" stroke-width="14"/>
</svg>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in SIZES.items():
        write_png(OUT / name, render(size), size)
        print(f"{name}  {size}×{size}")
    (OUT / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    print("favicon.svg")


if __name__ == "__main__":
    main()

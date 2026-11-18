"""Нарезка листа гостей по пояс (сетка CxR) в WebP.

python3 scripts/art/guests.py <лист> <out_dir> <имя1,...> [cols] [rows] [height]
В каждой ячейке ищется линия «стойки» (длинная тёмная горизонталь) — обрезаем по ней,
фон (белый) — в прозрачность по замкнутому контуру, все гости — к одной высоте.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 3
rows = int(sys.argv[5]) if len(sys.argv) > 5 else 4
H_OUT = int(sys.argv[6]) if len(sys.argv) > 6 else 300

im = Image.open(src).convert('RGB')
arr = np.asarray(im).astype(np.int16)
H, W = arr.shape[:2]
bg = np.median(np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]]), axis=0)
ink = ~np.all(np.abs(arr - bg) <= 22, axis=2)
dark = arr.sum(axis=2) < 300

def find_lines(x0, x1):
    """Линии стойки в колонке: тонкая длинная тёмная горизонталь, под ней почти пусто."""
    d = dark[:, x0:x1]
    run = d.sum(axis=1)
    w = x1 - x0
    ys = [y for y in range(H - 10) if run[y] > w * 0.25 and run[y + 8] < w * 0.12]
    clusters = []
    for y in ys:
        if clusters and y - clusters[-1][-1] <= 4:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    cands = [min(c) for c in clusters]
    step = H / rows
    out = []
    for r in range(rows):
        exp = step * (r + 1) - step * 0.02
        near = [y for y in cands if abs(y - exp) < step * 0.2]
        out.append(min(near, key=lambda y: abs(y - exp)) if near else round(step * (r + 1)) - 1)
    return out


k = 0
lines = {}
for r in range(rows):
    for c in range(cols):
        if k >= len(names):
            break
        name = names[k]; k += 1
        x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
        if c not in lines:
            lines[c] = find_lines(x0, x1)
        y1 = lines[c][r] - 4
        y0 = lines[c][r - 1] + 12 if r else 0
        cut = y1 - y0
        cell = ink[y0:y0 + cut, x0:x1].copy()
        m = ndimage.binary_closing(cell, iterations=3, border_value=0)
        # контур открыт снизу (обрезан по стойке): закрываем нижний край перед заливкой
        m[-1, :] = m[-1, :] | ndimage.binary_dilation(m[-2, :], iterations=2)
        m = ndimage.binary_fill_holes(m)
        lab, n = ndimage.label(m)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == (np.argmax(sizes) + 1)
        # хвост линии стойки, прилипший снизу: широкие тёмные ряды у нижнего края
        dk = dark[y0:y0 + cut, x0:x1]
        for _ in range(14):
            yb = np.where(m.any(axis=1))[0].max()
            if (dk[yb] & m[yb]).sum() > m.any(axis=0).sum() * 0.5:
                m[yb] = False
            else:
                break
        ys, xs = np.where(m)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgb = np.asarray(im)[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
        a = (m[by0:by1, bx0:bx1] * 255).astype(np.uint8)
        a = np.asarray(Image.fromarray(a).filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(0.6)))
        rgba = np.dstack([rgb, a])
        sprite = Image.fromarray(rgba, 'RGBA')
        w = round(sprite.width * H_OUT / sprite.height)
        sprite = sprite.resize((w, H_OUT), Image.LANCZOS)
        sprite.save(f'{out}/{name}.webp', 'WEBP', quality=86, method=6)
        print(name, sprite.size, 'cut', cut)

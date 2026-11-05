"""Нарезка листа на предметы: ряды и колонки — по пустым полосам, маска — замкнутый контур с залитыми дырами.

python3 scripts/art/objs.py <лист> <out_dir> <имя1,...> [scale]
Белые предметы не просвечивают: всё, что внутри контура, считается предметом.
Имя «-» пропускает предмет.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3
im = Image.open(src).convert('RGB')
arr = np.asarray(im).astype(np.int16)
bg = np.median(np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]]), axis=0)
ink = ~np.all(np.abs(arr - bg) <= 22, axis=2)
ink = ndimage.binary_opening(ink, iterations=1)  # убрать шум фона


def bands(busy, gap, minlen):
    out, start, last = [], None, None
    for i, b in enumerate(busy):
        if b:
            if start is None:
                start = i
            elif i - last > gap:
                out.append((start, last + 1)); start = i
            last = i
    if start is not None:
        out.append((start, last + 1))
    return [b for b in out if b[1] - b[0] >= minlen]


import os
GRID = os.environ.get('GRID')  # «3x4»: ровная сетка колонки×ряды, когда предметы стоят слишком плотно
rows = bands(ink.sum(axis=1) > max(2, ink.shape[1] * 0.004), 12, 30)  # строже: фон с шумом склеивал ряды
print('rows', rows)
if GRID:
    gc, gr = map(int, GRID.split('x'))
    H, W = ink.shape
    rows = [(round(r * H / gr), round((r + 1) * H / gr)) for r in range(gr)]
k = 0
for (y0, y1) in rows:
    cols = bands(ink[y0:y1].sum(axis=0) > 1, 40, 20)
    if GRID:
        cols = [(round(c * W / gc), round((c + 1) * W / gc)) for c in range(gc)]
    for (x0, x1) in cols:
        if k >= len(names):
            break
        name = names[k]; k += 1
        if name == '-':
            continue
        cell = ink[y0:y1, x0:x1]
        m = ndimage.binary_closing(cell, iterations=3, border_value=0)
        m = ndimage.binary_fill_holes(m)
        lab, n = ndimage.label(m)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(60, sizes.max() * 0.004)]
        fg = np.isin(lab, keep)
        ys, xs = np.where(fg)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
        piece = im.crop((x0, y0, x1, y1)).convert('RGBA')
        piece.putalpha(alpha)
        piece = piece.crop((bx0, by0, bx1, by1))
        piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
        piece.save(f'{out}/{name}.webp', 'WEBP', quality=84, method=6)
        print(name, piece.size, 'h:w %.2f' % (piece.height / piece.width))

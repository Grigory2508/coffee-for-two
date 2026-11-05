"""Лист чёрных силуэтов → маски значков логотипа (белое на прозрачном, квадрат 256 px) + приёмка числами.

python3 scripts/art/logo_masks.py <лист> <out_dir> <имя1,...> [pad]
Ряды и колонки — по пустым полосам. Имя «-» пропускает ячейку.
Приёмка (печатается по каждому значку):
  gray  — доля серых пикселей среди нарисованного (должно быть < 0.12: силуэт одноцветный)
  fill  — доля залитой площади в квадрате значка (0.15–0.60)
  thin  — доля силуэта в штрихах тоньше 8/256 (≈1.5 px на 48) (< 0.12)
  off   — смещение центра масс от центра квадрата в долях стороны (< 0.15: асимметричные предметы центрируются по рамке)
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
pad = float(sys.argv[4]) if len(sys.argv) > 4 else 0.08
im = Image.open(src).convert('L')
a = np.asarray(im).astype(np.float32)
ink = a < 200


def bands(busy, gap, minlen):
    res, start, last = [], None, None
    for i, b in enumerate(busy):
        if b:
            if start is None:
                start = i
            elif i - last > gap:
                res.append((start, last + 1)); start = i
            last = i
    if start is not None:
        res.append((start, last + 1))
    return [b for b in res if b[1] - b[0] >= minlen]


clean = ndimage.binary_opening(ink, iterations=1)
rows = bands(clean.sum(axis=1) > 2, 25, 30)
import os
GRID = os.environ.get('GRID')  # «4x4»: ровная сетка, когда соседние значки почти касаются
if GRID:
    gc, gr = map(int, GRID.split('x'))
    rows = [(round(r * a.shape[0] / gr), round((r + 1) * a.shape[0] / gr)) for r in range(gr)]
print('rows', len(rows))
k, bad = 0, []
for (y0, y1) in rows:
    cols = bands(clean[y0:y1].sum(axis=0) > 1, 25, 20)
    if GRID:
        cols = [(round(c * a.shape[1] / gc), round((c + 1) * a.shape[1] / gc)) for c in range(gc)]
    for (x0, x1) in cols:
        if k >= len(names):
            break
        name = names[k]; k += 1
        if name == '-':
            continue
        cell = a[y0:y1, x0:x1]
        drawn = cell < 200
        inkv = float(np.percentile(cell[drawn], 10))  # цвет силуэта (бывает тёмно-серым)
        bgv = float(np.percentile(cell, 95))
        gray = float(((cell > inkv + 45) & (cell < bgv - 45)).sum() / max(1, drawn.sum()))
        # маска с мягким краем: 0 на фоне, 1 на силуэте
        m = np.clip((bgv - 25 - cell) / max(1, bgv - 50 - inkv), 0, 1)
        ys, xs = np.where(drawn)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        m = m[by0:by1, bx0:bx1]
        h, w = m.shape
        side = int(max(h, w) * (1 + 2 * pad))
        sq = np.zeros((side, side), np.float32)
        oy, ox = (side - h) // 2, (side - w) // 2
        sq[oy:oy + h, ox:ox + w] = m
        img = Image.fromarray((sq * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
        rgba = Image.new('RGBA', (256, 256), (255, 255, 255, 0))
        rgba.putalpha(img)
        rgba.save(f'{out}/{name}.webp', 'WEBP', quality=90, method=6)
        arr = np.asarray(img) / 255
        fill = float((arr > 0.5).mean())
        solid = arr > 0.5
        edt = ndimage.distance_transform_edt(solid)
        # доля силуэта в штрихах тоньше 8 px из 256 (≈1.5 px на 48): на маленьком логотипе они пропадут
        core = edt >= 4
        grown = ndimage.binary_dilation(core, iterations=4) & solid
        thin = 1 - grown.sum() / max(1, solid.sum())
        cy, cx = ndimage.center_of_mass(arr)
        off = float(np.hypot(cy - 128, cx - 128) / 256)
        ok = gray < 0.15 and 0.15 <= fill <= 0.60 and thin < 0.12 and off < 0.15
        if not ok:
            bad.append(name)
        print(f'{name:22} gray {gray:.2f}  fill {fill:.2f}  thin {thin:.2f}  off {off:.2f}  {"OK" if ok else "BAD"}')
print('cells', k, 'bad', bad)

"""Лист украшений с нарисованным кольцом → маски 256 px, центр = центр пустого кольца.

python3 scripts/art/logo_rings.py <лист> <out_dir> <имя1,...>
Сначала ищутся пустые кольца (дыры в рисунке), каждый пиксель рисунка отдаётся ближайшему кольцу —
так украшения не слипаются, даже если касаются друг друга, и не режутся ровной сеткой.
Печатает inner — долю стороны, которую должна занять форма логотипа, чтобы закрыть кольцо (→ LOGO_DECOS.inner).
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
g = np.asarray(Image.open(src).convert('L')).astype(np.float32)
H, W = g.shape
ink = g < 160
# центр кольца = центр самой большой пустой окружности рядом с центром ячейки сетки (кольцо может быть разомкнуто)
gc, gr = 4, 3
import os
if os.environ.get('GRID'):
    gc, gr = map(int, os.environ['GRID'].split('x'))
edt = ndimage.distance_transform_edt(~ink)
centers, radii = [], []
for r in range(gr):
    for c in range(gc):
        y0, y1 = int((r + 0.2) * H / gr), int((r + 0.8) * H / gr)
        x0, x1 = int((c + 0.2) * W / gc), int((c + 0.8) * W / gc)
        win = edt[y0:y1, x0:x1]
        iy, ix = np.unravel_index(np.argmax(win), win.shape)
        centers.append((y0 + iy, x0 + ix))
        radii.append(float(win[iy, ix]))
order = list(range(len(centers)))
yy, xx = np.mgrid[0:H, 0:W]
dist = np.stack([np.hypot(yy - cy, xx - cx) for cy, cx in centers])
owner = np.argmin(dist, axis=0)
alpha_all = np.clip((235 - g) / 175, 0, 1)
for name, i in zip(names, order):
    cy, cx = centers[i]
    mine = owner == i
    m = ink & mine
    ys, xs = np.where(m)
    half = float(np.max(np.hypot(ys - cy, xs - cx))) * 1.04
    side = int(2 * half)
    canvas = np.zeros((side, side), np.float32)
    a = alpha_all * mine
    y0, x0 = int(round(cy - half)), int(round(cx - half))
    sy0, sx0 = max(0, y0), max(0, x0)
    sy1, sx1 = min(H, y0 + side), min(W, x0 + side)
    canvas[sy0 - y0: sy1 - y0, sx0 - x0: sx1 - x0] = a[sy0:sy1, sx0:sx1]
    # мусор от соседей: мелкие отдельные куски у края холста
    lab, nl = ndimage.label(canvas > 0.3)
    if nl > 1:
        ar = ndimage.sum(canvas > 0.3, lab, range(1, nl + 1))
        cms = ndimage.center_of_mass(canvas > 0.3, lab, range(1, nl + 1))
        for j, (a_, (py, px)) in enumerate(zip(ar, cms)):
            if a_ < 0.015 * ar.sum() and np.hypot(py - half, px - half) > 0.72 * half:
                canvas[ndimage.binary_dilation(lab == j + 1, iterations=2)] = 0
    img = Image.fromarray((canvas * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
    rgba = Image.new('RGBA', (256, 256), (255, 255, 255, 0))
    rgba.putalpha(img)
    rgba.save(f'{out}/{name}.webp', 'WEBP', quality=90, method=6)
    # форма должна закрыть пустоту и половину обода кольца → +8 %
    inner = min(0.9, (radii[i] / half) * 1.08)
    print(f'{name:14} inner {inner:.2f}  centre ({cx:.0f},{cy:.0f})')

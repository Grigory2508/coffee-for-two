"""Нарезка листа, где ряды неравной высоты: ряды — по пустым горизонтальным полосам, колонки — по третям.

python3 scripts/art/rows.py <лист> <out_dir> <cols> <имя1,...> [scale]
Фон убирается заливкой от краёв ячейки (как в slice.py), масштаб общий для всех.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out, cols, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].split(',')
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 0.3
im = Image.open(src).convert('RGB')
arr = np.asarray(im).astype(np.int16)
bg = np.median(np.concatenate([arr[0], arr[-1]]), axis=0)
near = np.all(np.abs(arr - bg) <= 26, axis=2)
rows_busy = (~near).sum(axis=1) > 3
# ряды: непрерывные «занятые» полосы, слитые через короткие разрывы
bands, start = [], None
for y, b in enumerate(rows_busy):
    if b and start is None:
        start = y
    if not b and start is not None:
        bands.append([start, y]); start = None
if start is not None:
    bands.append([start, len(rows_busy)])
merged = []
for b in bands:
    if merged and b[0] - merged[-1][1] < 6:
        merged[-1][1] = b[1]
    else:
        merged.append(b)
merged = [b for b in merged if b[1] - b[0] > 30]
print('rows', merged)
w = arr.shape[1]
k = 0
for (y0, y1) in merged:
    for c in range(cols):
        if k >= len(names):
            break
        name = names[k]; k += 1
        x0, x1 = c * w // cols, (c + 1) * w // cols
        cell = near[y0:y1, x0:x1]
        lab, _ = ndimage.label(cell)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        fg = ~np.isin(lab, list(edge))
        ys, xs = np.where(fg)
        if not len(ys):
            continue
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
        piece = im.crop((x0, y0, x1, y1)).convert('RGBA')
        piece.putalpha(alpha)
        piece = piece.crop((bx0, by0, bx1, by1))
        piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
        piece.save(f'{out}/{name}.webp', 'WEBP', quality=84, method=6)
        print(name, piece.size)

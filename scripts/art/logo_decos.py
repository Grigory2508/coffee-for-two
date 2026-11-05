"""Лист украшений → маски (белое на прозрачном, 256 px). Ячейки — ровная сетка листа, центр ячейки = центр логотипа.

python3 scripts/art/logo_decos.py <лист> <out_dir> <cols>x<rows> <имя1,...>
Приёмка: hole — доля пустоты в центральном круге диаметром 50% (должна быть > 0.97: центр свободен под значок).
"""
import sys
import numpy as np
from PIL import Image

src, out, grid, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')
cols, rows = map(int, grid.split('x'))
a = np.asarray(Image.open(src).convert('L')).astype(np.float32)
H, W = a.shape
cw, ch = W / cols, H / rows
side = int(min(cw, ch))
yy, xx = np.mgrid[0:256, 0:256]
centre = (yy - 128) ** 2 + (xx - 128) ** 2 < 64 ** 2
k = 0
for r in range(rows):
    for c in range(cols):
        name = names[k]; k += 1
        if name == '-':
            continue
        cx, cy = int((c + 0.5) * cw), int((r + 0.5) * ch)
        cell = a[cy - side // 2: cy + side // 2, cx - side // 2: cx + side // 2]
        drawn = cell < 200
        inkv = float(np.percentile(cell[drawn], 10)) if drawn.any() else 0
        bgv = float(np.percentile(cell, 95))
        m = np.clip((bgv - 25 - cell) / max(1, bgv - 50 - inkv), 0, 1)
        img = Image.fromarray((m * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
        rgba = Image.new('RGBA', (256, 256), (255, 255, 255, 0))
        rgba.putalpha(img)
        rgba.save(f'{out}/{name}.webp', 'WEBP', quality=90, method=6)
        arr = np.asarray(img) / 255
        hole = 1 - float((arr[centre] > 0.5).mean())
        edge = float(np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]]).max())
        print(f'{name:16} hole {hole:.3f}  fill {(arr > 0.5).mean():.2f}  edge {edge:.2f}  {"OK" if hole > 0.97 and edge < 0.5 else "BAD"}')

"""Нарезка листа из Gemini по найденным объектам (а не по сетке: Gemini ставит предметы неровно).

python3 scripts/art/objects.py <лист> <out_dir> <имя1,имя2,...> [--rows N] [--scale S] [--icon SIZE] [--shadow]

1. Фон: заливка от краёв листа по цвету, близкому к фону (медиана рамки).
2. --shadow: светло-серые нейтральные пиксели, примыкающие к фону, тоже фон (тени-эллипсы под предметами).
3. Объекты — связные области (с небольшим расширением, чтобы детали не отрывались), самые крупные.
4. Порядок: по рядам (--rows), внутри ряда слева направо — как перечислены в промпте.
5. --scale S: общий масштаб для всех (сохраняет относительный размер предметов); --icon SIZE: квадрат SIZE.
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('names')
ap.add_argument('--rows', type=int, default=1)
ap.add_argument('--scale', type=float, default=0)
ap.add_argument('--icon', type=int, default=0)
ap.add_argument('--shadow', action='store_true')
ap.add_argument('--tol', type=int, default=24)
a = ap.parse_args()
names = a.names.split(',')

im = Image.open(a.src).convert('RGB')
arr = np.asarray(im).astype(np.int16)
h, w, _ = arr.shape
border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
bg = np.median(border, axis=0)

near = np.all(np.abs(arr - bg) <= a.tol, axis=2)
if a.shadow:
    mx, mn = arr.max(axis=2), arr.min(axis=2)
    lum = arr.mean(axis=2)
    shadow = (mx - mn <= 10) & (lum >= 150) & (lum <= bg.mean() + 4)
    near |= shadow

# фон = то, что «близко к фону» и связано с краем листа
lab, _ = ndimage.label(near)
edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
background = np.isin(lab, list(edge_labels))
fg = ~background

# объекты: связные области переднего плана, слегка расширенные
grown = ndimage.binary_dilation(fg, iterations=6)
olab, n = ndimage.label(grown)
sizes = ndimage.sum(fg, olab, range(1, n + 1))
order = np.argsort(sizes)[::-1][: len(names)]
boxes = []
for k in order:
    sl = ndimage.find_objects((olab == k + 1).astype(int))[0]
    boxes.append((sl[0].start, sl[1].start, sl[0].stop, sl[1].stop, k + 1))

# по рядам: делим по центру Y на N рядов, внутри ряда — по X
boxes.sort(key=lambda b: (b[0] + b[2]) / 2)
per = int(np.ceil(len(boxes) / a.rows))
ordered = []
for r in range(a.rows):
    row = boxes[r * per : (r + 1) * per]
    ordered += sorted(row, key=lambda b: b[1])

alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
rgba = im.convert('RGBA')
rgba.putalpha(alpha)

for name, (y0, x0, y1, x1, k) in zip(names, ordered):
    if not name:
        continue
    piece = rgba.crop((x0, y0, x1, y1))
    # только свой объект (соседние куски в рамке — прозрачные)
    own = Image.fromarray(((olab[y0:y1, x0:x1] == k) * 255).astype(np.uint8))
    pa = np.minimum(np.asarray(piece.split()[3]), np.asarray(own))
    piece.putalpha(Image.fromarray(pa))
    box = piece.split()[3].point(lambda v: 255 if v > 20 else 0).getbbox()
    piece = piece.crop(box)
    if a.icon:
        s = a.icon / max(piece.size)
        piece = piece.resize((max(1, round(piece.width * s)), max(1, round(piece.height * s))), Image.LANCZOS)
        canvas = Image.new('RGBA', (a.icon, a.icon), (0, 0, 0, 0))
        canvas.paste(piece, ((a.icon - piece.width) // 2, (a.icon - piece.height) // 2), piece)
        piece = canvas
    elif a.scale:
        piece = piece.resize((max(1, round(piece.width * a.scale)), max(1, round(piece.height * a.scale))), Image.LANCZOS)
    piece.save(f'{a.out}/{name}.webp', 'WEBP', quality=84, method=6)
    print(name, piece.size)

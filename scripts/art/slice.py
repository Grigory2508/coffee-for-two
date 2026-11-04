"""Нарезка листа иконок из Gemini: сетка → фон в прозрачность → обрезка → WebP.

python3 scripts/art/slice.py <лист> <cols> <rows> <out_dir> <имя1,имя2,...> [size]
Фон убирается заливкой от краёв ячейки: всё, что связано с краем и близко по цвету к фону.
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, cols, rows, out, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5].split(',')
size = int(sys.argv[6]) if len(sys.argv) > 6 else 128
TOL = 26  # допуск по цвету к фону

im = Image.open(src).convert('RGB')
cw, ch = im.width // cols, im.height // rows
for k, name in enumerate(names):
    if not name:
        continue
    c, r = k % cols, k // cols
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    w, h = cell.size
    px = cell.load()
    # фон — медиана по рамке ячейки
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(p[i] for p in border)[len(border) // 2] for i in range(3))
    near = lambda p: abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) <= TOL * 3 and max(abs(p[i] - bg[i]) for i in range(3)) <= TOL
    mask = Image.new('L', (w, h), 255)
    m = mask.load()
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    seen = set()
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if not near(px[x, y]):
            continue
        m[x, y] = 0
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # мягкий край, без ореола
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = cell.convert('RGBA')
    rgba.putalpha(mask)
    box = mask.point(lambda v: 255 if v > 20 else 0).getbbox()
    rgba = rgba.crop(box)
    s = size / max(rgba.size)
    rgba = rgba.resize((max(1, round(rgba.width * s)), max(1, round(rgba.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(rgba, ((size - rgba.width) // 2, (size - rgba.height) // 2), rgba)
    canvas.save(f'{out}/{name}.webp', 'WEBP', quality=82, method=6)
    print(name, box)

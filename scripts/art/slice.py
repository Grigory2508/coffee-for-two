"""Нарезка листа иконок из Gemini: сетка → фон в прозрачность → обрезка → WebP.

python3 scripts/art/slice.py <лист> <cols> <rows> <out_dir> <имя1,имя2,...> [size] [trim]
size — сторона квадратной иконки; с флагом trim — объект обрезается по себе, а масштаб общий для
всего листа (ширина ячейки → size px), чтобы предметы разных уровней сохраняли относительный размер.
Фон убирается заливкой от краёв ячейки: всё, что связано с краем и близко по цвету к фону.
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, cols, rows, out, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5].split(',')
size = int(sys.argv[6]) if len(sys.argv) > 6 else 128
trim = len(sys.argv) > 7 and sys.argv[7] == 'trim'
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
    # тень-эллипс под предметом (Gemini часто её рисует): нейтрально-серые пиксели у низа ячейки,
    # примыкающие к уже убранному фону, тоже в прозрачность
    if trim:
        neutral = lambda p: max(p) - min(p) <= 10 and 120 <= sum(p) / 3 <= 245
        q = deque((x, y) for y in range(int(h * 0.6), h) for x in range(w) if m[x, y] == 0)
        seen2 = set()
        while q:
            x, y = q.popleft()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if not (0 <= nx < w and int(h * 0.6) <= ny < h) or (nx, ny) in seen2 or m[nx, ny] == 0:
                    continue
                seen2.add((nx, ny))
                if neutral(px[nx, ny]):
                    m[nx, ny] = 0
                    q.append((nx, ny))
    # мягкий край, без ореола
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = cell.convert('RGBA')
    rgba.putalpha(mask)
    box = mask.point(lambda v: 255 if v > 20 else 0).getbbox()
    rgba = rgba.crop(box)
    if trim:
        k = size / cw
        rgba = rgba.resize((max(1, round(rgba.width * k)), max(1, round(rgba.height * k))), Image.LANCZOS)
        rgba.save(f'{out}/{name}.webp', 'WEBP', quality=84, method=6)
        print(name, rgba.size)
        continue
    s = size / max(rgba.size)
    rgba = rgba.resize((max(1, round(rgba.width * s)), max(1, round(rgba.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(rgba, ((size - rgba.width) // 2, (size - rgba.height) // 2), rgba)
    canvas.save(f'{out}/{name}.webp', 'WEBP', quality=82, method=6)
    print(name, box)

"""Пропорции спрайтов мебели → src/ui/artSizes.ts (чтобы считать ширину и тени без загрузки картинок)."""
import glob, json, os
from PIL import Image
out = {}
for f in sorted(glob.glob('public/art/home-*.webp')) + ['public/art/room-window.webp', 'public/art/room-counter.webp']:
    im = Image.open(f)
    out[os.path.basename(f)[:-5]] = round(im.width / im.height, 3)
src = '// Сгенерировано scripts/art/sizes.py: ширина / высота каждого спрайта квартиры.\nexport const ART_RATIO: Record<string, number> = ' + json.dumps(out, indent=2) + ';\n'
open('src/ui/artSizes.ts', 'w').write(src)
print(len(out))

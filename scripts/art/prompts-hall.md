# Гостевой зал: арт (по разбору визуала)

Чат Gemini «Flat 2D Game Sprite Sheet», модель Pro. Стиль — как мебель квартиры (`home-*`): плоский 2D, тонкий тёмно-коричневый контур, пастель, вид прямо, камера чуть сверху (видна верхняя грань), без своих теней и свечения.
Общие правила листа: белый фон, ячейка 4×3, предмет занимает ячейку с полями ≥10 %, три уровня одного предмета — в одном ряду (простой / уютный / дизайнерский), у края предмета нет белого и кремового (иначе съест вырезка).
Нарезка: `python3 scripts/art/objs.py <лист> public/art <имена> 0.6`, затем `python3 scripts/art/sizes.py`, `node scripts/hall.mjs`.
Пока файла нет, `src/ui/hall.tsx` показывает замену из квартиры (FALLBACK).

## Лист H1 (4 ряда × 3)
Имена: hall-window-0,hall-window-1,hall-window-2,hall-table-0,hall-table-1,hall-table-2,hall-light-0,hall-light-1,hall-light-2,hall-sconce-0,hall-sconce-1,hall-sconce-2

> NEW SHEET H1 for the CAFE HALL, same flat 2D cozy style, palette, line weight and camera as the furniture sheets (perfectly frontal, vertical edges vertical, thin top band visible from above, no side faces). White background, GRID 4 rows by 3 columns, columns SIMPLE / COZY / DESIGNER, generous gaps, no shadows, no glow, no text. ROW 1 WINDOWS, height 1.3 times width, opaque glass: plain white frame window with four panes and light blue glass; arched window with a round top and wooden frame; stained glass arched window with colorful geometric glass pieces. ROW 2 CAFE TABLE FOR TWO: small table seen from the front with the tabletop visible as a band, a sugar bowl and a small number stand on it, one chair on each side in side profile pushed close, whole set width 1.4 times its height (narrow, chairs tucked in): square table with bentwood chairs; round pedestal table with upholstered chairs; marble round table with velvet armchairs. ROW 3 CEILING LIGHTS including 30 cm of cord or chain from the top edge, about square: enamel dome pendant; three-arm brass chandelier; cluster of glass globe pendants. ROW 4 WALL SCONCES, height 1.4 times width: simple horn sconce; glass tulip sconce; brass double sconce. FORBIDDEN: insets, duplicates, extra objects, walls, floor, cast shadows, glow, text.

## Лист H2 (4 ряда × 3)
Имена: hall-pic-0,hall-pic-1,hall-pic-2,hall-poster-0,hall-poster-1,hall-poster-2,hall-shelf-0,hall-shelf-1,hall-shelf-2,hall-plant-0,hall-plant-1,hall-plant-2

> NEW SHEET H2 for the CAFE HALL, same style and camera, white background, GRID 4 rows by 3 columns, columns SIMPLE / COZY / DESIGNER, generous gaps, no shadows, no text or letters anywhere. ROW 1 PAINTINGS, landscape, width 1.3 times height: small still life with a cezve and cup in a thin frame; landscape in a wooden baguette frame; big painting in an ornate gold frame. ROW 2 POSTERS, portrait, height 1.4 times width, only pictograms, NO text: retro coffee poster with a big cup; jazz poster with a saxophone and notes shapes; neon style poster with a glowing cup outline. ROW 3 WALL SHELVES, floating, no legs, width twice the height: shelf with jars of coffee beans; shelf with cups and cezves; shelf with a coffee grinder and a small record player. ROW 4 FLOOR PLANTS, height 1.6 times width: snake plant in a metal bucket; monstera in a ceramic pot; olive tree in a wooden planter. FORBIDDEN: text, letters, numbers, insets, duplicates, walls, floor, shadows.

## Лист H3 (дверь и полы)
Имена: hall-door, затем полы режутся отдельно (горизонтальные полосы 1024×190 с плинтусом сверху, как room-floor-hall.webp) → hall-floor-hf-tile, hall-floor-hf-terrazzo, hall-floor-hf-herring

> NEW SHEET H3, same style and camera. Wide landscape image. LEFT: cafe entrance door, height 2.6 times width, wooden door with glass in the upper half, a small brass bell above, handle, a small empty hanging sign bracket with an EMPTY board (no text). RIGHT: three wide horizontal floor strips stacked with white gaps, each strip about 5.4 times wider than tall, seen slightly from above, with a thin wooden baseboard along the top edge of each strip: black and cream checkerboard tiles; terrazzo with small colorful chips; honey oak herringbone parquet. FORBIDDEN: text, shadows, furniture, insets.

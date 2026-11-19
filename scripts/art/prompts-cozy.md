# Новый стиль «тёплый мультяшный уют» (cozy): промпты

План работ: Claude Docs «План: переход „Нашего места“ на новый стиль». Макеты и пилот: артефакт «Наше место в стиле Good Coffee, Great Coffee».

## Где и чем генерировать
- Google Flow, модель **Nano Banana 2.1** (резерв — Nano Banana 2 Lite). **Pro не используем** — решение Гриши 18.11.
- Gemini — запасной вариант. Скачивание в полном размере идёт в `D:\Projects\Telegram Games\CoffeeForTwo\ART` (автоскачивание для gemini.google.com разрешено).
- Сырьё — в `ART\сырьё\<ID>-<имя>`, не удалять: следующие генерации берут его референсом.
- Стиль описываем словами. Скриншоты чужих игр референсом НЕ подкладываем.

## Эталон стиля
Принятый пилот: `ART\сырьё\G1-counter-guest.png` (стойка с гостьей) и `ART\сырьё\G2-hall-full.jpg` (зал, 2048×2048). Гриша 18.11: «Мне нравится». Один из них — референсом в каждую генерацию.

## STYLE (вставлять в начало каждого промпта)
> STYLE: hand-drawn 2D cartoon for a cozy mobile cafe game, exactly the style of the reference image: clean warm dark-brown outlines (never black) of even medium weight, flat soft pastel colors with one gentle cel shadow, small white highlight strokes, warm and inviting, no gradients, no textures, no photo-realism. Palette: cream, pistachio green, lavender, butter yellow, rose pink, honey wood.

Запреты в конце каждого промпта: `DO NOT: text, letters, numbers, logos, UI, watermarks, insets, duplicates, cast shadows on the background, characters from existing games.`

## Правила листов
- Белый фон, ровная сетка, между предметами широкие пустые полосы, предмет занимает ячейку с полями ≥ 10 %.
- Три уровня одного предмета — в одном ряду: SIMPLE / COZY / DESIGNER.
- Стены и стенные предметы — строго анфас. Столы и стулья — камера ~30° сверху: столешница — видимая плоскость глубиной ~¼ высоты стола, сиденья видны сверху.
- Нарезка: `python3 scripts/art/objs.py <лист> public/art <имена> 0.6` (`GRID=CxR` для ровной сетки), затем `python3 scripts/art/sizes.py`.

## C0 — пустая стойка (этап 2), 9:16
Референс: G1. Имя: `scene-counter`.
> Same scene, same camera and composition as the reference image, but WITHOUT the customer: the space behind the counter is empty, we see the pink striped wall, the shelf, the window and the plant behind. Keep the cash register on the left and the dessert display on the right. Remove the pale empty rectangle on the upper right wall, replace it with more wallpaper and a small framed picture. Lower 35 % is the plain wooden counter front. Portrait 9:16.

## C1 — гости по пояс (этап 2), 3:4, сетка 3 колонки × 4 ряда
Референс: G1. Имена по порядку: `guest-mark,guest-vera,guest-tolik,guest-g1,guest-g2,guest-g3,guest-g4,guest-g5,guest-g6,guest-g7,guest-g8,guest-g9`.
Все — взрослые, анфас, от пояса и выше, руки опущены вперёд (будто лежат на стойке), одинаковый масштаб головы, одинаковая линия пояса внизу ячейки, лёгкая улыбка, без эмоций-вариантов.
1. Марк — инди-разработчик лет 28: растрёпанные тёмные волосы, круглые очки, мятно-зелёное худи со шнурками, наклейка-джойстик на груди.
2. Вера Павловна — пожилая дама: серебристые волосы в пучке, жемчужные серьги, лавандовый кардиган с брошью-цветком.
3. Толик-курьер — парень лет 25: кепка козырьком назад, жёлто-зелёная курьерская куртка со светоотражающей полосой, пластырь на щеке.
4. Студентка: каштановое каре, большие наушники на шее, оверсайз-свитер горчичного цвета.
5. Офисный мужчина за 40: залысины, аккуратная борода, голубая рубашка, ослабленный галстук.
6. Художница: рыжие кудри, бордовый берет, комбинезон в каплях краски.
7. Бариста-конкурент: бритая голова, татуировка-кофейное зерно на предплечье, чёрный фартук.
8. Бизнес-леди: тёмная кожа, короткая стрижка, бежевый пиджак, золотые серьги-кольца.
9. Дедушка: седые усы, кепка-восьмиклинка, твидовый жилет.
10. Спортсменка: высокий хвост, розовая спортивная куртка, повязка на голову.
11. Мама с тотой: светлые волосы в косе, джинсовая куртка, сумка-тоут через плечо.
12. Хипстер: борода, шапка-бини, клетчатая рубашка, серьга в ухе.

> STYLE … SHEET of 12 cafe customers for a cozy mobile cafe game, all ORIGINAL characters, GRID 3 columns by 4 rows, white background with wide empty gaps. Every customer: an adult, facing the viewer, visible from the waist up, both forearms resting forward as if on a counter (no counter drawn), same head size, same waist line at the bottom of the cell, gentle smile, simple dot eyes, rosy cheeks, big round head as in the reference. (список 1–12 по-английски) DO NOT: …, counter, furniture, background, emotions variants.

## H1–H3 — зал (этап 3)
Состав и имена — как в `prompts-hall.md` (листы H1, H2, H3), текст промптов тот же, но:
- в начало — блок STYLE и референс G2-hall-full;
- вместо «same flat 2D cozy style … as the furniture sheets» — «exactly the style of the reference image»;
- палитра дерева — медовая, текстиль — роза, лаванда, фисташка, масло.
Стены и полы зала рисуются кодом (`HALL_WALLS`, `HALL_FLOORS`) — их цвета подтянуть под палитру в этапе 3.

## Принятие
Числами против эталона (G1/G2): цвет линий R−B > 0 (тёплый), светлота линий, доля пастели. Глазами — Гриша по скриншотам сцен.

## K1 — кот, 3 настроения (аудит 19.11), лист 3×1, белый фон
Референс: G2 (зал). Имена по порядку: `cat-happy,cat-calm,cat-sad`.
Нарезка: `GRID=3x1 python3 scripts/art/objs.py <лист> public/art cat-happy,cat-calm,cat-sad 0.6`.
> STYLE … A character sheet of ONE ginger tabby cat, the same cat three times in a row on a pure white background, same size, same camera (slight 3/4 view from the front, as if sitting on the floor of the room in the reference), full body, each pose in its own cell with wide empty margins: 1) HAPPY — sitting upright, eyes closed in a smile, tail curled up like a question mark, tiny pink blush; 2) CALM — loaf pose lying on the floor, eyes half open, relaxed; 3) SAD — sitting hunched, ears slightly down, big round eyes, tail wrapped around paws. Soft cream belly and paws, white chest patch, pink nose. Simple, cute, readable at 60 px. DO NOT: text, letters, numbers, floor, rug, background objects, cast shadows, collars with text, duplicates beyond the three poses.

## K2 — иконки интерфейса (аудит 19.11), лист 4×3, белый фон
Референс: G2 (зал). Имена по порядку: `ic-counter,ic-cafe,ic-home,ic-top,ic-team,ic-office,ic-barista,ic-manager,ic-gem,ic-ads-paper,ic-ads-social,ic-gift`.
Нарезка: `GRID=4x3 python3 scripts/art/objs.py <лист> public/art <имена> 0.6`.
> STYLE … An icon sheet for a cozy cafe game: 12 separate chunky icons in a strict 4×3 grid on a pure white background, each icon centered in its cell with wide empty margins, all icons the same visual size and weight, thick warm dark-brown outline, flat pastel fills, readable at 24 px. Row 1: a steaming coffee cup on a saucer; a tiny cafe storefront with a striped pink awning; a cozy little house with a heart window; a golden trophy cup with a star. Row 2: two overlapping speech bubbles (pink and lavender); a clipboard with a checklist; a barista apron with a coffee bean pocket; a notebook with a pencil and a little box. Row 3: a faceted lavender gem; a folded newspaper with a coffee cup picture; a smartphone with a heart on screen; a gift box with a butter-yellow ribbon. DO NOT: text, letters, numbers, logos, backgrounds, frames around icons, cast shadows, duplicates.

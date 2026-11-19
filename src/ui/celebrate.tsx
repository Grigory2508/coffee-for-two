// «Праздник» — короткая сочная реакция на важные покупки и открытия: значок, заголовок, конфетти.
import { CAFE_SLOTS, DECOR_BY_ID, DRINKS, HALL_BY_ID, type CafeSlot } from '../core/content';
import type { Command } from '../core/types';
import { L, t } from '../i18n';
import { art } from './icons';

export type Celebration = { icon?: string; img?: string; title: string; sub?: string };

/** Что праздновать после успешной команды (null — ничего). */
export function celebrationFor(cmd: Command): Celebration | null {
  switch (cmd.type) {
    case 'unlockDrink':
      return { icon: '☕', title: t('celebDrink'), sub: L(DRINKS[cmd.id].name) };
    case 'upgradeSlot':
      return { icon: CAFE_SLOTS[cmd.slot as CafeSlot].icon, title: t('celebUpgrade'), sub: L(CAFE_SLOTS[cmd.slot as CafeSlot].name) };
    case 'buyHall': {
      const it = HALL_BY_ID[cmd.id];
      return it ? { img: it.art, title: t('celebHall'), sub: L(it.name) } : null;
    }
    case 'buyDecor': {
      const it = DECOR_BY_ID[cmd.id];
      return it ? { icon: '🏠', title: t('celebHome'), sub: L(it.name) } : null;
    }
    case 'sendGift':
      return { icon: cmd.kind === 'gift' ? '🎁' : '💌', title: t('celebGift') };
    case 'adoptCat':
      return { icon: '🐈', title: t('celebCat'), sub: cmd.name };
    default:
      return null;
  }
}

const COLORS = ['#ffd873', '#8fc152', '#f3a6a0', '#cdbdf2', '#9cc59a', '#f6b26b'];

export function CelebrateView({ c, onClose }: { c: Celebration; onClose: () => void }) {
  return (
    <div class="celebrate" onClick={onClose} role="status">
      <div class="celebrate-card">
        <div class="celebrate-burst" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${70 + (i % 3) * 18}px`, background: COLORS[i % COLORS.length] } as Record<string, string>} />
          ))}
        </div>
        <div class="celebrate-icon">{c.img ? <img src={art(c.img)} alt="" draggable={false} /> : c.icon}</div>
        <div class="celebrate-title">{c.title}</div>
        {c.sub && <div class="celebrate-sub">{c.sub}</div>}
      </div>
    </div>
  );
}

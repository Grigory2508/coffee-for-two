import { tg } from './telegram';

export interface Identity {
  id: string;
  name: string;
  lang: string;
  source: 'telegram' | 'dev';
}

const DEV_NAMES = ['Аня', 'Боря', 'Вика', 'Гриша', 'Даша', 'Егор'];

/**
 * В Telegram — пользователь из initData. В браузере — тестовый игрок:
 * ?as=имя задаёт его явно, иначе у каждой вкладки свой игрок (sessionStorage),
 * поэтому две вкладки = два партнёра.
 */
export function getIdentity(): Identity {
  const u = tg.user();
  if (u) {
    return { id: `tg${u.id}`, name: u.first_name || u.username || 'Игрок', lang: u.language_code ?? 'ru', source: 'telegram' };
  }
  const q = new URLSearchParams(location.search);
  const as = q.get('as');
  if (as) return { id: `dev-${as.toLowerCase()}`, name: cap(as), lang: navigator.language || 'ru', source: 'dev' };
  let id = '';
  let name = '';
  try {
    id = sessionStorage.getItem('cft:devId') ?? '';
    name = sessionStorage.getItem('cft:devName') ?? '';
  } catch {
    /* ignore */
  }
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 8)}`;
    name = DEV_NAMES[Math.floor(Math.random() * DEV_NAMES.length)];
    try {
      sessionStorage.setItem('cft:devId', id);
      sessionStorage.setItem('cft:devName', name);
    } catch {
      /* ignore */
    }
  }
  return { id, name, lang: navigator.language || 'ru', source: 'dev' };
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

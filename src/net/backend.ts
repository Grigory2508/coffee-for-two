import { FAKE_CAFES, LOGO_COLORS, LOGO_ICONS, LOGO_SHAPES, type Logo, type Role } from '../core/content';
import { dayKey, weekId } from '../core/engine';
import { hashString, mulberry32 } from '../core/rng';
import { apply, createCafe, migrate, type ApplyResult } from '../core/engine';
import { peekOf, type CafePeek } from '../core/peek';
import { GameError, type CafeState, type Command } from '../core/types';
import { now } from '../platform/clock';
import { config } from '../platform/config';
import type { Identity } from '../platform/identity';
import { tg } from '../platform/telegram';

export interface Backend {
  readonly mode: 'local' | 'remote';
  load(): Promise<CafeState | null>;
  create(cafeName: string, npcName: string, role: Role, logo?: Logo): Promise<CafeState>;
  /** Подать заявку в кофейню с выбранной ролью. */
  apply(invite: Invite, role: Role): Promise<void>;
  cancelApplication(invite: Invite): Promise<void>;
  /** Войти в кофейню, где игрок уже сотрудник (после одобрения заявки). */
  enter(invite: Invite): Promise<CafeState | null>;
  /** Короткая информация о кофейне для экрана приглашения. */
  peek(invite: Invite): Promise<CafePeek | null>;
  send(cmd: Command): Promise<ApplyResult>;
  subscribe(cb: (s: CafeState) => void): () => void;
  leave(): Promise<void>;
  /** Рейтинги кофеен: сегодня, неделя, всё время. */
  ratings(): Promise<Ratings>;
  /** Купить пачку самоцветов за Stars. Возвращает статус оплаты. */
  buyGems(pack: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'>;
}

export interface RatingRow {
  code: string;
  name: string;
  logo: Logo | null;
  points: number;
  you: boolean;
}

export interface Ratings {
  today: RatingRow[];
  week: RatingRow[];
  all: RatingRow[];
}

export interface Invite {
  code: string;
  key: string;
}

export type { CafePeek } from '../core/peek';

/** Заявка, ожидающая одобрения, — помним между запусками. */
export const pendingInvite = {
  get(): string | null {
    try {
      return localStorage.getItem('cft:pending');
    } catch {
      return null;
    }
  },
  set(param: string | null) {
    try {
      if (param) localStorage.setItem('cft:pending', param);
      else localStorage.removeItem('cft:pending');
    } catch {
      /* ignore */
    }
  },
};

const ALPHABET ='ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCafeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Ссылка-приглашение. С настроенным ботом — Direct Link Mini App, иначе ссылка на веб-версию. */
export function inviteLink(code: string, key: string): string {
  const param = `cafe_${code}_${key}`;
  if (config.botUsername) return `https://t.me/${config.botUsername}/${config.appShortName}?startapp=${param}`;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('startapp', param);
  return url.toString();
}

export function parseInviteParam(p: string | null): Invite | null {
  if (!p) return null;
  const m = /^cafe_([A-Z0-9]{4,16})(?:_([A-Z0-9]{3,10}))?$/.exec(p);
  return m ? { code: m[1], key: m[2] ?? '' } : null;
}

// ---------- локальный режим: localStorage + BroadcastChannel ----------

const cafeKey = (code: string) => `cft:cafe:${code}`;
const memberKey = (id: string) => `cft:member:${id}`;

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  private chan: BroadcastChannel | null = null;

  constructor(private me: Identity) {
    try {
      this.chan = new BroadcastChannel('cft');
    } catch {
      this.chan = null;
    }
  }

  private read(code: string): CafeState | null {
    const raw = localStorage.getItem(cafeKey(code));
    return raw ? migrate(JSON.parse(raw) as CafeState) : null;
  }

  private write(s: CafeState) {
    localStorage.setItem(cafeKey(s.code), JSON.stringify(s));
    this.chan?.postMessage({ code: s.code, version: s.version });
  }

  private myCode(): string | null {
    return localStorage.getItem(memberKey(this.me.id));
  }

  async load() {
    const code = this.myCode();
    if (!code) return null;
    const s = this.read(code);
    if (!s || !s.players.some((p) => p.id === this.me.id)) {
      localStorage.removeItem(memberKey(this.me.id));
      return null;
    }
    return s;
  }

  async create(cafeName: string, npcName: string, role: Role, logo?: Logo) {
    const s = createCafe({ code: newCafeCode(), owner: { id: this.me.id, name: this.me.name }, role, npcName, cafeName, logo, now: now() });
    this.write(s);
    localStorage.setItem(memberKey(this.me.id), s.code);
    return s;
  }

  async apply(inv: Invite, role: Role) {
    const s = this.read(inv.code);
    if (!s) throw new GameError('cafe_not_found');
    const r = apply(s, { actor: this.me.id, at: now(), cmd: { type: 'apply', player: { id: this.me.id, name: this.me.name }, key: inv.key, role } });
    this.write(r.state);
  }

  async cancelApplication(inv: Invite) {
    const s = this.read(inv.code);
    if (!s) return;
    const r = apply(s, { actor: this.me.id, at: now(), cmd: { type: 'cancelApplication' } });
    this.write(r.state);
  }

  async enter(inv: Invite) {
    const s = this.read(inv.code);
    if (!s || !s.players.some((p) => p.id === this.me.id)) return null;
    localStorage.setItem(memberKey(this.me.id), inv.code);
    return s;
  }

  async peek(inv: Invite) {
    const s = this.read(inv.code);
    return s ? peekOf(s, this.me.id, inv.key) : null;
  }

  async send(cmd: Command) {
    const code = this.myCode();
    if (!code) throw new GameError('no_cafe');
    const s = this.read(code);
    if (!s) throw new GameError('cafe_not_found');
    const r = apply(s, { actor: this.me.id, at: now(), cmd });
    this.write(r.state);
    return r;
  }

  subscribe(cb: (s: CafeState) => void) {
    const reload = () => {
      const code = this.myCode();
      const s = code ? this.read(code) : null;
      if (s) cb(s);
    };
    const onMsg = () => reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('cft:')) reload();
    };
    this.chan?.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);
    return () => {
      this.chan?.removeEventListener('message', onMsg);
      window.removeEventListener('storage', onStorage);
    };
  }

  async leave() {
    localStorage.removeItem(memberKey(this.me.id));
  }

  async ratings() {
    // Без сервера соседи — сгенерированные кофейни (как раньше в лиге недели)
    const code = this.myCode();
    const s = code ? this.read(code) : null;
    return localRatings(s, now());
  }

  async buyGems(pack: string) {
    // Без Telegram оплату имитируем отладочной командой
    await this.send({ type: 'debugGems', pack });
    return 'paid' as const;
  }
}

function localRatings(s: CafeState | null, at: number): Ratings {
  const make = (seedKey: string, scale: number, own: number): RatingRow[] => {
    const rnd = mulberry32(hashString(seedKey));
    const rows: RatingRow[] = FAKE_CAFES.slice(0, 14).map((name, i) => ({
      code: `fake${i}`,
      name,
      logo: { shape: Math.floor(rnd() * LOGO_SHAPES.length), bg: Math.floor(rnd() * LOGO_COLORS.length), fg: 6, icon: Math.floor(rnd() * (LOGO_ICONS.length - 1)), text: '', frame: 1 },
      points: Math.round((0.1 + rnd()) * scale),
      you: false,
    }));
    if (s) rows.push({ code: s.code, name: s.name, logo: s.logo, points: own, you: true });
    return rows.sort((a, b) => b.points - a.points);
  };
  const day = dayKey(at);
  const wk = weekId(at);
  return {
    today: make(`d:${day}`, 120, s && s.today?.day === day ? s.today.points : 0),
    week: make(`w:${wk}`, 600, s && s.week.id === wk ? s.week.points : 0),
    all: make('all', 4000, s?.stats.points ?? 0),
  };
}

// ---------- серверный режим: Supabase Edge Function (supabase/functions/api) ----------

export class RemoteBackend implements Backend {
  readonly mode = 'remote' as const;
  private last: CafeState | null = null;

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: { code: 'network' } }));
    if (!res.ok || data.error) throw new GameError(data.error?.code ?? 'network', data.error?.params ?? {});
    return data as T;
  }

  async load() {
    const r = await this.call<{ state: CafeState | null }>({ op: 'load' });
    this.last = r.state;
    return r.state;
  }

  async create(cafeName: string, npcName: string, role: Role, logo?: Logo) {
    const r = await this.call<{ state: CafeState }>({ op: 'create', cafeName, npcName, role, logo });
    this.last = r.state;
    return r.state;
  }

  async apply(inv: Invite, role: Role) {
    await this.call({ op: 'apply', code: inv.code, key: inv.key, role });
  }

  async cancelApplication(inv: Invite) {
    await this.call({ op: 'cancel', code: inv.code });
  }

  async enter(_inv: Invite) {
    return this.load();
  }

  async peek(inv: Invite) {
    const r = await this.call<{ peek: CafePeek | null }>({ op: 'peek', code: inv.code, key: inv.key });
    return r.peek;
  }

  async send(cmd: Command) {
    const r = await this.call<ApplyResult>({ op: 'cmd', cmd, version: this.last?.version });
    this.last = r.state;
    return r;
  }

  subscribe(cb: (s: CafeState) => void) {
    // Реалтайм не нужен: игра асинхронная. Опрашиваем раз в 15 с и при возврате в приложение.
    const poll = async () => {
      try {
        const s = await this.load();
        if (s) cb(s);
      } catch {
        /* офлайн — попробуем позже */
      }
    };
    const timer = window.setInterval(poll, 15_000);
    const onVis = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }

  async leave() {
    await this.call({ op: 'leave' });
  }

  async ratings() {
    return this.call<Ratings>({ op: 'ratings' });
  }

  async buyGems(pack: string) {
    const r = await this.call<{ url: string }>({ op: 'invoice', pack });
    return tg.openInvoice(r.url);
  }
}

export function makeBackend(me: Identity): Backend {
  return config.apiUrl && tg.inTelegram ? new RemoteBackend() : new LocalBackend(me);
}

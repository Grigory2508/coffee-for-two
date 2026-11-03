import type { Role } from '../core/content';
import { apply, createCafe, migrate, type ApplyResult } from '../core/engine';
import { GameError, type CafeState, type Command } from '../core/types';
import { now } from '../platform/clock';
import { config } from '../platform/config';
import type { Identity } from '../platform/identity';
import { tg } from '../platform/telegram';

export interface Backend {
  readonly mode: 'local' | 'remote';
  load(): Promise<CafeState | null>;
  create(cafeName: string, npcName: string, role: Role): Promise<CafeState>;
  join(invite: Invite): Promise<CafeState>;
  /** Короткая информация о кофейне для экрана приглашения. */
  peek(invite: Invite): Promise<CafePeek | null>;
  send(cmd: Command): Promise<ApplyResult>;
  subscribe(cb: (s: CafeState) => void): () => void;
  leave(): Promise<void>;
}

export interface Invite {
  code: string;
  key: string;
}

export interface CafePeek {
  name: string;
  owner: string;
  full: boolean;
  isMember: boolean;
  expired: boolean;
  role: Role | null; // роль, которую получит вошедший
}

export function peekOf(s: CafeState, meId: string, key: string): CafePeek {
  const humansIn = s.players.filter((p) => !p.isNpc);
  return {
    name: s.name,
    owner: humansIn[0]?.name ?? '',
    full: humansIn.length >= 2,
    isMember: s.players.some((p) => p.id === meId),
    expired: !!s.inviteKey && key !== s.inviteKey,
    role: s.players.find((p) => p.isNpc)?.role ?? null,
  };
}

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

  async create(cafeName: string, npcName: string, role: Role) {
    const s = createCafe({ code: newCafeCode(), owner: { id: this.me.id, name: this.me.name }, role, npcName, cafeName, now: now() });
    this.write(s);
    localStorage.setItem(memberKey(this.me.id), s.code);
    return s;
  }

  async join(inv: Invite) {
    const s = this.read(inv.code);
    if (!s) throw new GameError('cafe_not_found');
    const r = apply(s, { actor: this.me.id, at: now(), cmd: { type: 'join', player: { id: this.me.id, name: this.me.name }, key: inv.key } });
    this.write(r.state);
    localStorage.setItem(memberKey(this.me.id), inv.code);
    return r.state;
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

  async create(cafeName: string, npcName: string, role: Role) {
    const r = await this.call<{ state: CafeState }>({ op: 'create', cafeName, npcName, role });
    this.last = r.state;
    return r.state;
  }

  async join(inv: Invite) {
    const r = await this.call<{ state: CafeState }>({ op: 'join', code: inv.code, key: inv.key });
    this.last = r.state;
    return r.state;
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
}

export function makeBackend(me: Identity): Backend {
  return config.apiUrl && tg.inTelegram ? new RemoteBackend() : new LocalBackend(me);
}

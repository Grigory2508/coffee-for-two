import type { Role } from './content.ts';
import { freeRoles } from './engine.ts';
import type { CafeState } from './types.ts';

/** Короткая информация о кофейне для экрана приглашения и ожидания заявки (клиент и сервер). */
export interface CafePeek {
  name: string;
  owner: string;
  staff: { name: string; role: Role }[];
  freeRoles: Role[];
  full: boolean;
  isMember: boolean;
  expired: boolean;
  application: null | { role: Role; approvals: number; needed: number };
}

export function peekOf(s: CafeState, meId: string, key: string): CafePeek {
  const humansIn = s.players.filter((p) => !p.isNpc);
  const app = s.applications.find((a) => a.id === meId);
  return {
    name: s.name,
    owner: humansIn.find((p) => p.id === s.ownerId)?.name ?? humansIn[0]?.name ?? '',
    staff: humansIn.map((p) => ({ name: p.name, role: p.role })),
    freeRoles: freeRoles(s),
    full: freeRoles(s).length === 0,
    isMember: s.players.some((p) => p.id === meId),
    expired: !!s.inviteKey && key !== s.inviteKey,
    application: app ? { role: app.role, approvals: app.approvals.filter((x) => humansIn.some((h) => h.id === x)).length, needed: humansIn.length } : null,
  };
}


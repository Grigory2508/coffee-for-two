// Минимальный клиент PostgREST на fetch — без зависимостей.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

export async function select<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function insert<T>(table: string, row: Record<string, unknown>, upsert = false): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: `return=representation${upsert ? ',resolution=merge-duplicates' : ''}` },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** PATCH с фильтром; возвращает изменённые строки (пусто — фильтр не совпал, например версия). */
export async function update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function remove(table: string, query: string): Promise<void> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${await res.text()}`);
}

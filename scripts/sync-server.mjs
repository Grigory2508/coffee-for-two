// Копирует ядро игры (src/core) в общую папку Edge Functions, чтобы сервер считал так же, как клиент.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const from = 'src/core';
const to = 'supabase/functions/_shared/core';
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from)) {
  if (f.endsWith('.test.ts')) continue;
  cpSync(`${from}/${f}`, `${to}/${f}`);
}
console.log(`core → ${to}`);

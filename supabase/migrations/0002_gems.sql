-- Банк самоцветов: самоцветы личные. Пока игрок в кофейне, они лежат в его Player в состоянии кофейни;
-- при уходе из кофейни (или оплате вне кофейни) — здесь, и выдаются при входе в новую.
create table if not exists public.gem_bank (
  user_id    bigint      primary key,
  gems       integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.gem_bank enable row level security;
grant select, insert, update, delete on public.gem_bank to service_role;

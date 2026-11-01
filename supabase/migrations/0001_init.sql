-- Кофейня на двоих: схема MVP.
-- Состояние кофейни целиком лежит в jsonb (одна строка на кофейню): игра асинхронная,
-- записи редкие, а логика одна и та же на клиенте и сервере (src/core).

create table if not exists public.cafes (
  code        text primary key,
  state       jsonb       not null,
  version     integer     not null,
  name        text        not null,
  week_id     text        not null,
  week_points integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cafes_week_idx on public.cafes (week_id, week_points desc);

-- Один игрок — одна кофейня (MVP).
create table if not exists public.members (
  user_id     bigint      primary key,
  code        text        not null references public.cafes(code) on delete cascade,
  first_name  text        not null default '',
  lang        text        not null default 'ru',
  joined_at   timestamptz not null default now()
);

create index if not exists members_code_idx on public.members (code);

-- Состояние уведомлений бота: разрешение писать, последняя отправка, блокировка.
create table if not exists public.notify_state (
  user_id          bigint      primary key,
  can_write        boolean     not null default false,
  blocked          boolean     not null default false,
  last_notified_at timestamptz,
  last_log_id      integer     not null default 0
);

-- Журнал платежей Stars (для поддержки и возвратов).
create table if not exists public.payments (
  charge_id   text        primary key,
  user_id     bigint      not null,
  payload     text        not null,
  amount      integer     not null,
  refunded    boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- Доступ только через Edge Functions с service role: RLS включён, политик для anon нет.
alter table public.cafes enable row level security;
alter table public.members enable row level security;
alter table public.notify_state enable row level security;
alter table public.payments enable row level security;

-- Рассылка сводок раз в час (нужны расширения pg_cron и pg_net, включаются в Dashboard → Database → Extensions).
-- Подставьте свой project-ref и секрет CRON_SECRET и выполните вручную:
-- select cron.schedule('digest-hourly', '17 * * * *', $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/bot?cron=digest',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
--   );
-- $$);

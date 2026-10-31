// Настройки сборки. Задаются переменными окружения Vite (см. README, раздел «Подключение»).
export const config = {
  /** Имя бота без @, например CoffeeForTwoBot. Нужно для ссылок-приглашений t.me/<бот>/<app>. */
  botUsername: (import.meta.env.VITE_BOT_USERNAME as string | undefined) ?? '',
  /** Короткое имя Mini App из BotFather (/newapp). */
  appShortName: (import.meta.env.VITE_APP_SHORTNAME as string | undefined) ?? 'play',
  /** URL серверного API (Supabase Edge Function). Пусто — локальный режим без сервера. */
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  posthogKey: (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? '',
  posthogHost: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com',
  /** Отладочная панель (ускорение времени и т.п.). В прототипе включена всегда. */
  debug: (import.meta.env.VITE_DEBUG as string | undefined) !== '0',
};

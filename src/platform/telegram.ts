// Тонкая обёртка над Telegram WebApp с фолбэками для обычного браузера.
// Всё, что зависит от версии клиента, проверяется через isVersionAtLeast.

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser; start_param?: string; chat_type?: string; chat_instance?: string };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  requestWriteAccess?(cb?: (ok: boolean) => void): void;
  shareMessage?(id: string, cb?: (ok: boolean) => void): void;
  shareToStory?(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void;
  requestFullscreen?(): void;
  lockOrientation?(): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: string) => void): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function webApp(): TgWebApp | null {
  const wa = window.Telegram?.WebApp;
  // Скрипт telegram-web-app.js есть и в обычном браузере, но initData там пустая.
  return wa && wa.initData ? wa : null;
}

export const tg = {
  get inTelegram() {
    return !!webApp();
  },
  get raw() {
    return webApp();
  },
  get initData() {
    return webApp()?.initData ?? '';
  },
  user(): TgUser | null {
    return webApp()?.initDataUnsafe.user ?? null;
  },
  startParam(): string | null {
    const fromTg = webApp()?.initDataUnsafe.start_param;
    if (fromTg) return fromTg;
    const q = new URLSearchParams(location.search);
    return q.get('startapp') ?? q.get('tgWebAppStartParam');
  },
  chatType(): string | null {
    return webApp()?.initDataUnsafe.chat_type ?? null;
  },
  init() {
    const wa = webApp();
    if (!wa) return;
    wa.ready();
    wa.expand();
    try {
      if (wa.isVersionAtLeast('7.7')) wa.disableVerticalSwipes?.();
      wa.setHeaderColor?.('#f6efe6');
      wa.setBackgroundColor?.('#f6efe6');
      if (wa.isVersionAtLeast('7.10')) wa.setBottomBarColor?.('#f6efe6');
      // Полноэкранный режим включаем явно и только на телефонах.
      if (wa.isVersionAtLeast('8.0') && ['android', 'ios'].includes(wa.platform)) {
        wa.requestFullscreen?.();
        wa.lockOrientation?.();
      }
    } catch (e) {
      console.warn('tg init', e);
    }
  },
  haptic(kind: 'tap' | 'success' | 'error' | 'select') {
    const h = webApp()?.HapticFeedback;
    if (!h) return;
    if (kind === 'tap') h.impactOccurred('light');
    else if (kind === 'select') h.selectionChanged();
    else h.notificationOccurred(kind);
  },
  /** Просим разрешение писать в личку. В браузере считаем, что разрешено. */
  requestWriteAccess(): Promise<boolean> {
    const wa = webApp();
    if (!wa || !wa.requestWriteAccess || !wa.isVersionAtLeast('6.9')) return Promise.resolve(!wa);
    if (wa.initDataUnsafe.user?.allows_write_to_pm) return Promise.resolve(true);
    return new Promise((res) => wa.requestWriteAccess!((ok) => res(ok)));
  },
  allowsWrite(): boolean | null {
    const u = webApp()?.initDataUnsafe.user;
    return u ? !!u.allows_write_to_pm : null;
  },
  /**
   * Поделиться ссылкой в чат. Подготовленные сообщения (shareMessage) требуют сервера,
   * поэтому в прототипе используем системное «Поделиться» Telegram через t.me/share.
   */
  async share(url: string, text: string): Promise<'telegram' | 'native' | 'clipboard' | 'failed'> {
    const wa = webApp();
    if (wa) {
      wa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return 'telegram';
    }
    if (navigator.share) {
      try {
        await navigator.share({ url, text });
        return 'native';
      } catch {
        /* пользователь закрыл диалог — пробуем буфер */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return 'clipboard';
    } catch {
      return 'failed';
    }
  },
  canAddToHomeScreen(): Promise<boolean> {
    const wa = webApp();
    if (!wa?.checkHomeScreenStatus || !wa.isVersionAtLeast('8.0')) return Promise.resolve(false);
    return new Promise((res) => wa.checkHomeScreenStatus!((st) => res(st === 'missed')));
  },
  addToHomeScreen() {
    webApp()?.addToHomeScreen?.();
  },
};

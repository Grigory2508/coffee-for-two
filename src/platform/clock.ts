// Игровые часы. В отладке можно «промотать» время вперёд — смещение общее для всех вкладок,
// чтобы два игрока в двух вкладках жили в одном времени.
const KEY = 'cft:timeOffset';

export function timeOffset(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function now(): number {
  return Date.now() + timeOffset();
}

export function skipTime(ms: number) {
  try {
    localStorage.setItem(KEY, String(timeOffset() + ms));
  } catch {
    /* хранилище недоступно — промотка не сработает */
  }
}

export function resetTime() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

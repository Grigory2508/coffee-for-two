import { config } from './config';

let distinctId = 'anon';

export function identify(id: string) {
  distinctId = id;
}

/**
 * События для проверки гипотез MVP (см. концепт, раздел «MVP, гипотезы и метрики»):
 * invite_sent, invite_opened, partner_joined, shift_started/finished, write_access,
 * session_start (с source: bot_message | partner_card | direct), purchase_*.
 */
export function track(event: string, props: Record<string, unknown> = {}) {
  if (import.meta.env.DEV) console.debug('[track]', event, props);
  if (!config.posthogKey) return;
  const body = JSON.stringify({
    api_key: config.posthogKey,
    event,
    distinct_id: distinctId,
    properties: { ...props, $current_url: location.href },
    timestamp: new Date().toISOString(),
  });
  try {
    fetch(`${config.posthogHost}/capture/`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch {
    /* аналитика не должна ломать игру */
  }
}

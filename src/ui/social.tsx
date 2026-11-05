// Вывеска (название + логотип), декор зала, магазин самоцветов и рейтинги.
import { useEffect, useState } from 'preact/hooks';
import { CONFIG, GEMS, GEM_PACKS, cleanCafeName, type Logo } from '../core/content';
import { getPlayer, humans, weekId } from '../core/engine';
import type { Ratings, RatingRow } from '../net/backend';
import { L, t } from '../i18n';
import { BrandEditor, LogoView } from './logo';
import { playerName, useGame } from './game';

// ---------- вывеска ----------

export function BrandCard({ onShop }: { onShop: () => void }) {
  const { state, me, send } = useGame();
  const p = getPlayer(state, me.id)!;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.name);
  const [logo, setLogo] = useState<Logo>(state.logo);
  const humanManagers = humans(state).filter((h) => h.role === 'manager');
  const canSubmit = humanManagers.length ? p.role === 'manager' : true;
  const voting = state.brands.find((b) => b.status === 'voting');
  const valid = !!cleanCafeName(name);

  async function propose() {
    const r = await send({ type: 'proposeBrand', name, logo });
    if (r) setEditing(false);
  }

  return (
    <div class="card brand-card">
      <div class="row gap">
        <LogoView logo={state.logo} size={56} />
        <div class="grow">
          <div class="card-title">{state.name}</div>
          <div class="muted small">{t('brandHint', { cost: CONFIG.brandCost })}</div>
        </div>
      </div>

      {state.brands.map((b) => {
        const mine = b.approvals.includes(me.id);
        const left = humans(state).filter((h) => !b.approvals.includes(h.id));
        return (
          <div class={`brand-prop ${b.status}`}>
            <LogoView logo={b.logo} size={40} />
            <div class="grow">
              <b>{b.name}</b>
              <div class="muted tiny">
                {t('brandBy', { name: playerName(state, b.by) })}
                {b.status === 'voting' && ` · ${t('brandWaiting', { names: left.map((h) => h.name).join(', ') || '—' })}`}
              </div>
              <div class="row gap wrap">
                {b.status === 'draft' && canSubmit && (
                  <button class="btn small primary" disabled={!!voting} onClick={() => (p.gems < CONFIG.brandCost ? onShop() : send({ type: 'submitBrand', id: b.id }))}>
                    {t('brandSubmit', { cost: CONFIG.brandCost })}
                  </button>
                )}
                {b.status === 'draft' && !canSubmit && <span class="muted tiny">{t('brandManagerSubmits')}</span>}
                {b.status === 'draft' && (b.by === me.id || p.role === 'manager') && (
                  <button class="btn small ghost" onClick={() => send({ type: 'dropBrand', id: b.id })}>
                    {t('remove')}
                  </button>
                )}
                {b.status === 'voting' && !mine && (
                  <>
                    <button class="btn small primary" onClick={() => send({ type: 'voteBrand', id: b.id, yes: true })}>
                      👍 {t('brandYes')}
                    </button>
                    <button class="btn small ghost" onClick={() => send({ type: 'voteBrand', id: b.id, yes: false })}>
                      👎 {t('brandNo')}
                    </button>
                  </>
                )}
                {b.status === 'voting' && mine && <span class="tag">{t('brandVoted')}</span>}
              </div>
            </div>
          </div>
        );
      })}

      {editing ? (
        <>
          <BrandEditor
            name={name}
            logo={logo}
            onChange={(n, l) => {
              setName(n);
              setLogo(l);
            }}
          />
          <div class="row gap">
            <button class="btn ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </button>
            <button class="btn primary grow" disabled={!valid || state.brands.length >= CONFIG.brandMaxProposals} onClick={propose}>
              {t('brandPropose')}
            </button>
          </div>
          {!valid && name.trim() && <div class="small danger-text">{t('err_bad_name')}</div>}
        </>
      ) : (
        <button
          class="btn wide"
          onClick={() => {
            setName(state.name);
            setLogo(state.logo);
            setEditing(true);
          }}
        >
          ✏️ {t('brandNew')}
        </button>
      )}
    </div>
  );
}

// ---------- декор зала ----------


export function ShopSheet({ onClose }: { onClose: () => void }) {
  const { state, me, backend, toast, refresh } = useGame();
  const p = getPlayer(state, me.id)!;
  const [busy, setBusy] = useState<string | null>(null);
  async function buy(id: string) {
    setBusy(id);
    try {
      const st = await backend.buyGems(id);
      if (st === 'paid') {
        toast(t('shopPaid'));
        onClose();
        // Самоцветы начисляет сервер после оплаты — подтягиваем состояние
        await refresh();
        window.setTimeout(() => void refresh(), 2500);
      } else if (st === 'failed') toast(t('shopFailed'));
    } catch {
      toast(t('shopFailed'));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet card" onClick={(e) => e.stopPropagation()}>
        <div class="row">
          <b class="grow">
            {GEMS.icon} {L(GEMS.name)}: {p.gems}
          </b>
          <button class="btn ghost small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="muted small">{t('shopHint', { n: CONFIG.dailyGoalActions, g: CONFIG.dailyGoalGems })}</div>
        <div class="gem-packs">
          {GEM_PACKS.map((pk) => (
            <button class="gem-pack" disabled={!!busy} onClick={() => buy(pk.id)}>
              <span class="gem-amount">
                {GEMS.icon} {pk.gems + Math.round((pk.gems * (pk.bonus ?? 0)) / 100)}
              </span>
              {pk.bonus ? <span class="tag">+{pk.bonus}%</span> : <span class="tag ghost-tag">&nbsp;</span>}
              <span class="gem-price">⭐ {pk.stars}</span>
            </button>
          ))}
        </div>
        <div class="muted tiny">{t('shopTerms')}</div>
      </div>
    </div>
  );
}

// ---------- рейтинги ----------

type Board = 'today' | 'week' | 'all' | 'team';

export function RatingsTab() {
  const { state, me, backend, now } = useGame();
  const [board, setBoard] = useState<Board>('week');
  const [data, setData] = useState<Ratings | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    backend
      .ratings()
      .then((r) => alive && setData(r))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [state.version]);

  const tabs: [Board, string][] = [
    ['today', t('topToday')],
    ['week', t('topWeek')],
    ['all', t('topAll')],
    ['team', t('topTeam')],
  ];

  return (
    <div class="tab">
      <div class="segmented">
        {tabs.map(([id, label]) => (
          <button class={`seg ${board === id ? 'on' : ''}`} onClick={() => setBoard(id)}>
            {label}
          </button>
        ))}
      </div>
      <div class="muted small">{t(`topHint_${board}`)}</div>
      {board === 'team' ? (
        <TeamBoard />
      ) : !data ? (
        <div class="card muted center">{error ? t('err_network') : '…'}</div>
      ) : (
        <BoardList rows={data[board]} meCode={state.code} />
      )}
      <div class="muted tiny center">{t('topAlliancesSoon')}</div>
    </div>
  );

  function TeamBoard() {
    const rows = humans(state)
      .map((h) => ({ h, pts: h.points?.week === weekId(now) ? h.points.thisWeek : 0, all: h.points?.all ?? 0 }))
      .sort((a, b) => b.pts - a.pts || b.all - a.all);
    return (
      <div class="card">
        <ol class="top">
          {rows.map((r, i) => (
            <li class={r.h.id === me.id ? 'you' : ''}>
              <span class="place">{i + 1}</span>
              <span class="grow">
                {r.h.name} <span class="muted tiny">{r.h.role === 'manager' ? '📋' : '☕'}</span>
              </span>
              <span class="muted tiny">{t('topAllShort', { n: r.all })}</span>
              <b>{r.pts}</b>
            </li>
          ))}
        </ol>
      </div>
    );
  }
}

function BoardList({ rows, meCode }: { rows: RatingRow[]; meCode: string }) {
  const youAt = rows.findIndex((r) => r.code === meCode || r.you);
  const shown = rows.filter((_, i) => i < 10 || Math.abs(i - youAt) <= 1);
  return (
    <div class="card">
      <ol class="top">
        {shown.map((r) => {
          const i = rows.indexOf(r);
          const gap = i > 0 && !shown.includes(rows[i - 1]);
          const you = r.code === meCode || r.you;
          return (
            <>
              {gap && <li class="top-gap">⋯</li>}
              <li class={you ? 'you' : ''}>
                <span class="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                {r.logo ? <LogoView logo={r.logo} size={26} /> : <span class="logo-ph" />}
                <span class="grow">
                  {r.name} {you && <span class="tag">{t('you')}</span>}
                </span>
                <b>{r.points}</b>
              </li>
            </>
          );
        })}
        {!rows.length && <li class="muted">—</li>}
      </ol>
    </div>
  );
}

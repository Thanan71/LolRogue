import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Feedback';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { formatDate, formatNumber } from '@/i18n/format';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import type {
  ChampionAccess,
  ChampionEconomySnapshot,
  ChampionPurchaseQuote,
} from '@/types/championEconomy';
import '@/styles/champion-economy.css';

const copy = getChampionEconomyContent();
export type ChampionAccessFilter = 'all' | 'available' | 'owned' | 'rotation' | 'locked';
export type ChampionAccessSort = 'name' | 'access';
export const accessOrder: Record<ChampionAccess, number> = {
  permanent_free: 0,
  owned: 1,
  weekly_rotation: 2,
  locked: 3,
};

export function championMatchesAccess(access: ChampionAccess, filter: ChampionAccessFilter) {
  return (
    filter === 'all' ||
    (filter === 'available'
      ? access !== 'locked'
      : filter === 'rotation'
        ? access === 'weekly_rotation'
        : access === filter)
  );
}

export function ChampionAccessControls({
  filter,
  onFilter,
  sort,
  onSort,
}: {
  filter: ChampionAccessFilter;
  onFilter: (filter: ChampionAccessFilter) => void;
  sort: ChampionAccessSort;
  onSort: (sort: ChampionAccessSort) => void;
}) {
  const filterId = useId();
  const sortId = useId();
  return (
    <div className="champion-economy__controls">
      <label htmlFor={filterId}>
        {copy.filter}
        <select
          id={filterId}
          value={filter}
          onChange={(event) => onFilter(event.target.value as ChampionAccessFilter)}
        >
          {(Object.keys(copy.filters) as ChampionAccessFilter[]).map((key) => (
            <option key={key} value={key}>
              {copy.filters[key]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={sortId}>
        {copy.sort}
        <select
          id={sortId}
          value={sort}
          onChange={(event) => onSort(event.target.value as ChampionAccessSort)}
        >
          {(Object.keys(copy.sorts) as ChampionAccessSort[]).map((key) => (
            <option key={key} value={key}>
              {copy.sorts[key]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ChampionEconomyPanel({
  snapshot,
  status,
  serverNow,
  onRefresh,
}: {
  snapshot: ChampionEconomySnapshot | null;
  status: string;
  serverNow: number;
  onRefresh: () => Promise<void>;
}) {
  if (!snapshot)
    return status === 'loading' || status === 'error' ? (
      <section className="champion-economy" aria-label={copy.wallet}>
        <p role={status === 'error' ? 'alert' : 'status'}>
          {status === 'error' ? copy.unavailable : copy.loading}
        </p>
        {status === 'error' && (
          <button type="button" onClick={() => void onRefresh()}>
            {copy.retry}
          </button>
        )}
      </section>
    ) : null;
  if (!snapshot.enabled) return null;
  const expired = snapshot.rotation && serverNow >= Date.parse(snapshot.rotation.endsAt);
  return (
    <section className="champion-economy" aria-label={copy.wallet}>
      {snapshot.wallet ? (
        <p className="champion-economy__balance" role="status" aria-live="polite">
          <strong>{copy.wallet}</strong>{' '}
          <span>{copy.balance(formatNumber(snapshot.wallet.shardsBalance))}</span>
        </p>
      ) : (
        <p>{copy.guest}</p>
      )}
      <p>{copy.currencies}</p>
      {snapshot.wallet && <p>{copy.earning}</p>}
      {snapshot.rotation && (
        <p>
          {copy.nextRotation(
            formatDate(snapshot.rotation.endsAt, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'UTC',
            }),
          )}
        </p>
      )}
      {expired && <p role="status">{copy.rotationExpired}</p>}
      {status === 'loading' && <p role="status">{copy.loading}</p>}
      {status === 'error' && (
        <p role="alert">
          {copy.unavailable}{' '}
          <button type="button" onClick={() => void onRefresh()}>
            {copy.retry}
          </button>
        </p>
      )}
    </section>
  );
}

export function ChampionAccessBadge({
  championId,
  snapshot,
  access,
  serverNow,
}: {
  championId: string;
  snapshot: ChampionEconomySnapshot | null;
  access: ChampionAccess;
  serverNow: number;
}) {
  if (!snapshot?.enabled) return null;
  const inCatalog = snapshot.catalog.some((entry) => entry.championId === championId);
  let remaining: string | null = null;
  if (access === 'weekly_rotation' && snapshot.rotation) {
    const hours = Math.max(
      0,
      Math.ceil((Date.parse(snapshot.rotation.endsAt) - serverNow) / 3_600_000),
    );
    remaining =
      hours > 24
        ? copy.remainingDays(formatNumber(Math.floor(hours / 24)), formatNumber(hours % 24))
        : copy.remainingHours(formatNumber(hours));
  }
  return (
    <span className={`champion-access champion-access--${access}`}>
      <span>{inCatalog ? copy.access[access] : copy.consultation}</span>
      {remaining && <small>{remaining}</small>}
    </span>
  );
}

export function ChampionRotationBonus({ championId }: { championId: string }) {
  const { snapshot, getServerNow } = useChampionEconomyStore();
  if (
    !snapshot?.enabled ||
    !snapshot.wallet ||
    !snapshot.rotation?.championIds.includes(championId) ||
    getServerNow() >= Date.parse(snapshot.rotation.endsAt)
  )
    return null;
  return (
    <p className="champion-economy__bonus">
      {snapshot.firstWinChampionIds.includes(championId) ? copy.bonusClaimed : copy.bonusAvailable}
    </p>
  );
}

export function ChampionPurchaseAction({
  championId,
  championName,
  returnFocusId,
  onBeforePurchase,
}: {
  championId: string;
  championName: string;
  returnFocusId?: string;
  onBeforePurchase?: () => void;
}) {
  const navigate = useAppNavigate();
  const { user, isGuest, exitGuestMode } = useAuthStore();
  const { snapshot, purchase, purchasingChampionId } = useChampionEconomyStore();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<ChampionPurchaseQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestRef = useRef(0);
  const reviewPriceRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const entry = snapshot?.catalog.find((item) => item.championId === championId);
  const owned = snapshot?.ownedChampionIds.includes(championId);
  const pending = submitting || purchasingChampionId !== null;
  const authenticated = !!user && !isGuest;
  const balance = snapshot?.wallet?.shardsBalance ?? 0;
  const missing = quote ? Math.max(0, quote.priceShards - balance) : 0;

  useEffect(() => {
    requestRef.current += 1;
    setOpen(false);
    setQuote(null);
    setError(null);
    setSuccess(null);
    setSubmitting(false);
    return () => {
      requestRef.current += 1;
    };
  }, [user?.id, isGuest, championId]);

  useEffect(() => {
    if (open && !quote) reviewPriceRef.current?.focus();
  }, [open, quote]);

  function focusAfterPurchase() {
    window.requestAnimationFrame(() => {
      if (!returnFocusId) return;
      const target = document.getElementById(returnFocusId);
      (
        target?.querySelector<HTMLButtonElement>('button.champion-card:not(:disabled)') ?? target
      )?.focus({ preventScroll: true });
    });
  }

  function captureQuote() {
    if (!entry || !snapshot) return;
    setQuote({
      priceShards: entry.priceShards,
      economyVersion: snapshot.economyVersion,
      catalogVersion: snapshot.catalogVersion,
    });
    setError(null);
  }

  async function beginPurchase() {
    setError(null);
    if (!authenticated) {
      if (isGuest) {
        const result = await exitGuestMode();
        if (!result.success) {
          setError(result.error ?? copy.errors.authentication_required);
          return;
        }
      }
      navigate(ROUTES.AUTH);
      return;
    }
    captureQuote();
    setOpen(true);
  }

  async function confirm() {
    if (!quote || pending || missing > 0) return;
    onBeforePurchase?.();
    const request = ++requestRef.current;
    setSubmitting(true);
    setError(null);
    try {
      const result = await purchase(championId, quote);
      if (request !== requestRef.current) return;
      setSuccess(
        copy.purchased(championName, formatNumber(result.snapshot.wallet?.shardsBalance ?? 0)),
      );
      setOpen(false);
      focusAfterPurchase();
    } catch (failure) {
      if (request !== requestRef.current) return;
      const code =
        failure && typeof failure === 'object' && 'code' in failure
          ? String(failure.code)
          : 'unknown';
      setError(copy.errors[code as keyof typeof copy.errors] ?? copy.errors.unknown);
      if (code === 'champion_price_changed') setQuote(null);
    } finally {
      if (request === requestRef.current) setSubmitting(false);
    }
  }

  if (!snapshot?.enabled || !entry || entry.permanentFree) return null;
  return (
    <div className="champion-economy__purchase">
      {!owned && (
        <button
          type="button"
          className="champion-economy__buy"
          disabled={pending}
          onClick={() => void beginPurchase()}
        >
          {authenticated
            ? copy.buy(championName, formatNumber(entry.priceShards))
            : copy.login(championName)}
        </button>
      )}
      {!open && error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite" className="champion-economy__purchase-status">
        {success}
      </p>
      <Dialog
        open={open}
        title={copy.confirmTitle(championName)}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        actions={
          <>
            <button
              ref={cancelRef}
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                if (owned) focusAfterPurchase();
              }}
            >
              {copy.cancel}
            </button>
            {quote ? (
              <button
                ref={confirmRef}
                type="button"
                disabled={pending || missing > 0 || !snapshot.wallet || !!owned}
                onClick={() => void confirm()}
              >
                {pending ? copy.pending : copy.confirm}
              </button>
            ) : (
              <button
                ref={reviewPriceRef}
                type="button"
                disabled={pending}
                onClick={() => {
                  captureQuote();
                  window.requestAnimationFrame(() =>
                    (confirmRef.current?.disabled
                      ? cancelRef.current
                      : confirmRef.current
                    )?.focus(),
                  );
                }}
              >
                {copy.reviewPrice}
              </button>
            )}
          </>
        }
      >
        <p>{copy.permanentPurchase}</p>
        {quote && (
          <dl className="champion-economy__quote">
            <div>
              <dt>{copy.price}</dt>
              <dd>{copy.balance(formatNumber(quote.priceShards))}</dd>
            </div>
            <div>
              <dt>{copy.before}</dt>
              <dd>{copy.balance(formatNumber(balance))}</dd>
            </div>
            <div>
              <dt>{copy.after}</dt>
              <dd>{copy.balance(formatNumber(Math.max(0, balance - quote.priceShards)))}</dd>
            </div>
          </dl>
        )}
        {missing > 0 && <p role="status">{copy.missing(formatNumber(missing))}</p>}
        {error && <p role="alert">{error}</p>}
      </Dialog>
    </div>
  );
}

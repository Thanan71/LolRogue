import { useEffect, useState } from 'react';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';

/** Membership and countdowns use the store's server clock, including a resumed browser tab. */
export function useChampionEconomyRoute() {
  const economy = useChampionEconomyStore();
  const [, tick] = useState(0);
  const { refresh, snapshot, getServerNow } = economy;
  const endsAt = snapshot?.enabled ? snapshot.rotation?.endsAt : undefined;

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!endsAt) return;
    let expiryRequested = false;
    const update = () => {
      tick((value) => value + 1);
      if (!expiryRequested && getServerNow() >= Date.parse(endsAt)) {
        expiryRequested = true;
        void refresh();
      }
    };
    const timer = window.setInterval(update, 60_000);
    const expiryTimer = window.setTimeout(update, Math.max(0, Date.parse(endsAt) - getServerNow()));
    update();
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
    };
  }, [endsAt, getServerNow, refresh]);

  return { ...economy, serverNow: getServerNow() };
}

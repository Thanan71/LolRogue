import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import { championDB } from '@/data/championDatabase';
import { getKeystoneRunes } from '@/data/items/runeDatabase';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';
import type { Champion } from '@/types/champion';
import { createDailyRNG, getDailySeed } from '@/utils/dailySeed';
import { SeededRNG } from '@/utils/seededRandom';
import { gameStatsAtLevel } from '@/utils/statConversion';
import '@/styles/starter-select.css';
import { playUIClick } from '@/audio';

function pickRandom<T>(arr: T[], count: number, rng: SeededRNG): T[] {
  return rng.pickN(arr, count);
}

export function StarterSelectPage() {
  const location = useLocation();
  const isDaily =
    new URLSearchParams(location.search).get('mode') === 'daily' ||
    (location.state as { mode?: string } | null)?.mode === 'daily';
  const [selectionSeed] = useState(() => (isDaily ? getDailySeed() : Date.now()));
  const choices = useMemo(() => {
    const rng = isDaily ? createDailyRNG() : new SeededRNG(selectionSeed);
    return pickRandom(championDB.getAll(), 6, rng);
  }, [isDaily, selectionSeed]);
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [selectedRuneIds, setSelectedRuneIds] = useState<string[]>([]);
  const startRun = useRunStore((s) => s.startRun);
  const startDailyRun = useDailyRunStore((state) => state.startDailyRun);
  const hasCompletedToday = useDailyRunStore((state) => state.hasCompletedToday);
  const { isGuest, player } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const navigate = useAppNavigate();

  async function handleConfirm() {
    playUIClick();
    if (!selectedStarterId) return;
    setError(null);
    setIsStarting(true);

    if (isDaily) {
      if (hasCompletedToday) {
        setError("Today's Daily Run has already been completed.");
        setIsStarting(false);
        return;
      }
      if (!isGuest && player) {
        const result = await new SupabaseDailyRunRepository(supabase).getTodayDailyRun(player.id);
        if (result.error) {
          setError('Unable to verify Daily Run availability.');
          setIsStarting(false);
          return;
        }
        if (result.data?.completed_at) {
          useDailyRunStore.setState({ hasCompletedToday: true });
          setError("Today's Daily Run has already been completed.");
          setIsStarting(false);
          return;
        }
      }
      if (!startDailyRun([selectedStarterId])) {
        setError("Today's Daily Run has already been completed.");
        setIsStarting(false);
        return;
      }
      await startRun([selectedStarterId], {
        mode: 'daily',
        seed: getDailySeed(),
        runeIds: selectedRuneIds,
      });
    } else {
      await startRun([selectedStarterId], { seed: selectionSeed, runeIds: selectedRuneIds });
    }

    navigate(ROUTES.RUN);
  }

  function handleBack() {
    playUIClick();
    navigate(ROUTES.MENU);
  }

  return (
    <div className="starter-select">
      <div className="starter-select__header">
        <button className="starter-select__back" onClick={handleBack}>
          ← Back
        </button>
        <h1 className="starter-select__title">
          {isDaily ? 'Choisis ton Champion du jour' : 'Choisis ton Champion'}
        </h1>
      </div>
      <p className="starter-select__subtitle">
        {isDaily
          ? 'Tous les joueurs affrontent la même seed quotidienne'
          : 'Sélectionne ton starter pour la run'}
      </p>

      <div className="starter-select__grid">
        {choices.map((champ) => (
          <ChampionCard
            key={champ.id}
            champion={champ}
            selected={selectedStarterId === champ.id}
            onSelect={() => setSelectedStarterId(champ.id)}
          />
        ))}
      </div>

      <div className="starter-select__actions">
        <fieldset>
          <legend>Runes (3 maximum)</legend>
          {getKeystoneRunes().map((rune) => (
            <label key={rune.id} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={selectedRuneIds.includes(rune.id)}
                disabled={!selectedRuneIds.includes(rune.id) && selectedRuneIds.length >= 3}
                onChange={() =>
                  setSelectedRuneIds((current) =>
                    current.includes(rune.id)
                      ? current.filter((id) => id !== rune.id)
                      : [...current, rune.id],
                  )
                }
              />{' '}
              {rune.name} — {rune.description}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button
          className="starter-select__confirm"
          disabled={!selectedStarterId || isStarting}
          onClick={() => void handleConfirm()}
        >
          {isStarting ? 'Vérification…' : 'Confirmer le choix'}
        </button>
      </div>
    </div>
  );
}

function ChampionCard({
  champion,
  selected,
  onSelect,
}: {
  champion: Champion;
  selected: boolean;
  onSelect: () => void;
}) {
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  const statRows: { label: string; value: number }[] = [
    { label: 'HP', value: gameStats.hp },
    { label: 'ATK', value: gameStats.atk },
    { label: 'DEF', value: gameStats.def },
    { label: 'AP', value: gameStats.ap },
    { label: 'SPD', value: gameStats.spd },
    { label: 'CRIT', value: gameStats.crit },
  ];

  return (
    <button
      type="button"
      className={`champion-card${selected ? ' champion-card--selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choisir ${champion.name}`}
    >
      <div className="champion-card__splash-wrapper">
        <img className="champion-card__splash" src={splashUrl} alt={champion.name} loading="lazy" />
        <div className="champion-card__splash-overlay" />
      </div>

      <div className="champion-card__info">
        <div className="champion-card__name">{champion.name}</div>
        <div className="champion-card__title-text">{champion.title}</div>

        <div className="champion-card__tags">
          {champion.tags.map((tag) => (
            <span key={tag} className={`champion-card__tag champion-card__tag--${tag}`}>
              {tag}
            </span>
          ))}
        </div>

        <div className="champion-card__stats">
          {statRows.map((row) => (
            <div key={row.label} className="champion-card__stat">
              <span className="champion-card__stat-label">{row.label}</span>
              <span className="champion-card__stat-value">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

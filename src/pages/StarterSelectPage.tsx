import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import { ROUTES } from '@/config/routes';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { getKeystoneRunes } from '@/data/items/runeDatabase';
import { getUnlockedStarterSlotCount } from '@/game/run/runStartValidation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { Champion } from '@/types/champion';
import type { DailyChallenge } from '@/types/dailyRun';
import { createDailyRNG, getDailySeed } from '@/utils/dailySeed';
import { applyLocalImageFallback } from '@/utils/imageFallback';
import { SeededRNG } from '@/utils/seededRandom';
import { gameStatsAtLevel } from '@/utils/statConversion';
import '@/styles/starter-select.css';
import { playUIClick } from '@/audio';
import { formatChampionTag } from '@/i18n/format';
import { fr } from '@/i18n/fr';

function pickRandom<T>(arr: T[], count: number, rng: SeededRNG): T[] {
  return rng.pickN(arr, count);
}

export function StarterSelectPage() {
  const location = useLocation();
  const requestedDaily =
    new URLSearchParams(location.search).get('mode') === 'daily' ||
    (location.state as { mode?: string } | null)?.mode === 'daily';
  const { isGuest, isInitialized, isLoading: isAuthLoading, user } = useAuthStore();
  const pendingAuthorityStart = useRunStore((state) => state.pendingAuthorityStart);
  const resumableStart =
    user && pendingAuthorityStart?.ownerUserId === user.id ? pendingAuthorityStart : null;
  const isDaily = resumableStart ? resumableStart.mode === 'daily' : requestedDaily;
  const [selectionSeed] = useState(() => (isDaily ? getDailySeed() : Date.now()));
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);
  const [isLoadingDaily, setIsLoadingDaily] = useState(isDaily && !isGuest);
  const choices = useMemo(() => {
    if (resumableStart) {
      return resumableStart.team
        .map((championId) => championDB.getById(championId))
        .filter((champion): champion is Champion => champion !== undefined);
    }
    if (isDaily && !isGuest) {
      return (dailyChallenge?.starterIds ?? [])
        .map((championId) => championDB.getById(championId))
        .filter((champion): champion is Champion => champion !== undefined);
    }
    const rng = isDaily ? createDailyRNG() : new SeededRNG(selectionSeed);
    return pickRandom(implementedChampions, 6, rng);
  }, [dailyChallenge, isDaily, isGuest, resumableStart, selectionSeed]);
  const masteryChampions = useMasteryStore((state) => state.champions);
  const unlockedStarterSlots = useMemo(
    () =>
      getUnlockedStarterSlotCount(
        Object.values(masteryChampions).flatMap((mastery) => mastery.unlockedIds),
      ),
    [masteryChampions],
  );
  const [selectedStarterIds, setSelectedStarterIds] = useState<string[]>(
    resumableStart?.team ?? [],
  );
  const [selectedRuneIds, setSelectedRuneIds] = useState<string[]>(resumableStart?.runeIds ?? []);
  const startRun = useRunStore((s) => s.startRun);
  const markGuestAttemptStarted = useDailyRunStore((state) => state.markGuestAttemptStarted);
  const hasCompletedToday = useDailyRunStore((state) => state.hasCompletedToday);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const navigate = useAppNavigate();
  const selectedStarters = choices.filter((champion) => selectedStarterIds.includes(champion.id));

  useEffect(() => {
    if (!resumableStart) return;
    setSelectedStarterIds([...resumableStart.team]);
    setSelectedRuneIds([...resumableStart.runeIds]);
  }, [resumableStart]);

  useEffect(() => {
    if (!isDaily || isGuest) {
      setIsLoadingDaily(false);
      return;
    }
    if (!isInitialized || isAuthLoading) {
      setIsLoadingDaily(true);
      return;
    }

    let cancelled = false;
    setIsLoadingDaily(true);
    void new SupabaseDailyRunRepository(supabase).getDailyChallenge().then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(fr.starter.dailyAuthoritativeLoadFailed);
      } else {
        setDailyChallenge(result.data);
        useDailyRunStore.getState().syncChallenge(result.data);
      }
      setIsLoadingDaily(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isDaily, isGuest, isInitialized, user?.id]);

  async function handleConfirm() {
    playUIClick();
    if (selectedStarterIds.length === 0) return;
    setError(null);
    setIsStarting(true);

    if (isDaily) {
      if (hasCompletedToday && !resumableStart) {
        setError(fr.starter.dailyUsed);
        setIsStarting(false);
        return;
      }
      if (!isGuest && (!dailyChallenge || (dailyChallenge.hasAttempted && !resumableStart))) {
        setError(dailyChallenge?.hasAttempted ? fr.starter.dailyUsed : fr.starter.dailyUnavailable);
        setIsStarting(false);
        return;
      }
      const result = await startRun(selectedStarterIds, {
        mode: 'daily',
        seed: dailyChallenge?.seed ?? getDailySeed(),
        runeIds: selectedRuneIds,
        difficulty: dailyChallenge?.difficulty,
      });
      if (!result.success) {
        setError(result.error ?? fr.starter.dailyStartFailed);
        setIsStarting(false);
        return;
      }
      if (isGuest) markGuestAttemptStarted();
    } else {
      const result = await startRun(selectedStarterIds, {
        seed: selectionSeed,
        runeIds: selectedRuneIds,
      });
      if (!result.success) {
        setError(result.error ?? 'Impossible de démarrer une partie vérifiée.');
        setIsStarting(false);
        return;
      }
    }

    navigate(ROUTES.RUN);
  }

  function handleBack() {
    playUIClick();
    navigate(ROUTES.MENU);
  }

  function toggleStarter(championId: string) {
    if (resumableStart) return;
    setError(null);
    setSelectedStarterIds((current) => {
      if (current.includes(championId)) {
        return current.filter((id) => id !== championId);
      }
      if (current.length >= unlockedStarterSlots) {
        setError(
          `Tu disposes de ${unlockedStarterSlots} slot${
            unlockedStarterSlots > 1 ? 's' : ''
          } de départ.`,
        );
        return current;
      }
      return [...current, championId];
    });
  }

  return (
    <div className="starter-select">
      <header className="starter-select__header">
        <button type="button" className="starter-select__back" onClick={handleBack}>
          {fr.common.back}
        </button>
        <h1 className="starter-select__title">
          {isDaily ? 'Compose ton équipe du jour' : 'Compose ton équipe'}
        </h1>
        <span className="starter-select__header-spacer" aria-hidden="true" />
      </header>
      <p className="starter-select__subtitle">
        {resumableStart
          ? 'Une tentative vérifiée interrompue est prête à reprendre avec ses choix d’origine.'
          : isDaily
            ? `Tous les joueurs affrontent la même seed quotidienne · ${unlockedStarterSlots} slot(s)`
            : `Run normale : ta difficulté et tes choix · sélectionne jusqu’à ${unlockedStarterSlots} champion(s)${isGuest ? ' · sauvegarde sur cet appareil uniquement' : ''}`}
      </p>

      <div className="starter-select__grid">
        {choices.map((champ) => (
          <ChampionCard
            key={champ.id}
            champion={champ}
            selected={selectedStarterIds.includes(champ.id)}
            disabled={
              resumableStart !== null ||
              (!selectedStarterIds.includes(champ.id) &&
                selectedStarterIds.length >= unlockedStarterSlots)
            }
            onSelect={() => toggleStarter(champ.id)}
          />
        ))}
      </div>

      <div className="starter-select__actions">
        <fieldset className="starter-select__runes" aria-describedby="starter-runes-help">
          <legend className="starter-select__runes-title">{fr.starter.chooseRunes}</legend>
          <div className="starter-select__runes-heading">
            <p id="starter-runes-help">
              Jusqu’à 3 runes optionnelles pour personnaliser ta partie.
            </p>
            <output className="starter-select__runes-count" aria-live="polite">
              {selectedRuneIds.length}/3 sélectionnées
            </output>
          </div>
          <div className="starter-select__rune-grid">
            {getKeystoneRunes().map((rune) => {
              const selected = selectedRuneIds.includes(rune.id);
              const disabled =
                resumableStart !== null || (!selected && selectedRuneIds.length >= 3);

              return (
                <label
                  key={rune.id}
                  className={`starter-rune${selected ? ' starter-rune--selected' : ''}${
                    disabled ? ' starter-rune--disabled' : ''
                  }`}
                >
                  <input
                    className="starter-rune__input"
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() =>
                      setSelectedRuneIds((current) =>
                        current.includes(rune.id)
                          ? current.filter((id) => id !== rune.id)
                          : [...current, rune.id],
                      )
                    }
                  />
                  <span className="starter-rune__indicator" aria-hidden="true" />
                  <span className="starter-rune__content">
                    <span className="starter-rune__name">{rune.name}</span>
                    <span className="starter-rune__description">
                      Effet avant sélection : {rune.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="starter-select__action-footer">
          {error && (
            <p className="starter-select__error" role="alert">
              {error}
            </p>
          )}
          <p className="starter-select__selection-status" aria-live="polite">
            {selectedStarters.length > 0
              ? `${selectedStarters.map((champion) => champion.name).join(', ')} · ${
                  selectedStarters.length
                }/${unlockedStarterSlots} slot(s) sélectionné`
              : 'Sélectionne un champion pour continuer'}
          </p>
          <button
            className="starter-select__confirm"
            type="button"
            disabled={selectedStarterIds.length === 0 || isStarting || isLoadingDaily}
            onClick={() => void handleConfirm()}
          >
            {isLoadingDaily
              ? 'Chargement du défi…'
              : isStarting
                ? 'Vérification…'
                : resumableStart
                  ? 'Reprendre la partie vérifiée'
                  : 'Confirmer le choix'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChampionCard({
  champion,
  selected,
  disabled,
  onSelect,
}: {
  champion: Champion;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  const statRows: { label: string; value: number }[] = [
    { label: 'PV', value: gameStats.hp },
    { label: 'ATK', value: gameStats.atk },
    { label: 'DEF', value: gameStats.def },
    { label: 'AP', value: gameStats.ap },
    { label: 'VIT', value: gameStats.spd },
    { label: 'CRIT', value: gameStats.crit },
  ];

  return (
    <button
      type="button"
      className={`champion-card${selected ? ' champion-card--selected' : ''}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Choisir ${champion.name}`}
    >
      <div className="champion-card__splash-wrapper">
        <picture>
          <source media="(max-width: 700px)" srcSet={champion.iconUrl} />
          <img
            className="champion-card__splash"
            src={splashUrl}
            alt={champion.name}
            loading="lazy"
            width={1215}
            height={717}
            decoding="async"
            onError={(event) => {
              applyLocalImageFallback(event.currentTarget, champion.iconUrl);
            }}
          />
        </picture>
        <div className="champion-card__splash-overlay" />
      </div>

      <div className="champion-card__info">
        <div className="champion-card__name">{champion.name}</div>
        <div className="champion-card__title-text">{champion.title}</div>

        <div className="champion-card__tags">
          {champion.tags.map((tag) => (
            <span key={tag} className={`champion-card__tag champion-card__tag--${tag}`}>
              {formatChampionTag(tag)}
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

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import { ROUTES } from '@/config/routes';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { getKeystoneRunes } from '@/data/items/runeDatabase';
import { getRequiredStarterCount } from '@/game/run/runStartValidation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { getStarterPersonalization } from '@/services/masteryService';
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
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag, formatNumber } from '@/i18n/format';
import { runeDescription, runeNameFr } from '@/i18n/runes.fr';
import { runPreparationCopy } from '@/i18n/runPreparationContent';

const starterCopy = runPreparationCopy.starter;

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
  const masteryChampions = useMasteryStore((state) => state.champions);
  const masteryUnlockIds = useMemo(
    () => Object.values(masteryChampions).flatMap((mastery) => mastery.unlockedIds),
    [masteryChampions],
  );
  const starterPersonalization = useMemo(
    () => getStarterPersonalization(masteryUnlockIds),
    [masteryUnlockIds],
  );
  const [starterRerollsUsed, setStarterRerollsUsed] = useState(0);
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
    const rerollSeed = selectionSeed + starterRerollsUsed * 2_654_435_761;
    const rng = isDaily ? createDailyRNG() : new SeededRNG(rerollSeed);
    return pickRandom(
      implementedChampions,
      isDaily ? 6 : starterPersonalization.rosterOfferSize,
      rng,
    );
  }, [
    dailyChallenge,
    isDaily,
    isGuest,
    resumableStart,
    selectionSeed,
    starterPersonalization.rosterOfferSize,
    starterRerollsUsed,
  ]);
  const starterSlotLimit =
    resumableStart?.team.length ?? getRequiredStarterCount(isDaily ? 'daily' : 'normal');
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
        setError(starterCopy.dailyAuthoritativeLoadFailed);
      } else {
        const challenge = result.data;
        setDailyChallenge(challenge);
        useDailyRunStore.getState().syncChallenge(challenge);
        const pending = useRunStore.getState().pendingAuthorityStart;
        if (
          pending &&
          pending.ownerUserId === user?.id &&
          pending.mode === 'daily' &&
          (pending.team.length !== 1 ||
            pending.team.some((championId) => !challenge.starterIds.includes(championId)))
        ) {
          useRunStore.setState({ pendingAuthorityStart: null });
          setSelectedStarterIds([]);
          setSelectedRuneIds([]);
          setError(starterCopy.dailyOfferChanged);
        }
      }
      setIsLoadingDaily(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isDaily, isGuest, isInitialized, user?.id]);

  async function handleConfirm() {
    playUIClick();
    if (selectedStarterIds.length !== starterSlotLimit) return;
    setError(null);
    setIsStarting(true);

    if (isDaily) {
      if (hasCompletedToday && !resumableStart) {
        setError(starterCopy.dailyUsed);
        setIsStarting(false);
        return;
      }
      if (!isGuest && (!dailyChallenge || (dailyChallenge.hasAttempted && !resumableStart))) {
        setError(
          dailyChallenge?.hasAttempted ? starterCopy.dailyUsed : starterCopy.dailyUnavailable,
        );
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
        if (result.code === 'daily_starter_not_offered') {
          const refreshed = await new SupabaseDailyRunRepository(supabase).getDailyChallenge();
          if (refreshed.data && !refreshed.error) {
            setDailyChallenge(refreshed.data);
            useDailyRunStore.getState().syncChallenge(refreshed.data);
          }
          setSelectedStarterIds([]);
          setSelectedRuneIds([]);
          setError(starterCopy.dailyOfferChanged);
        } else {
          setError(starterCopy.startFailures[result.code]);
        }
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
        setError(starterCopy.startFailures[result.code]);
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
      if (current.length >= starterSlotLimit) {
        setError(starterCopy.selectionLimit(starterSlotLimit));
        return current;
      }
      return [...current, championId];
    });
  }

  function rerollStarterOffer() {
    if (isDaily || resumableStart || starterRerollsUsed >= starterPersonalization.rerolls) return;
    playUIClick();
    setSelectedStarterIds([]);
    setError(null);
    setStarterRerollsUsed((used) => used + 1);
  }

  return (
    <div className="starter-select">
      <header className="starter-select__header">
        <button type="button" className="starter-select__back" onClick={handleBack}>
          {starterCopy.back}
        </button>
        <h1 className="starter-select__title">
          {isDaily ? starterCopy.dailyTitle : starterCopy.normalTitle}
        </h1>
        <span className="starter-select__header-spacer" aria-hidden="true" />
      </header>
      <p className="starter-select__subtitle">
        {resumableStart
          ? starterCopy.resumableSubtitle
          : isDaily
            ? starterCopy.dailySubtitle
            : starterCopy.normalSubtitle(starterSlotLimit, isGuest)}
      </p>

      <div className="starter-select__journey" aria-label={starterCopy.journeyLabel}>
        <span className="starter-select__journey-step starter-select__journey-step--active">
          <b>01</b> {starterCopy.journeyTeam}
        </span>
        <span className="starter-select__journey-line" aria-hidden="true" />
        <span className="starter-select__journey-step">
          <b>02</b> {starterCopy.journeyRunes}
        </span>
        <span className="starter-select__journey-line" aria-hidden="true" />
        <span className="starter-select__journey-step">
          <b>03</b> {starterCopy.journeyStart}
        </span>
      </div>

      <div className="starter-select__grid">
        {choices.map((champ) => (
          <ChampionCard
            key={champ.id}
            champion={champ}
            selected={selectedStarterIds.includes(champ.id)}
            disabled={
              resumableStart !== null ||
              (!selectedStarterIds.includes(champ.id) &&
                selectedStarterIds.length >= starterSlotLimit)
            }
            onSelect={() => toggleStarter(champ.id)}
          />
        ))}
      </div>

      {!isDaily && !resumableStart && starterPersonalization.rerolls > 0 && (
        <button
          type="button"
          className="starter-select__back"
          disabled={starterRerollsUsed >= starterPersonalization.rerolls}
          onClick={rerollStarterOffer}
        >
          {starterCopy.rerollRoster(starterPersonalization.rerolls - starterRerollsUsed)}
        </button>
      )}

      <div className="starter-select__actions">
        <fieldset className="starter-select__runes" aria-describedby="starter-runes-help">
          <legend className="starter-select__runes-title">{starterCopy.chooseRunes}</legend>
          <div className="starter-select__runes-heading">
            <p id="starter-runes-help">{starterCopy.runesHelp}</p>
            <output className="starter-select__runes-count" aria-live="polite">
              {starterCopy.selectedRunes(selectedRuneIds.length, 3)}
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
                  <span
                    className={`starter-rune__icon starter-rune__icon--${rune.path}`}
                    aria-hidden="true"
                  >
                    <span className="starter-rune__icon-fallback">✦</span>
                    <img
                      src={rune.iconUrl}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  </span>
                  <span className="starter-rune__content">
                    <span className="starter-rune__name">{runeNameFr(rune.id, rune.name)}</span>
                    <span className="starter-rune__description">
                      {starterCopy.effectBeforeSelection}:{' '}
                      {runeDescription(rune.id, rune.description)}
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
              ? starterCopy.selectedTeam(
                  selectedStarters.map((champion) => localizeChampion(champion).name),
                  selectedStarters.length,
                  starterSlotLimit,
                )
              : starterCopy.emptySelection}
          </p>
          <button
            className="starter-select__confirm"
            type="button"
            disabled={
              selectedStarterIds.length !== starterSlotLimit || isStarting || isLoadingDaily
            }
            onClick={() => void handleConfirm()}
          >
            {isLoadingDaily
              ? starterCopy.loadingDaily
              : isStarting
                ? starterCopy.verifying
                : resumableStart
                  ? starterCopy.resumeVerifiedRun
                  : starterCopy.confirmChoice}
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
  const localizedChampion = localizeChampion(champion);
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  const statRows: { label: string; value: number }[] = [
    { label: starterCopy.statLabels.hp, value: gameStats.hp },
    { label: starterCopy.statLabels.attack, value: gameStats.atk },
    { label: starterCopy.statLabels.defense, value: gameStats.def },
    { label: starterCopy.statLabels.abilityPower, value: gameStats.ap },
    { label: starterCopy.statLabels.speed, value: gameStats.spd },
    { label: starterCopy.statLabels.critical, value: gameStats.crit },
  ];

  return (
    <button
      type="button"
      className={`champion-card${selected ? ' champion-card--selected' : ''}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={starterCopy.chooseChampion(localizedChampion.name)}
      data-selected-label={selected ? starterCopy.selectedChampionBadge : undefined}
    >
      <div className="champion-card__splash-wrapper">
        <picture>
          <source media="(max-width: 700px)" srcSet={champion.iconUrl} />
          <img
            className="champion-card__splash"
            src={splashUrl}
            alt={localizedChampion.name}
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
        <div className="champion-card__name">{localizedChampion.name}</div>
        <div className="champion-card__title-text">{localizedChampion.title}</div>

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
              <span className="champion-card__stat-value">{formatNumber(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

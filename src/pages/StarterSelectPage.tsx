import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  accessOrder,
  ChampionAccessBadge,
  ChampionAccessControls,
  type ChampionAccessFilter,
  type ChampionAccessSort,
  ChampionEconomyPanel,
  ChampionPurchaseAction,
  ChampionRotationBonus,
  championMatchesAccess,
} from '@/components/ChampionEconomy';
import { Dialog } from '@/components/ui/Feedback';
import { DDRAGON_CONFIG } from '@/config/ddragon';
import { ROUTES } from '@/config/routes';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { getKeystoneRunes } from '@/data/items/runeDatabase';
import { getRequiredStarterCount } from '@/game/run/runStartValidation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useChampionEconomyRoute } from '@/hooks/useChampionEconomyRoute';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { locale } from '@/i18n/fr';
import { getStarterPersonalization } from '@/services/masteryService';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
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
import { DatabaseChampionDetail } from './database/DatabaseChampionDetail';
import { normalizeChampionSearch, starterCatalogPage } from './starter/catalogView';
import '@/styles/database.css';

const starterCopy = runPreparationCopy.starter;
const economyCopy = getChampionEconomyContent();

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
  const economy = useChampionEconomyRoute();
  const economyRoster = !!economy.snapshot?.enabled && !isDaily && !resumableStart;
  const economyNotLoaded = isSupabaseConfigured && !economy.snapshot && !resumableStart && !isDaily;
  const [accessFilter, setAccessFilter] = useState<ChampionAccessFilter>('available');
  const [accessSort, setAccessSort] = useState<ChampionAccessSort>('name');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const teamSlotsRef = useRef<HTMLOListElement>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [catalogPage, setCatalogPage] = useState(1);
  const [previewChampion, setPreviewChampion] = useState<Champion | null>(null);
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
    if (economyRoster) {
      const catalogIds = new Set(economy.snapshot?.catalog.map((entry) => entry.championId));
      return implementedChampions.filter((champion) => catalogIds.has(champion.id));
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
    economyRoster,
    economy.snapshot?.catalog,
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
  const selectedStarters = selectedStarterIds
    .map((id) => choices.find((champion) => champion.id === id))
    .filter((champion): champion is Champion => champion !== undefined);
  const roles = [...new Set(choices.flatMap((champion) => champion.tags))].sort((a, b) =>
    formatChampionTag(a).localeCompare(formatChampionTag(b), locale),
  );
  const visibleChoices = useMemo(() => {
    const query = normalizeChampionSearch(search);
    return choices
      .filter((champion) => {
        if (economyRoster && !championMatchesAccess(economy.getAccess(champion.id), accessFilter))
          return false;
        if (roleFilter !== 'all' && !champion.tags.some((tag) => tag === roleFilter)) return false;
        const localized = localizeChampion(champion);
        return (
          !query ||
          normalizeChampionSearch(
            [localized.name, localized.title, ...champion.tags.map(formatChampionTag)].join(' '),
          ).includes(query)
        );
      })
      .sort(
        (left, right) =>
          (economyRoster && accessSort === 'access'
            ? accessOrder[economy.getAccess(left.id)] - accessOrder[economy.getAccess(right.id)]
            : 0) || localizeChampion(left).name.localeCompare(localizeChampion(right).name, locale),
      );
  }, [
    choices,
    search,
    roleFilter,
    economyRoster,
    economy.getAccess,
    economy.serverNow,
    accessFilter,
    accessSort,
  ]);
  const pagedCatalog = starterCatalogPage(visibleChoices, catalogPage);

  useEffect(() => {
    if (!economyRoster) return;
    setSelectedStarterIds((current) => {
      const next = current.filter((id) => economy.getAccess(id) !== 'locked');
      return next.length === current.length ? current : next;
    });
  }, [economyRoster, economy.getAccess, economy.serverNow]);

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
    if (economyNotLoaded) return;
    if (economyRoster && selectedStarterIds.some((id) => economy.getAccess(id) === 'locked')) {
      setSelectedStarterIds((current) =>
        current.filter((id) => economy.getAccess(id) !== 'locked'),
      );
      setError(economyCopy.rotationExpired);
      void economy.refresh();
      return;
    }
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

  function removeStarter(championId: string, slotIndex: number) {
    toggleStarter(championId);
    window.requestAnimationFrame(() => {
      const remainingButtons = teamSlotsRef.current?.querySelectorAll<HTMLButtonElement>('button');
      const nextButton = remainingButtons?.[Math.min(slotIndex, remainingButtons.length - 1)];
      (nextButton ?? searchRef.current)?.focus();
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
    <main className="starter-select">
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

      <div className="starter-select__workspace">
        <aside
          className="starter-select__loadout starter-select__actions"
          aria-labelledby="starter-team-title"
        >
          <div className="starter-select__team-heading">
            <h2 id="starter-team-title">{starterCopy.teamTitle}</h2>
            <span>
              {formatNumber(selectedStarterIds.length)}/{formatNumber(starterSlotLimit)}
            </span>
          </div>
          <ol className="starter-select__team-slots" ref={teamSlotsRef}>
            {Array.from({ length: starterSlotLimit }, (_, index) => {
              const champion = selectedStarters[index];
              return (
                <li key={index} className={champion ? 'is-filled' : ''}>
                  {champion ? (
                    <>
                      <img src={champion.iconUrl} alt="" width={44} height={44} />
                      <span>
                        <strong>{localizeChampion(champion).name}</strong>
                        <small>{champion.tags.map(formatChampionTag).join(' · ')}</small>
                      </span>
                      {!resumableStart && (
                        <button
                          type="button"
                          aria-label={starterCopy.removeChampion(localizeChampion(champion).name)}
                          onClick={() => removeStarter(champion.id, index)}
                        >
                          ×
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="starter-select__slot-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>{starterCopy.emptySlot(index + 1)}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <details className="starter-select__rune-disclosure">
            <summary>
              <span>{starterCopy.optionalRunes}</span>
              <span>{starterCopy.selectedRunes(selectedRuneIds.length, 3)}</span>
            </summary>
            <fieldset className="starter-select__runes" aria-describedby="starter-runes-help">
              <legend className="starter-select__runes-title">{starterCopy.chooseRunes}</legend>
              <div className="starter-select__runes-heading">
                <p id="starter-runes-help">{starterCopy.runesHelp}</p>
                <output className="starter-select__runes-count" aria-live="polite">
                  {formatNumber(selectedRuneIds.length)}/3
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
          </details>
          <details className="starter-select__economy-disclosure" open={economyNotLoaded}>
            <summary>{starterCopy.economyDetails}</summary>
            <ChampionEconomyPanel
              snapshot={economy.snapshot}
              status={economy.status}
              serverNow={economy.serverNow}
              onRefresh={economy.refresh}
            />
          </details>
          {economy.snapshot?.enabled && isDaily && (
            <p className="champion-economy__daily">{economyCopy.dailyExemption}</p>
          )}
        </aside>

        <section className="starter-select__catalog" aria-labelledby="starter-catalog-title">
          <div className="starter-select__catalog-heading">
            <h2 id="starter-catalog-title">{starterCopy.catalogTitle}</h2>
            <p role="status">{starterCopy.results(visibleChoices.length, choices.length)}</p>
          </div>
          <div className="starter-select__search-controls">
            <label htmlFor="starter-search">
              {starterCopy.searchLabel}
              <input
                id="starter-search"
                ref={searchRef}
                type="search"
                value={search}
                placeholder={starterCopy.searchPlaceholder}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCatalogPage(1);
                }}
              />
            </label>
            <label htmlFor="starter-role">
              {starterCopy.roleLabel}
              <select
                id="starter-role"
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setCatalogPage(1);
                }}
              >
                <option value="all">{starterCopy.allRoles}</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {formatChampionTag(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {economyRoster && (
            <ChampionAccessControls
              filter={accessFilter}
              onFilter={(value) => {
                setAccessFilter(value);
                setCatalogPage(1);
              }}
              sort={accessSort}
              onSort={(value) => {
                setAccessSort(value);
                setCatalogPage(1);
              }}
            />
          )}
          <div className="starter-select__grid">
            {pagedCatalog.champions.map((champ) => (
              <div
                className="champion-economy-card"
                key={champ.id}
                id={`starter-economy-${champ.id}`}
                tabIndex={-1}
              >
                <ChampionCard
                  champion={champ}
                  selected={selectedStarterIds.includes(champ.id)}
                  disabled={
                    resumableStart !== null ||
                    economyNotLoaded ||
                    (economyRoster && economy.getAccess(champ.id) === 'locked') ||
                    (!selectedStarterIds.includes(champ.id) &&
                      selectedStarterIds.length >= starterSlotLimit)
                  }
                  onSelect={() => toggleStarter(champ.id)}
                />
                {economyRoster && (
                  <div className="champion-economy-card__status">
                    <ChampionAccessBadge
                      championId={champ.id}
                      snapshot={economy.snapshot}
                      access={economy.getAccess(champ.id)}
                      serverNow={economy.serverNow}
                    />
                    <ChampionRotationBonus championId={champ.id} />
                  </div>
                )}
                <div className="champion-economy-card__actions">
                  <button
                    className="champion-economy-card__details"
                    type="button"
                    aria-label={economyCopy.details(localizeChampion(champ).name)}
                    onClick={() => setPreviewChampion(champ)}
                  >
                    {starterCopy.detailsShort}
                  </button>
                  {economyRoster && ['locked', 'owned'].includes(economy.getAccess(champ.id)) && (
                    <ChampionPurchaseAction
                      championId={champ.id}
                      championName={localizeChampion(champ).name}
                      returnFocusId={`starter-choice-${champ.id}`}
                      onBeforePurchase={() => {
                        setAccessFilter('all');
                        setRoleFilter('all');
                        setSearch(localizeChampion(champ).name);
                        setCatalogPage(1);
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          {visibleChoices.length === 0 && (
            <div className="starter-select__empty">
              <p role="status">{starterCopy.noResults}</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('all');
                  setAccessFilter('available');
                  setCatalogPage(1);
                }}
              >
                {starterCopy.clearFilters}
              </button>
            </div>
          )}
          {pagedCatalog.pageCount > 1 && (
            <nav className="starter-select__pagination" aria-label={starterCopy.paginationLabel}>
              <button
                type="button"
                disabled={pagedCatalog.page === 1}
                onClick={() => setCatalogPage(pagedCatalog.page - 1)}
              >
                {starterCopy.previousPage}
              </button>
              <span role="status">
                {starterCopy.page(pagedCatalog.page, pagedCatalog.pageCount)}
              </span>
              <button
                type="button"
                disabled={pagedCatalog.page === pagedCatalog.pageCount}
                onClick={() => setCatalogPage(pagedCatalog.page + 1)}
              >
                {starterCopy.nextPage}
              </button>
            </nav>
          )}
          {!isDaily && !resumableStart && !economyRoster && starterPersonalization.rerolls > 0 && (
            <button
              type="button"
              className="starter-select__back"
              disabled={starterRerollsUsed >= starterPersonalization.rerolls}
              onClick={() => {
                rerollStarterOffer();
                setCatalogPage(1);
              }}
            >
              {starterCopy.rerollRoster(starterPersonalization.rerolls - starterRerollsUsed)}
            </button>
          )}
        </section>
      </div>
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
            selectedStarterIds.length !== starterSlotLimit ||
            isStarting ||
            isLoadingDaily ||
            economyNotLoaded
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
      <Dialog
        open={previewChampion !== null}
        title={previewChampion ? economyCopy.details(localizeChampion(previewChampion).name) : ''}
        onClose={() => setPreviewChampion(null)}
        actions={
          <button type="button" onClick={() => setPreviewChampion(null)}>
            {economyCopy.close}
          </button>
        }
      >
        {previewChampion && (
          <div className="champion-economy__preview">
            <DatabaseChampionDetail champion={previewChampion} />
          </div>
        )}
      </Dialog>
    </main>
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
      id={`starter-choice-${champion.id}`}
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

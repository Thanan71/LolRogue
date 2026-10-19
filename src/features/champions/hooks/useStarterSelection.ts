import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { ROUTES } from '@/config/routes';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import type {
  ChampionAccessFilter,
  ChampionAccessSort,
} from '@/features/champion-economy/application/championAccessView';
import { dailyRunApplication } from '@/features/daily/application/dailyRunApplication';
import { getRequiredStarterCount } from '@/game/run/runStartValidation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useChampionEconomyRoute } from '@/hooks/useChampionEconomyRoute';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag } from '@/i18n/format';
import { locale } from '@/i18n/fr';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import { getStarterPersonalization } from '@/services/masteryService';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAccountScope } from '@/shared/hooks/useAccountScope';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { Champion } from '@/types/champion';
import type { DailyChallenge } from '@/types/dailyRun';
import { createDailyRNG, getDailySeed } from '@/utils/dailySeed';
import { SeededRNG } from '@/utils/seededRandom';
import { filterStarterCatalog, starterCatalogPage } from '../application/starterCatalog';
import { prepareStarterRun } from '../application/starterPreparation';

const starterCopy = runPreparationCopy.starter;
const economyCopy = getChampionEconomyContent();
export function useStarterSelection(
  daily: Pick<IDailyRunRepository, 'getDailyChallenge'> = dailyRunApplication,
) {
  const location = useLocation();
  const requestedDaily =
    new URLSearchParams(location.search).get('mode') === 'daily' ||
    (location.state as { mode?: string } | null)?.mode === 'daily';
  const {
    isGuest,
    isInitialized,
    isAuthLoading,
    user,
    session,
    accountEpoch,
    captureAccountScope,
  } = useAccountScope();
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
  const [dailyLoadFailed, setDailyLoadFailed] = useState(false);
  const [dailyRefresh, setDailyRefresh] = useState(0);
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
    return rng.pickN(implementedChampions, isDaily ? 6 : starterPersonalization.rosterOfferSize);
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
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const navigate = useAppNavigate();
  const selectedStarters = selectedStarterIds
    .map((id) => choices.find((champion) => champion.id === id))
    .filter((champion): champion is Champion => champion !== undefined);
  const roles = [...new Set(choices.flatMap((champion) => champion.tags))].sort((a, b) =>
    formatChampionTag(a).localeCompare(formatChampionTag(b), locale),
  );
  const visibleChoices = useMemo(() => {
    return filterStarterCatalog(choices, {
      search,
      roleFilter,
      accessFilter,
      accessSort,
      economyRoster,
      getAccess: economy.getAccess,
      localizeChampion,
      formatChampionTag,
      locale,
    });
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
    setDailyChallenge(null);
    setDailyLoadFailed(false);
    if (!isDaily || isGuest) {
      setIsLoadingDaily(false);
      return;
    }
    if (!isInitialized || isAuthLoading) {
      setIsLoadingDaily(true);
      return;
    }

    let cancelled = false;
    const accountIsCurrent = captureAccountScope();
    const isCurrent = () => !cancelled && accountIsCurrent();
    setIsLoadingDaily(true);
    void daily
      .getDailyChallenge()
      .then((result) => {
        if (!isCurrent()) return;
        if (result.error || !result.data) {
          setError(starterCopy.dailyAuthoritativeLoadFailed);
          setDailyLoadFailed(true);
        } else {
          const challenge = result.data;
          setDailyChallenge(challenge);
          useDailyRunStore.getState().syncChallenge(challenge);
          const pending = useRunStore.getState().pendingAuthorityStart;
          if (
            pending &&
            pending.ownerUserId === user?.id &&
            pending.mode === 'daily' &&
            (pending.team.length !== getRequiredStarterCount('daily') ||
              pending.team.some((championId) => !challenge.starterIds.includes(championId)))
          ) {
            useRunStore.setState({ pendingAuthorityStart: null });
            setSelectedStarterIds([]);
            setSelectedRuneIds([]);
            setError(starterCopy.dailyOfferChanged);
          }
        }
        setIsLoadingDaily(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        setError(starterCopy.dailyAuthoritativeLoadFailed);
        setDailyLoadFailed(true);
        setIsLoadingDaily(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    accountEpoch,
    captureAccountScope,
    daily,
    dailyRefresh,
    isAuthLoading,
    isDaily,
    isGuest,
    isInitialized,
    session,
    user,
  ]);

  function retryDaily() {
    if (isLoadingDaily) return;
    setError(null);
    setDailyRefresh((value) => value + 1);
  }

  async function handleConfirm() {
    if (startingRef.current || economyNotLoaded || isLoadingDaily) return;
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
    const accountIsCurrent = captureAccountScope();
    const isCurrent = () => mountedRef.current && accountIsCurrent();
    startingRef.current = true;
    setError(null);
    setIsStarting(true);
    const result = await prepareStarterRun(
      {
        isDaily,
        isGuest,
        resumable: resumableStart !== null,
        hasCompletedToday,
        challenge: dailyChallenge,
        championIds: selectedStarterIds,
        runeIds: selectedRuneIds,
        selectionSeed,
        dailySeed: getDailySeed(),
      },
      { startRun, daily, isCurrent },
    );
    startingRef.current = false;
    if (!mountedRef.current) return;
    setIsStarting(false);
    if (result.status === 'stale') return;
    if (result.status === 'blocked') {
      setError(
        result.code === 'daily_used'
          ? starterCopy.dailyUsed
          : result.code === 'daily_unavailable'
            ? starterCopy.dailyUnavailable
            : starterCopy.startFailures[result.code],
      );
      return;
    }
    if (result.status === 'daily_offer_changed') {
      if (result.challenge) {
        setDailyChallenge(result.challenge);
        useDailyRunStore.getState().syncChallenge(result.challenge);
      }
      setSelectedStarterIds([]);
      setSelectedRuneIds([]);
      setError(starterCopy.dailyOfferChanged);
      return;
    }
    if (isDaily && isGuest) markGuestAttemptStarted();
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

  return {
    isDaily,
    isGuest,
    resumableStart,
    economy,
    economyRoster,
    economyNotLoaded,
    accessFilter,
    setAccessFilter,
    accessSort,
    setAccessSort,
    search,
    setSearch,
    searchRef,
    teamSlotsRef,
    roleFilter,
    setRoleFilter,
    catalogPage,
    setCatalogPage,
    previewChampion,
    setPreviewChampion,
    starterPersonalization,
    starterRerollsUsed,
    choices,
    starterSlotLimit,
    selectedStarterIds,
    selectedRuneIds,
    setSelectedRuneIds,
    selectedStarters,
    roles,
    visibleChoices,
    pagedCatalog,
    error,
    isStarting,
    isLoadingDaily,
    handleConfirm,
    handleBack,
    toggleStarter,
    removeStarter,
    rerollStarterOffer,
    dailyLoadFailed,
    retryDaily,
  };
}

export type StarterSelectionController = ReturnType<typeof useStarterSelection>;

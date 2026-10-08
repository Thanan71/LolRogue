import { create } from 'zustand';
import { CHAMPION_ECONOMY_CATALOG, getChampionAccess } from '@/domain/championEconomy';
import {
  ChampionEconomyError,
  loadChampionEconomy,
  purchaseAccountChampion,
} from '@/services/championEconomyService';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import type {
  ChampionAccess,
  ChampionEconomySnapshot,
  ChampionPurchaseQuote,
  ChampionPurchaseResult,
} from '@/types/championEconomy';

interface ChampionEconomyStore {
  snapshot: ChampionEconomySnapshot | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  purchasingChampionId: string | null;
  userId: string | null;
  initialize(userId: string | null): Promise<void>;
  refresh(): Promise<void>;
  reset(userId?: string | null): void;
  getAccess(championId: string): ChampionAccess;
  getServerNow(): number;
  purchase(championId: string, quote?: ChampionPurchaseQuote): Promise<ChampionPurchaseResult>;
}

let identityGeneration = 0;
let serverAnchor = 0;
let monotonicAnchor = 0;
let activeRefresh: { generation: number; promise: Promise<void> } | null = null;
let pendingPurchase: {
  championId: string;
  quote: ChampionPurchaseQuote;
  commandId: string;
} | null = null;

function captureClock(snapshot: ChampionEconomySnapshot): void {
  serverAnchor = Date.parse(snapshot.serverNow);
  monotonicAnchor = performance.now();
}
function errorCode(error: unknown): string {
  return error instanceof ChampionEconomyError ? error.code : 'economy_unavailable';
}
function legacySnapshot(): ChampionEconomySnapshot {
  return {
    enabled: false,
    economyVersion: 1,
    catalogVersion: 1,
    gameplayRulesetVersion: 21,
    serverNow: new Date().toISOString(),
    rotation: null,
    catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
    wallet: null,
    ownedChampionIds: [],
    firstWinChampionIds: [],
  };
}

/** No wallet, ownership or purchase state is persisted in browser storage. */
export const useChampionEconomyStore = create<ChampionEconomyStore>((set, get) => ({
  snapshot: null,
  status: 'idle',
  error: null,
  purchasingChampionId: null,
  userId: null,
  initialize: async (userId) => {
    if (userId !== get().userId) get().reset(userId);
    if (get().status !== 'ready') await get().refresh();
  },
  reset: (userId = null) => {
    identityGeneration += 1;
    pendingPurchase = null;
    activeRefresh = null;
    serverAnchor = 0;
    set({ snapshot: null, status: 'idle', error: null, purchasingChampionId: null, userId });
  },
  refresh: async () => {
    const generation = identityGeneration;
    if (activeRefresh?.generation === generation) return activeRefresh.promise;
    const promise = (async () => {
      set({ status: 'loading', error: null });
      try {
        const result = isSupabaseConfigured ? await loadChampionEconomy() : legacySnapshot();
        if (generation !== identityGeneration) return;
        const snapshot = get().userId
          ? result
          : { ...result, wallet: null, ownedChampionIds: [], firstWinChampionIds: [] };
        captureClock(snapshot);
        set({ snapshot, status: 'ready', error: null });
      } catch (error) {
        if (generation === identityGeneration) set({ status: 'error', error: errorCode(error) });
      }
    })();
    activeRefresh = { generation, promise };
    await promise;
    if (activeRefresh?.promise === promise) activeRefresh = null;
  },
  getServerNow: () => serverAnchor + Math.max(0, performance.now() - monotonicAnchor),
  getAccess: (championId) => {
    const snapshot = get().snapshot;
    return snapshot ? getChampionAccess(championId, snapshot, get().getServerNow()) : 'locked';
  },
  purchase: async (championId, suppliedQuote) => {
    const state = get();
    if (!state.userId) throw new ChampionEconomyError('authentication_required');
    if (!state.snapshot?.enabled) throw new ChampionEconomyError('champion_economy_disabled');
    if (state.purchasingChampionId) throw new ChampionEconomyError('purchase_in_progress');
    const entry = state.snapshot.catalog.find((candidate) => candidate.championId === championId);
    if (!entry) throw new ChampionEconomyError('invalid_champion');
    const quote = suppliedQuote ?? {
      priceShards: entry.priceShards,
      economyVersion: state.snapshot.economyVersion,
      catalogVersion: state.snapshot.catalogVersion,
    };
    if (quote.economyVersion !== state.snapshot.economyVersion)
      throw new ChampionEconomyError('champion_price_changed');
    const generation = identityGeneration;
    if (
      !pendingPurchase ||
      pendingPurchase.championId !== championId ||
      pendingPurchase.quote.priceShards !== quote.priceShards ||
      pendingPurchase.quote.catalogVersion !== quote.catalogVersion ||
      pendingPurchase.quote.economyVersion !== quote.economyVersion
    ) {
      pendingPurchase = { championId, quote: { ...quote }, commandId: crypto.randomUUID() };
    }
    const commandId = pendingPurchase.commandId;
    set({ purchasingChampionId: championId, error: null });
    try {
      const result = await purchaseAccountChampion(championId, quote, commandId);
      if (generation !== identityGeneration)
        throw new ChampionEconomyError('economy_identity_changed');
      pendingPurchase = null;
      captureClock(result.snapshot);
      set({ snapshot: result.snapshot, status: 'ready' });
      return result;
    } catch (error) {
      const code = errorCode(error);
      if (generation === identityGeneration) {
        if (code !== 'economy_unavailable' && code !== 'invalid_economy_snapshot')
          pendingPurchase = null;
        set({ error: code });
        if (
          code === 'champion_price_changed' ||
          code === 'champion_already_owned' ||
          code === 'insufficient_shards'
        )
          await get().refresh();
      }
      throw error instanceof ChampionEconomyError ? error : new ChampionEconomyError(code);
    } finally {
      if (generation === identityGeneration) set({ purchasingChampionId: null });
    }
  },
}));

import type { ChampionPurchaseQuote } from '@/types/championEconomy';

/** Raw server payloads are validated by the economy service before entering UI state. */
export interface ChampionEconomyRepositoryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface IChampionEconomyRepository {
  getSnapshot(signal: AbortSignal): Promise<ChampionEconomyRepositoryResult>;
  purchaseChampion(
    championId: string,
    quote: ChampionPurchaseQuote,
    commandId: string,
    signal: AbortSignal,
  ): Promise<ChampionEconomyRepositoryResult>;
}

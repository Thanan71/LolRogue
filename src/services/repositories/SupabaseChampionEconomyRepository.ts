import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChampionPurchaseQuote } from '@/types/championEconomy';
import type { Database } from '@/types/database';
import type { IChampionEconomyRepository } from '../interfaces/IChampionEconomyRepository';

/** Authentication, ownership and debit remain entirely enforced by the existing server RPCs. */
export class SupabaseChampionEconomyRepository implements IChampionEconomyRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getSnapshot(signal: AbortSignal) {
    return this.supabase.rpc('get_champion_economy_snapshot').abortSignal(signal);
  }

  async purchaseChampion(
    championId: string,
    quote: ChampionPurchaseQuote,
    commandId: string,
    signal: AbortSignal,
  ) {
    return this.supabase
      .rpc('purchase_champion', {
        p_command_id: commandId,
        p_champion_id: championId,
        p_expected_price: quote.priceShards,
        p_expected_catalog_version: quote.catalogVersion,
      })
      .abortSignal(signal);
  }
}

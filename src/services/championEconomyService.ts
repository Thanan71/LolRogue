import type {
  ChampionEconomySnapshot,
  ChampionPurchaseQuote,
  ChampionPurchaseResult,
} from '@/types/championEconomy';
import { supabase } from './supabaseClient';

export class ChampionEconomyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ChampionEconomyError';
  }
}

const ERROR_CODES = [
  'authentication_required',
  'champion_economy_disabled',
  'invalid_champion',
  'champion_not_purchasable',
  'champion_already_owned',
  'insufficient_shards',
  'champion_price_changed',
  'idempotency_key_reused',
  'champion_locked',
  'champion_rotation_expired',
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function version(value: unknown): value is number {
  return amount(value) && value > 0;
}
function ids(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(value).size === value.length
  );
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Reject malformed/unsafe numeric values before they can become wallet or purchase state. */
export function parseChampionEconomySnapshot(value: unknown): ChampionEconomySnapshot {
  const data = record(value);
  if (
    !data ||
    typeof data.enabled !== 'boolean' ||
    !version(data.economyVersion) ||
    !version(data.catalogVersion) ||
    !version(data.gameplayRulesetVersion) ||
    !instant(data.serverNow) ||
    !ids(data.ownedChampionIds) ||
    !ids(data.firstWinChampionIds) ||
    !Array.isArray(data.catalog)
  ) {
    throw new ChampionEconomyError('invalid_economy_snapshot');
  }
  const catalogIds: string[] = [];
  for (const candidate of data.catalog) {
    const entry = record(candidate);
    if (
      !entry ||
      typeof entry.championId !== 'string' ||
      !entry.championId ||
      !amount(entry.priceShards) ||
      typeof entry.permanentFree !== 'boolean'
    ) {
      throw new ChampionEconomyError('invalid_economy_snapshot');
    }
    catalogIds.push(entry.championId);
  }
  if (new Set(catalogIds).size !== catalogIds.length || catalogIds.length === 0) {
    throw new ChampionEconomyError('invalid_economy_snapshot');
  }
  if (data.wallet !== null) {
    const wallet = record(data.wallet);
    if (
      !wallet ||
      !amount(wallet.shardsBalance) ||
      !amount(wallet.lifetimeEarned) ||
      !amount(wallet.lifetimeSpent) ||
      wallet.lifetimeEarned - wallet.lifetimeSpent !== wallet.shardsBalance
    ) {
      throw new ChampionEconomyError('invalid_economy_snapshot');
    }
  }
  if (data.rotation !== null) {
    const rotation = record(data.rotation);
    if (
      !rotation ||
      typeof rotation.id !== 'string' ||
      !rotation.id ||
      !instant(rotation.startsAt) ||
      !instant(rotation.endsAt) ||
      Date.parse(rotation.startsAt) >= Date.parse(rotation.endsAt) ||
      !ids(rotation.championIds) ||
      !version(rotation.rulesetVersion) ||
      !version(rotation.algorithmVersion) ||
      rotation.rulesetVersion !== data.gameplayRulesetVersion ||
      rotation.championIds.some((id) => !catalogIds.includes(id))
    ) {
      throw new ChampionEconomyError('invalid_economy_snapshot');
    }
  } else if (data.enabled) {
    throw new ChampionEconomyError('invalid_economy_snapshot');
  }
  if (
    data.ownedChampionIds.some((id) => !catalogIds.includes(id)) ||
    data.firstWinChampionIds.some((id) => !catalogIds.includes(id))
  ) {
    throw new ChampionEconomyError('invalid_economy_snapshot');
  }
  return data as unknown as ChampionEconomySnapshot;
}

function businessError(error: { message: string }): ChampionEconomyError {
  return new ChampionEconomyError(
    ERROR_CODES.find((code) => error.message.includes(code)) ?? 'economy_unavailable',
  );
}

export async function loadChampionEconomy(): Promise<ChampionEconomySnapshot> {
  const { data, error } = await supabase.rpc('get_champion_economy_snapshot');
  if (error) throw businessError(error);
  return parseChampionEconomySnapshot(data);
}

export async function purchaseAccountChampion(
  championId: string,
  quote: ChampionPurchaseQuote,
  commandId: string,
): Promise<ChampionPurchaseResult> {
  const { data, error } = await supabase.rpc('purchase_champion', {
    p_command_id: commandId,
    p_champion_id: championId,
    p_expected_price: quote.priceShards,
    p_expected_catalog_version: quote.catalogVersion,
  });
  if (error) throw businessError(error);
  const result = record(data);
  if (!result || typeof result.replayed !== 'boolean')
    throw new ChampionEconomyError('invalid_economy_snapshot');
  return { replayed: result.replayed, snapshot: parseChampionEconomySnapshot(result.snapshot) };
}

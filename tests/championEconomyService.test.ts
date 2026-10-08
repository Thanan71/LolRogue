import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAMPION_ECONOMY_CATALOG, getRotationForInstant } from '@/domain/championEconomy';
import {
  CHAMPION_ECONOMY_REQUEST_TIMEOUT_MS,
  loadChampionEconomy,
  purchaseAccountChampion,
} from '@/services/championEconomyService';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc } }));
const snapshot = {
  enabled: true,
  economyVersion: 1,
  catalogVersion: 1,
  gameplayRulesetVersion: 21,
  serverNow: '2026-10-08T12:00:00Z',
  rotation: getRotationForInstant('2026-10-08T12:00:00Z', 21),
  catalog: CHAMPION_ECONOMY_CATALOG,
  wallet: { shardsBalance: 0, lifetimeEarned: 400, lifetimeSpent: 400 },
  ownedChampionIds: ['Lux'],
  firstWinChampionIds: [],
};
const quote = { priceShards: 400, economyVersion: 1, catalogVersion: 1 };
beforeEach(() => rpc.mockReset());
afterEach(() => vi.useRealTimers());

function reply(response: unknown) {
  rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockResolvedValue(response) });
}

describe('economy API boundary', () => {
  it.each(['load', 'purchase'])(
    'bounds a hanging %s request and preserves the retry contract',
    async (operation) => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      rpc.mockReturnValueOnce({
        abortSignal: (received: AbortSignal) => {
          signal = received;
          return new Promise(() => {});
        },
      });
      const request =
        operation === 'load'
          ? loadChampionEconomy()
          : purchaseAccountChampion('Lux', quote, 'same-command');
      const assertion = expect(request).rejects.toMatchObject({ code: 'economy_unavailable' });
      await vi.advanceTimersByTimeAsync(CHAMPION_ECONOMY_REQUEST_TIMEOUT_MS);
      await assertion;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      reply({ data: operation === 'load' ? snapshot : { replayed: true, snapshot }, error: null });
      if (operation === 'load') await expect(loadChampionEconomy()).resolves.toEqual(snapshot);
      else {
        await expect(purchaseAccountChampion('Lux', quote, 'same-command')).resolves.toMatchObject({
          replayed: true,
        });
        expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
      }
    },
  );
  it('reads a server-dated wallet without providing any browser clock or user identifier', async () => {
    reply({ data: snapshot, error: null });
    await expect(loadChampionEconomy()).resolves.toEqual(snapshot);
    expect(rpc).toHaveBeenCalledWith('get_champion_economy_snapshot');
  });

  it('passes a confirmed quote and command without a client balance or owner authorization', async () => {
    reply({ data: { replayed: true, snapshot }, error: null });
    await expect(purchaseAccountChampion('Lux', quote, 'command')).resolves.toEqual({
      replayed: true,
      snapshot,
    });
    expect(rpc).toHaveBeenCalledWith('purchase_champion', {
      p_command_id: 'command',
      p_champion_id: 'Lux',
      p_expected_price: 400,
      p_expected_catalog_version: 1,
    });
  });

  it.each(['insufficient_shards', 'champion_price_changed', 'champion_already_owned'])(
    'preserves business refusal %s',
    async (code) => {
      reply({ data: null, error: { message: code } });
      await expect(purchaseAccountChampion('Lux', quote, 'command')).rejects.toMatchObject({
        code,
      });
    },
  );

  it('does not expose database internals or accept a malformed purchase response as success', async () => {
    reply({ data: null, error: { message: 'SQL internal account details' } });
    await expect(loadChampionEconomy()).rejects.toMatchObject({ code: 'economy_unavailable' });
    reply({
      data: { replayed: false, snapshot: { ...snapshot, wallet: { shardsBalance: -400 } } },
      error: null,
    });
    await expect(purchaseAccountChampion('Lux', quote, 'command')).rejects.toThrow(
      'invalid_economy_snapshot',
    );
    reply({ data: {}, error: null });
    await expect(purchaseAccountChampion('Lux', quote, 'command')).rejects.toThrow(
      'invalid_economy_snapshot',
    );
  });
});

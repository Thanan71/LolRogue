import { describe, expect, it } from 'vitest';
import {
  parseAdminAttemptItem,
  parseAdminRunAction,
  parseAdminRunItem,
} from '@/pages/admin/runs/adminRunContracts';
import { buildAdminRunExplorerCsv } from '@/pages/admin/runs/adminRunCsv';
import { adminRunRpcFilters, DEFAULT_ADMIN_RUN_FILTERS } from '@/pages/admin/runs/adminRunFilters';
import { adminAttemptFixture, adminRunFixture } from './helpers/adminRunExplorerFixtures';

describe('admin run explorer projection', () => {
  it('keeps known nulls and exact bigint values, stripping every unexpected field', () => {
    const fixture = adminRunFixture({
      durationSeconds: null,
      engineVersion: null,
      difficulty: null,
    });
    const result = parseAdminRunItem({
      ...fixture,
      user_id: 'AUTH_SECRET',
      lease_token: 'LEASE_SECRET',
      run_ledger: { secret: 'RAW' },
    });
    expect(result).toEqual(fixture);
    expect(result.totalDamageDealt).toBe('9007199254740993');
    expect(JSON.stringify(result)).not.toMatch(/AUTH_SECRET|LEASE_SECRET|RAW/);
  });

  it('fails closed on absent values, unsafe integers, mixed populations and invalid teams', () => {
    expect(() =>
      parseAdminRunItem({ ...adminRunFixture(), totalDamageDealt: 9007199254740993 }),
    ).toThrow();
    expect(() => parseAdminRunItem({ ...adminRunFixture(), wavesCompleted: null })).toThrow();
    expect(() =>
      parseAdminRunItem({ ...adminRunFixture(), team: Array(6).fill(adminRunFixture().team[0]) }),
    ).toThrow();
    expect(() => parseAdminRunItem(adminAttemptFixture())).toThrow();
    expect(() => parseAdminAttemptItem({ ...adminAttemptFixture(), status: 'banned' })).toThrow();
  });

  it('projects only safe action fields and never forwards manual traces', () => {
    const safe = {
      sequence: 1,
      kind: 'combat',
      receivedAt: '2026-10-17T10:00:00Z',
      nodeId: 'node-1',
      championId: null,
      itemId: null,
      instanceId: null,
      augmentId: null,
      slot: null,
      combatMode: 'manual',
    };
    expect(
      parseAdminRunAction({
        ...safe,
        actions_json: { token: 'SECRET' },
        payload: { secret: true },
      }),
    ).toEqual(safe);
  });

  it('retains the historical CSV columns and appends verification and version provenance', () => {
    const csv = buildAdminRunExplorerCsv(
      [adminRunFixture({ username: '=1+1', displayName: 'Étoile雪' })],
      'runs',
      'fr-FR',
    );
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('Étoile雪');
    expect(csv).toContain('9007199254740993');
    expect(csv.split('\r\n')[0].match(/","/g)).toHaveLength(34);
    expect(csv).toContain('Vérification');
    expect(() => buildAdminRunExplorerCsv([adminAttemptFixture()], 'runs', 'fr-FR')).toThrow();
    expect(buildAdminRunExplorerCsv([adminAttemptFixture()], 'attempts', 'en-US')).toContain(
      'pending_choice',
    );
  });
});

describe('admin run server filters', () => {
  it('builds typed filters with explicit UTC and validates intervals and IDs', () => {
    const filters = {
      ...DEFAULT_ADMIN_RUN_FILTERS,
      from: '2026-10-17T00:00',
      to: '2026-10-18T00:00',
      minWaves: '10',
      maxWaves: '20',
      championId: 'Veigar',
    };
    expect(adminRunRpcFilters(filters, 'runs')).toMatchObject({
      from: '2026-10-17T00:00:00.000Z',
      to: '2026-10-18T00:00:00.000Z',
      minWaves: 10,
      maxWaves: 20,
    });
    expect(() => adminRunRpcFilters({ ...filters, playerId: 'x) OR true' }, 'runs')).toThrow();
    expect(() => adminRunRpcFilters({ ...filters, minWaves: '21' }, 'runs')).toThrow();
    expect(() => adminRunRpcFilters({ ...filters, to: filters.from }, 'runs')).toThrow();
  });

  it('keeps population-specific choices in memory without submitting unavailable dimensions', () => {
    const filters = {
      ...DEFAULT_ADMIN_RUN_FILTERS,
      minWaves: '8',
      biome: 'jungle',
      ledgerVersion: '2',
      progressionVersion: '3',
      verification: 'verified' as const,
      status: 'rejected' as const,
    };
    expect(adminRunRpcFilters(filters, 'attempts')).toEqual({
      status: 'rejected',
      progressionVersion: 3,
    });
    expect(adminRunRpcFilters(filters, 'runs')).toMatchObject({
      minWaves: 8,
      biome: 'jungle',
      ledgerVersion: 2,
      verification: 'verified',
    });
    expect(adminRunRpcFilters(filters, 'runs')).not.toHaveProperty('status');
  });
});

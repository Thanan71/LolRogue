import { parseAdminBalanceConfig } from '@/features/administration/domain/balance/adminBalanceConfigParser';
import { describeAdminBalanceWinRate } from '@/features/administration/domain/balance/adminBalanceStatistics';
import { parseAdminBalanceTrees } from '@/features/administration/domain/balance/adminTreeReportParser';
import { balanceConfigFixture } from './fixtures/adminBalanceUi';
import { balanceTreeFixture } from './fixtures/adminTreeUi';

describe('TREE-10 bounded and privacy-aware aggregates', () => {
  it('parses exact receipts and suppresses low-population rates rather than inventing exposure', () => {
    const fixture = balanceTreeFixture();
    expect(parseAdminBalanceTrees(fixture, fixture.filters)).toEqual(fixture);
    expect(fixture.builds[0].winRate).toBeNull();
    expect(fixture.purchases.nodes[0].purchaserShare).toBeNull();
  });
  it('admits Wilson only for at least 30 independent complete observations', () => {
    const fixture = balanceTreeFixture();
    fixture.population = { verifiedRuns: 30, uniquePlayers: 30 };
    fixture.builds[0] = {
      ...fixture.builds[0],
      runs: 30,
      players: 30,
      wins: 15,
      winRate: 0.5,
      interval95: describeAdminBalanceWinRate(15, 30, 30).interval95,
      insufficientSample: false,
      rateStatus: 'descriptive',
    };
    expect(parseAdminBalanceTrees(fixture).builds[0].interval95).not.toBeNull();
    fixture.population = { verifiedRuns: 100, uniquePlayers: 30 };
    fixture.builds[0] = {
      ...fixture.builds[0],
      runs: 100,
      players: 30,
      wins: 50,
      interval95: null,
      rateStatus: 'repeated_players',
    };
    expect(parseAdminBalanceTrees(fixture).builds[0].winRate).toBe(0.5);
    fixture.builds[0].interval95 = { lower: 0.4, upper: 0.6 };
    expect(() => parseAdminBalanceTrees(fixture)).toThrow();
  });
  it('never assigns a rate to a partial snapshot even with a large population', () => {
    const fixture = balanceTreeFixture();
    fixture.population = { verifiedRuns: 100, uniquePlayers: 100 };
    fixture.builds[0] = {
      ...fixture.builds[0],
      state: 'partial',
      runs: 100,
      players: 100,
      wins: 50,
    };
    expect(parseAdminBalanceTrees(fixture).builds[0].winRate).toBeNull();
    fixture.builds[0].winRate = 0.5;
    expect(() => parseAdminBalanceTrees(fixture)).toThrow();
  });
  it.each([
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.purchases.commands = 3;
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.purchases.nodes[0].players = 3;
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.purchases.nodes[0].purchaserShare = 0.5;
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.purchases.spent = 41;
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.builds[0].contextId = 'orphan';
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.builds[0].nodeIds = [];
    },
    (f: ReturnType<typeof balanceTreeFixture>) => {
      f.cardinality.totalBuilds = 201;
      f.cardinality.buildsTruncated = true;
    },
  ])(
    'rejects unreconciled counts, invented rates, orphan identities or incomplete cardinality',
    (mutate) => {
      const fixture = balanceTreeFixture();
      mutate(fixture);
      expect(() => parseAdminBalanceTrees(fixture)).toThrow();
    },
  );
  it('rejects PII-shaped additions and a mismatched echoed date window', () => {
    const fixture = balanceTreeFixture();
    expect(() => parseAdminBalanceTrees({ ...fixture, user_id: 'private' })).toThrow();
    expect(() =>
      parseAdminBalanceTrees(fixture, { ...fixture.filters, to: '2026-10-18' }),
    ).toThrow();
  });
  it('accepts newly available tree metadata while retaining historical config compatibility', () => {
    const fixture = balanceConfigFixture();
    expect(parseAdminBalanceConfig(fixture).trees.status).toBe('dependency_unavailable');
    fixture.trees = { status: 'available', catalogVersion: 4, contractSchemaVersion: 1 };
    expect(parseAdminBalanceConfig(fixture).trees).toEqual(fixture.trees);
  });
});

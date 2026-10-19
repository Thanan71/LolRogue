import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdminBalanceBuilds,
  fetchAdminBalanceChampions,
  fetchAdminBalanceConfig,
  parseAdminBalanceBuilds,
  parseAdminBalanceChampions,
  parseAdminBalanceConfig,
  validateAdminBalanceFilters,
} from '@/pages/admin/balance/adminBalanceClient';
import type { BalanceChampionReport } from '@/pages/admin/balance/balanceTypes';
import {
  balanceBuildFixture,
  balanceChampionFixture,
  balanceConfigFixture,
} from './fixtures/adminBalanceUi';

const transport = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc: transport.rpc } }));

beforeEach(() => {
  vi.clearAllMocks();
  transport.rpc.mockReturnValue({ abortSignal: transport.abortSignal });
  transport.abortSignal.mockResolvedValue({ data: balanceChampionFixture(), error: null });
});

describe('balance bounded UTC filters', () => {
  it('accepts exact leap dates and preserves explicit version, mode and champion selectors', () => {
    const filters = {
      from: '2024-01-01',
      to: '2024-12-31',
      engineVersion: 'run-engine-0.2.5',
      gameplayVersion: 24,
      progressionVersion: 3,
      commandVersion: 1,
      contentHash: 'a'.repeat(64),
      mode: 'daily',
      difficulty: 'hard',
      championId: '_Legacy:Champion.1',
    };
    expect(validateAdminBalanceFilters(filters)).toEqual(filters);
  });

  it.each([
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-10-02', to: '2026-10-01' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-10-01T00:00Z', to: '2026-10-01' },
    { from: '2026-10-01', to: '2026-10-01', gameplayVersion: 0 },
    { from: '2026-10-01', to: '2026-10-01', commandVersion: 1.5 },
    { from: '2026-10-01', to: '2026-10-01', gameplayVersion: 32768 },
    { from: '2026-10-01', to: '2026-10-01', championId: ' '.repeat(2) },
    { from: '2026-10-01', to: '2026-10-01', championId: 'a'.repeat(101) },
    { from: '2026-10-01', to: '2026-10-01', contentHash: 'hash' },
    { from: '2026-10-01', to: '2026-10-01', accountAge: 'all' },
    { from: '2026-10-01', to: '2026-10-01', granularity: 'day' },
    { from: '2026-10-01', to: '2026-10-01', device: 'mobile' },
  ])('rejects invalid or unsupported filters %#', (value) => {
    expect(() => validateAdminBalanceFilters(value)).toThrow();
  });
});

describe('balance champion projections and evidence', () => {
  it.each(['2027-01-01', '2027-10-20', '2028-02-29'])(
    'keeps controlled UI observations within their requested UTC window after the fixture creation date: %s',
    (to) => {
      const filters = { from: to, to };
      expect(() =>
        parseAdminBalanceChampions(balanceChampionFixture(filters), filters),
      ).not.toThrow();
      expect(() => parseAdminBalanceBuilds(balanceBuildFixture(filters), filters)).not.toThrow();
    },
  );

  it('keeps absent champions in the full server denominator without inventing metrics', () => {
    const report = balanceChampionFixture();
    expect(parseAdminBalanceChampions(report)).toEqual(report);
    expect(report.rows[0]).toMatchObject({ runs: 0, cohortRuns: 2, meanDamageDealt: null });
  });

  it('accepts no source cohort and an explicitly unknown row selector', () => {
    const empty = balanceChampionFixture();
    empty.segments = [];
    empty.contexts = [];
    empty.rows = [];
    empty.population = { verifiedRuns: 0, uniquePlayers: 0 };
    expect(parseAdminBalanceChampions(empty)).toEqual(empty);
    const unknown = balanceChampionFixture({ ...empty.filters, championId: 'missing' });
    expect(parseAdminBalanceChampions(unknown)).toMatchObject({
      rows: [],
      population: { verifiedRuns: 2 },
    });
  });

  it('keeps starts and verified finishes on independent populations and event clocks', () => {
    const startsOnly = balanceChampionFixture();
    startsOnly.population = { verifiedRuns: 0, uniquePlayers: 0 };
    startsOnly.rows = [];
    startsOnly.contexts = [];
    startsOnly.segments = [];
    expect(parseAdminBalanceChampions(startsOnly).selections.population.starts).toBe(3);
    const finishesOnly = balanceChampionFixture();
    finishesOnly.selections = {
      population: { starts: 0, uniquePlayers: 0 },
      segments: [],
      rows: [],
    };
    expect(parseAdminBalanceChampions(finishesOnly).population.verifiedRuns).toBe(2);
  });

  it.each([
    'missingCount',
    'unknownSegment',
    'badDenominator',
    'badPlayers',
    'badAbsent',
    'missingRow',
    'duplicateRow',
    'mixedVersion',
  ])('fails closed for %s initial selection projections', (fault) => {
    const data = balanceChampionFixture();
    if (fault === 'missingCount') Reflect.deleteProperty(data.selections.rows[0], 'starts');
    if (fault === 'unknownSegment') data.selections.rows[0].segmentId = 'missing';
    if (fault === 'badDenominator') data.selections.rows[0].cohortStarts = 2;
    if (fault === 'badPlayers') data.selections.rows[0].players = 2;
    if (fault === 'badAbsent') data.selections.rows[0].starts = 1;
    if (fault === 'missingRow') data.selections.rows = [];
    if (fault === 'duplicateRow') data.selections.rows.push({ ...data.selections.rows[0] });
    if (fault === 'mixedVersion') data.selections.segments[0].gameplayVersion = null;
    expect(() => parseAdminBalanceChampions(data)).toThrow();
  });

  it('projects requested filters strictly even when object property order differs', () => {
    const report = balanceChampionFixture({ from: '2026-10-01', to: '2026-10-17', mode: 'daily' });
    expect(
      parseAdminBalanceChampions(report, { mode: 'daily', to: '2026-10-17', from: '2026-10-01' }),
    ).toEqual(report);
    expect(() =>
      parseAdminBalanceChampions(report, { ...report.filters, difficulty: 'hard' }),
    ).toThrow();
  });

  it.each([
    [
      'missingCount',
      (data: BalanceChampionReport) => {
        Reflect.deleteProperty(data.rows[0], 'players');
      },
    ],
    [
      'NaN',
      (data: BalanceChampionReport) => {
        data.rows[0].runs = Number.NaN;
      },
    ],
    [
      'unsafeInteger',
      (data: BalanceChampionReport) => {
        data.population.verifiedRuns = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'partialIdentity',
      (data: BalanceChampionReport) => {
        data.segments[0].commandVersion = null;
      },
    ],
    [
      'mixedIdentity',
      (data: BalanceChampionReport) => {
        data.filters.difficulty = 'hard';
      },
    ],
    [
      'missingContext',
      (data: BalanceChampionReport) => {
        data.rows[0].contextId = 'missing';
      },
    ],
    [
      'missingRow',
      (data: BalanceChampionReport) => {
        data.rows = [];
      },
    ],
    [
      'duplicateRow',
      (data: BalanceChampionReport) => {
        data.rows.push({ ...data.rows[0] });
      },
    ],
    [
      'wrongCohort',
      (data: BalanceChampionReport) => {
        data.rows[0].cohortRuns = 1;
      },
    ],
    [
      'excessWins',
      (data: BalanceChampionReport) => {
        data.rows[0].wins = 1;
      },
    ],
    [
      'excessSurvival',
      (data: BalanceChampionReport) => {
        data.rows[0].survived = 1;
      },
    ],
    [
      'inventedZero',
      (data: BalanceChampionReport) => {
        data.rows[0].meanDamageDealt = 0;
      },
    ],
    [
      'infiniteMetric',
      (data: BalanceChampionReport) => {
        data.rows[1].meanHealingDone = Infinity;
      },
    ],
    [
      'missingLedgerMetric',
      (data: BalanceChampionReport) => {
        data.rows[1].meanHealingDone = null;
      },
    ],
    [
      'duplicateContext',
      (data: BalanceChampionReport) => {
        data.contexts.push({ ...data.contexts[0] });
      },
    ],
    [
      'duplicateIdentity',
      (data: BalanceChampionReport) => {
        data.segments.push({ ...data.segments[0], id: 'other' });
      },
    ],
    [
      'unknownContextVersion',
      (data: BalanceChampionReport) => {
        data.contexts[0].segmentId = 'missing';
      },
    ],
    [
      'emptyComposition',
      (data: BalanceChampionReport) => {
        data.contexts[0].initialComposition = [];
      },
    ],
    [
      'oversizedComposition',
      (data: BalanceChampionReport) => {
        data.contexts[0].initialComposition = ['a', 'b', 'c', 'd', 'e', 'f'];
      },
    ],
    [
      'duplicateRune',
      (data: BalanceChampionReport) => {
        data.contexts[0].runeIds = ['a', 'a'];
      },
    ],
    [
      'localTimestamp',
      (data: BalanceChampionReport) => {
        data.snapshotAt = '2026-10-18T12:00:00';
      },
    ],
    [
      'falseCalendar',
      (data: BalanceChampionReport) => {
        data.snapshotAt = '2026-02-30T12:00:00Z';
      },
    ],
    [
      'futureWindow',
      (data: BalanceChampionReport) => {
        data.snapshotAt = '2026-09-01T12:00:00Z';
      },
    ],
  ] as const)('rejects contradictory or incomplete %s data', (_name, mutate) => {
    const data = balanceChampionFixture();
    mutate(data);
    expect(() => parseAdminBalanceChampions(data)).toThrow();
  });

  it('rejects extra private fields, unsupported DPS and excessive server projection sizes', () => {
    const data = balanceChampionFixture();
    expect(() => parseAdminBalanceChampions({ ...data, player_id: 'private' })).toThrow();
    expect(() =>
      parseAdminBalanceChampions({ ...data, metrics: { ...data.metrics, dps: 'calculated' } }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceChampions({ ...data, rows: Array(1025).fill(data.rows[0]) }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceChampions({ ...data, segments: Array(33).fill(data.segments[0]) }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceChampions({ ...data, contexts: Array(129).fill(data.contexts[0]) }),
    ).toThrow();
  });

  it('treats composition and rune identity as sets across database collations', () => {
    const data = balanceChampionFixture();
    data.contexts[0].initialComposition = ['garen', 'Ahri'];
    expect(parseAdminBalanceChampions(data)).toEqual(data);
    data.contexts.push({
      ...data.contexts[0],
      id: 'e'.repeat(32),
      initialComposition: ['Ahri', 'garen'],
    });
    expect(() => parseAdminBalanceChampions(data)).toThrow();
  });

  it('refuses a partial known champion grid across comparable contexts', () => {
    const data = balanceChampionFixture();
    data.population.verifiedRuns = 4;
    const secondContext = 'e'.repeat(32);
    data.contexts.push({ ...data.contexts[0], id: secondContext, runeIds: ['rune-a'] });
    data.rows.push({ ...data.rows[1], contextId: secondContext });
    expect(() => parseAdminBalanceChampions(data)).toThrow();
  });
});

describe('balance observed build identities', () => {
  it('keeps partial legacy items distinct from trusted empty and never claims exposure', () => {
    const report = balanceBuildFixture();
    expect(parseAdminBalanceBuilds(report)).toEqual(report);
    expect(report.rows[1]).toMatchObject({ state: 'partial', ids: [] });
    expect(report.rows[2]).toMatchObject({ state: 'empty', ids: [] });
  });

  it('keeps an unknown public augment ID visible without guessing its effect', () => {
    const report = balanceBuildFixture();
    report.rows[3].ids = ['future:augment'];
    report.rows[3].unknownIds = ['future:augment'];
    report.rows[3].state = 'observed';
    expect(parseAdminBalanceBuilds(report)).toEqual(report);
  });

  it('preserves augment stacks without treating repeated acquisition as malformed or conflating builds', () => {
    const report = balanceBuildFixture();
    report.rows[3].ids = ['augment-a', 'augment-a'];
    report.rows[3].unknownIds = ['augment-a'];
    report.rows[3].state = 'observed';
    report.rows[3].runs = 1;
    report.rows.push({ ...report.rows[3], ids: ['augment-a'], wins: 0 });
    expect(parseAdminBalanceBuilds(report)).toEqual(report);
    report.rows[3].ids = Array(21).fill('augment-a');
    expect(() => parseAdminBalanceBuilds(report)).toThrow();
  });

  it('still rejects duplicate item and rune identities', () => {
    const items = balanceBuildFixture();
    items.rows[0].ids = ['sword', 'sword'];
    expect(() => parseAdminBalanceBuilds(items)).toThrow();
    const runes = balanceBuildFixture();
    runes.rows[2].ids = ['rune-a', 'rune-a'];
    runes.rows[2].state = 'observed';
    expect(() => parseAdminBalanceBuilds(runes)).toThrow();
  });

  it.each([
    'missingRuneRow',
    'duplicateBuild',
    'unknownOutsideIdentity',
    'itemCatalogClaim',
    'falseEmpty',
    'falseObserved',
    'missingMember',
    'wrongMember',
    'excessItemGroups',
  ])('fails closed for %s build data', (fault) => {
    const data = balanceBuildFixture();
    if (fault === 'missingRuneRow') data.rows = data.rows.filter((row) => row.kind !== 'runes');
    if (fault === 'duplicateBuild') data.rows.push({ ...data.rows[0] });
    if (fault === 'unknownOutsideIdentity') data.rows[3].unknownIds = ['missing'];
    if (fault === 'itemCatalogClaim') data.rows[0].unknownIds = ['sword'];
    if (fault === 'falseEmpty') data.rows[0].state = 'empty';
    if (fault === 'falseObserved') data.rows[1].state = 'observed';
    if (fault === 'missingMember') data.rows[0].championId = null;
    if (fault === 'wrongMember') data.rows[2].championId = 'garen';
    if (fault === 'excessItemGroups') data.rows[1].runs = 2;
    expect(() => parseAdminBalanceBuilds(data)).toThrow();
  });
});

describe('read-only balance policy projection', () => {
  it('accepts live known policy and unavailable flags without inventing values', () => {
    const data = balanceConfigFixture();
    expect(parseAdminBalanceConfig(data)).toEqual(data);
    data.championEconomy = null;
    data.gameplayRulesets = [];
    data.progressionRulesets = [];
    expect(parseAdminBalanceConfig(data)).toEqual(data);
  });

  it('refuses invented TREE-10 availability, writes or unsupported metrics', () => {
    const data = balanceConfigFixture();
    expect(() => parseAdminBalanceConfig({ ...data, readOnly: false })).toThrow();
    expect(() =>
      parseAdminBalanceConfig({ ...data, trees: { status: 'enabled', dependency: 'TREE-10' } }),
    ).toThrow();
    expect(() => parseAdminBalanceConfig({ ...data, unsupportedMetrics: ['dps'] })).toThrow();
    expect(() => parseAdminBalanceConfig({ ...data, mutationToken: 'private' })).toThrow();
    expect(() => parseAdminBalanceConfig({ ...data, championEconomy: undefined })).toThrow();
  });

  it('rejects duplicate rules, multiple active versions, excess volume and future flag dates', () => {
    const data = balanceConfigFixture();
    expect(() =>
      parseAdminBalanceConfig({
        ...data,
        gameplayRulesets: [...data.gameplayRulesets, data.gameplayRulesets[0]],
      }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceConfig({
        ...data,
        progressionRulesets: [
          ...data.progressionRulesets,
          { version: 4, code: 'v4', active: true },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceConfig({
        ...data,
        progressionRulesets: Array(129).fill(data.progressionRulesets[0]),
      }),
    ).toThrow();
    expect(() =>
      parseAdminBalanceConfig({
        ...data,
        championEconomy: { ...data.championEconomy, updatedAt: '2026-10-19T00:00:00Z' },
      }),
    ).toThrow();
  });
});

describe('admin balance read transport', () => {
  it('sends one read-only, abortable RPC with the exact filters and snapshot', async () => {
    const data = balanceChampionFixture();
    const signal = new AbortController().signal;
    expect(await fetchAdminBalanceChampions(data.filters, signal, data.snapshotAt)).toEqual(data);
    expect(transport.rpc).toHaveBeenCalledWith('admin_balance_champions', {
      p_filters: data.filters,
      p_snapshot: data.snapshotAt,
    });
    expect(transport.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('keeps build and config reads distinct with no mutation API', async () => {
    const signal = new AbortController().signal;
    transport.abortSignal.mockResolvedValueOnce({ data: balanceBuildFixture(), error: null });
    await expect(fetchAdminBalanceBuilds(balanceBuildFixture().filters, signal)).resolves.toEqual(
      balanceBuildFixture(),
    );
    expect(transport.rpc).toHaveBeenLastCalledWith('admin_balance_builds', {
      p_filters: balanceBuildFixture().filters,
      p_snapshot: undefined,
    });
    transport.abortSignal.mockResolvedValueOnce({ data: balanceConfigFixture(), error: null });
    await expect(fetchAdminBalanceConfig(signal)).resolves.toEqual(balanceConfigFixture());
    expect(transport.rpc).toHaveBeenLastCalledWith('admin_balance_config');
  });

  it('preserves live permission errors for shared resource invalidation', async () => {
    const error = { code: '42501', message: 'admin required' };
    transport.abortSignal.mockResolvedValueOnce({ data: null, error });
    await expect(
      fetchAdminBalanceChampions(balanceChampionFixture().filters, new AbortController().signal),
    ).rejects.toEqual(error);
  });

  it('refuses cancelled, stale-filter and wrong-snapshot responses', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchAdminBalanceConfig(controller.signal)).rejects.toThrow();
    expect(transport.rpc).not.toHaveBeenCalled();
    const data = balanceChampionFixture();
    await expect(
      fetchAdminBalanceChampions(
        { ...data.filters, championId: 'ahri' },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      fetchAdminBalanceChampions(
        data.filters,
        new AbortController().signal,
        '2026-10-18T12:00:00.000001Z',
      ),
    ).rejects.toThrow();
  });

  it('ignores a response completing after cancellation even if transport ignores abort', async () => {
    const controller = new AbortController();
    transport.abortSignal.mockImplementationOnce(async () => {
      controller.abort();
      return { data: balanceConfigFixture(), error: null };
    });
    await expect(fetchAdminBalanceConfig(controller.signal)).rejects.toThrow();
  });
});

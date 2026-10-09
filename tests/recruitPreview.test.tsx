// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { ChampionInstance } from '@/game/ChampionInstance';
import { NodeType, type RecruitEncounter, type ShopEncounter } from '@/game/map/types';
import { getRecruitPreview } from '@/game/recruitment/recruitPreview';
import { buildRunPlayerTeam, type RunCombatantRules } from '@/game/run/runCombatant';
import { createRunLedger } from '@/game/run/runLedger';
import { recruitPreviewCopy } from '@/i18n/encounterContent';
import { formatNumber } from '@/i18n/format';
import { RecruitPage } from '@/pages/RecruitPage';
import { ShopPage } from '@/pages/ShopPage';
import { useAuthStore } from '@/stores/authStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { TeamMember } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/components/ParticleBackground', () => ({ ParticleBackground: () => null }));

const TEAM: TeamMember[] = [
  { championId: 'Ashe', level: 9 },
  { championId: 'Soraka', level: 10 },
  { championId: 'Yasuo', level: 11 },
];

const RULES: RunCombatantRules = {
  inventory: [],
  augmentIds: ['vitality_boost'],
  currentBiomeIndex: 0,
  getUnlockedEnhancements: () => ({}),
  getMasteryLevel: () => 0,
};

function enterEncounter(encounter: RecruitEncounter | ShopEncounter) {
  const nodeId = 'preview-node';
  useRunStore.setState({
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId: 'recruit-preview-run',
    seed: 42,
    runLevel: 6,
    team: [...TEAM],
    gold: 1_000,
    augmentIds: [...RULES.augmentIds],
    ledger: createRunLedger(TEAM.map((member) => member.championId)),
    currentBiome: 'top_lane',
    currentNodeId: nodeId,
    chosenPathNodeIds: [nodeId],
    pendingEncounter: { nodeId, nodeType: encounter.type },
    biomeMaps: [
      {
        biome: 'top_lane',
        startNodeId: nodeId,
        exitNodeId: nodeId,
        columns: 1,
        rows: 1,
        nodes: [
          {
            id: nodeId,
            type: encounter.type === 'recruit' ? NodeType.Recruit : NodeType.Shop,
            column: 0,
            row: 0,
            nextNodeIds: [],
            prevNodeIds: [],
            biome: 'top_lane',
            completed: false,
            accessible: false,
            metadata: { title: 'Preview', description: 'Preview', icon: '◇' },
            encounter,
          },
        ],
      },
    ],
  });
}

const RECRUIT: RecruitEncounter = {
  id: 'preview-recruit',
  type: 'recruit',
  name: 'Recruit',
  description: 'Recruit',
  minRunLevel: 1,
  championId: 'Annie',
  cost: 200,
  successChance: 1,
  statMultiplier: 1.2,
};

const SHOP: ShopEncounter = {
  id: 'preview-shop',
  type: 'shop',
  name: 'Shop',
  description: 'Shop',
  minRunLevel: 1,
  items: [],
  priceMultiplier: 1,
  recruitableChampions: [{ championId: 'Annie', cost: 200 }],
};

function frozenAttempt(): RunAuthorityAttempt {
  return {
    attemptId: 'preview-attempt',
    runUuid: 'preview-run',
    ownerUserId: 'preview-user',
    seed: 42,
    rulesetVersion: 21,
    engineVersion: 'preview',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: TEAM.map((member) => member.championId),
    runeIds: [],
    enhancementSnapshot: {},
    masterySnapshot: { annie: 2 },
    startedAt: '2026-10-09T00:00:00.000Z',
    expiresAt: '2026-10-10T00:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'preview',
    finishCommandId: null,
  };
}

beforeEach(() => {
  useSettingsStore.setState({ language: 'fr-FR' });
  useAuthStore.setState({ isGuest: true, user: null, isAuthenticated: true, isInitialized: true });
  useMasteryStore.setState({ champions: {} });
  useEnhancementStore.setState({ enhancements: {} });
});

describe('recruitment preview', () => {
  it('includes progression, recruit quality, mastery, and current run bonuses', () => {
    const preview = getRecruitPreview(
      'Annie',
      6,
      TEAM,
      { ...RULES, getMasteryLevel: () => 2 },
      1.2,
    );
    const champion = championDB.getById('Annie');
    expect(champion).toBeTruthy();
    const runtime = new ChampionInstance(champion!, 9, 1.2);
    runtime.setMasteryLevel(2);
    expect(preview?.level).toBe(9);
    expect(preview?.stats.hp).toBeCloseTo(runtime.getStats().hp + 90);
    expect(preview?.stats.abilityPower).toBeCloseTo(runtime.getStats().abilityPower);
    expect(getRecruitPreview('unknown', 6, TEAM, RULES)).toBeNull();
  });

  it('displays the stats and level actually obtained after a successful recruit', () => {
    enterEncounter(RECRUIT);
    const { container } = render(
      <MemoryRouter>
        <RecruitPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Niveau à l’arrivée : 9')).toBeVisible();
    const displayedStats = new Map(
      [...container.querySelectorAll<HTMLDListElement>('.recruit-page__stats dd')].map((value) => [
        value.dataset.stat,
        value.textContent,
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recruter — 200 or' }));
    const recruited = useRunStore.getState().team.find((member) => member.championId === 'Annie');
    expect(recruited).toMatchObject({ level: 9, statMultiplier: 1.2 });
    const [runtime] = buildRunPlayerTeam([recruited!], RULES);
    const actual = runtime!.getEnhancedStats();
    for (const stat of [
      'hp',
      'mp',
      'attackDamage',
      'abilityPower',
      'armor',
      'magicResist',
    ] as const) {
      expect(displayedStats.get(stat)).toBe(
        formatNumber(actual[stat], { maximumFractionDigits: 0 }),
      );
    }
    expect(displayedStats.get('attackSpeed')).toBe(
      formatNumber(actual.attackSpeed, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    expect(displayedStats.get('crit')).toBe(
      formatNumber(actual.crit / 100, { style: 'percent', maximumFractionDigits: 0 }),
    );
    expect(useRunStore.getState().gold).toBe(800);
  });

  it('lets a shop candidate be inspected before spending', () => {
    enterEncounter(SHOP);
    const { container } = render(
      <MemoryRouter>
        <ShopPage />
      </MemoryRouter>,
    );
    const candidate = screen.getByRole('heading', { name: 'Annie' }).closest('article');
    expect(candidate).toBeTruthy();
    expect(within(candidate!).getByText('Niveau à l’arrivée : 9')).toBeVisible();
    const summary = within(candidate!).getByText(recruitPreviewCopy['fr-FR'].inspect);
    const disclosure = summary.closest('details');
    expect(disclosure).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(disclosure).toHaveAttribute('open');
    expect(within(candidate!).getByRole('list', { name: 'Rôles du champion' })).toBeVisible();
    expect(within(candidate!).getByRole('heading', { name: 'Compétences' })).toBeVisible();
    expect(
      container.querySelector('.shop-card__recruit-stats dd[data-stat="hp"]')?.textContent,
    ).toBe(
      formatNumber(getRecruitPreview('Annie', 6, TEAM, RULES)!.stats.hp, {
        maximumFractionDigits: 0,
      }),
    );
    expect(useRunStore.getState().gold).toBe(1_000);
    expect(useRunStore.getState().team).toEqual(TEAM);
  });

  it('uses the authority mastery snapshot instead of changes made during the run', () => {
    enterEncounter(RECRUIT);
    useRunStore.setState({ authorityAttempt: frozenAttempt() });
    const { container } = render(
      <MemoryRouter>
        <RecruitPage />
      </MemoryRouter>,
    );
    const expected = getRecruitPreview(
      'Annie',
      6,
      TEAM,
      { ...RULES, getMasteryLevel: () => 2 },
      1.2,
    )!;
    const hp = container.querySelector('.recruit-page__stats dd[data-stat="hp"]');
    expect(hp?.textContent).toBe(formatNumber(expected.stats.hp, { maximumFractionDigits: 0 }));
    act(() => {
      useMasteryStore.setState({
        champions: {
          Annie: { ...useMasteryStore.getState().getChampionMastery('Annie'), level: 4 },
        },
      });
    });
    expect(hp?.textContent).toBe(formatNumber(expected.stats.hp, { maximumFractionDigits: 0 }));
  });
});

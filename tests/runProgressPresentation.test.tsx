// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunProgressCounters } from '@/components/RunProgressCounters';
import { RunTeamStatsPanel } from '@/components/RunTeamStatsPanel';
import { veigar } from '@/data/champion/Veigar';
import { championDB } from '@/data/championDatabase';
import { useBattleManager } from '@/features/combat/hooks/useBattleManager';
import { CombatantPortrait } from '@/features/combat/ui/CombatantPortrait';
import { CombatLog } from '@/features/combat/ui/CombatLog';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { combatContent } from '@/i18n/combatContent';
import {
  localizeRunProgressDefinition,
  runProgressBonusText,
  runProgressRules,
  runProgressSummary,
} from '@/i18n/runProgressContent';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { RunProgressionDefinition } from '@/types/champion';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const key = 'veigar.phenomenal_power';
const definition = veigar.passive.runProgression![0];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useBattleStore.getState().resetBattle();
  useRunStore.setState({ authorityAttempt: null });
});

describe('run counter presentation', () => {
  it('renders only declared counters and reads updated snapshots without changing them', () => {
    const custom: RunProgressionDefinition = {
      key: 'test.retained_power',
      name: 'Pouvoir retenu',
      description: 'Un compteur générique.',
      cap: 20,
      statBonuses: { armor: 2, abilityPower: 0.5 },
      onCombatEnd: [{ amount: 2 }],
    };
    const snapshot = Object.freeze({ 'test.retained_power': 4, 'unknown.counter': 100 });
    const view = render(<RunProgressCounters definitions={[custom]} snapshot={snapshot} />);
    expect(view.container.querySelectorAll('[data-counter-key]')).toHaveLength(1);
    expect(screen.getByText('4/20')).toBeVisible();
    expect(screen.getByText('+8 ARM · +2 AP')).toBeVisible();
    expect(snapshot).toEqual({ 'test.retained_power': 4, 'unknown.counter': 100 });
    view.rerender(
      <RunProgressCounters definitions={[custom]} snapshot={{ 'test.retained_power': 6 }} />,
    );
    expect(screen.getByText('6/20')).toBeVisible();
    expect(screen.getByText('+12 ARM · +3 AP')).toBeVisible();
    view.rerender(<RunProgressCounters snapshot={snapshot} />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it.each(['fr-FR', 'en-US'] as const)(
    'uses the declared kill and assist rules, cap and AP bonus in %s',
    (language) => {
      const rules = runProgressRules(definition, language);
      expect(rules).toHaveLength(6);
      expect(rules[0]).toMatch(/boss.*\+10/);
      expect(rules[1]).toMatch(/(?:élite|elite).*\+3/);
      expect(rules[2]).toMatch(/(?:compétence|Ability).*normal.*\+1/);
      const assists = rules.slice(3);
      expect(assists.every((rule) => /(?:Assistance attribuée|Credited assist)/.test(rule))).toBe(
        true,
      );
      expect(assists).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/boss.*\+10/),
          expect.stringMatching(/(?:élite|elite).*\+3/),
          expect.stringMatching(/normal.*\+1/),
        ]),
      );
      expect(runProgressBonusText(definition, 17, language)).toBe('+17 AP');
      expect(runProgressSummary(definition, 17, language)).toContain('17/200, +17 AP');
      expect(combatContent[language].logs.runCounterGain('Veigar', 'Power', 3, 17)).toContain('+3');
      expect(combatContent[language].logs.runCounterGain('Veigar', 'Power', 3, 17)).toContain(
        'total 17',
      );
    },
  );

  it.each(['fr-FR', 'en-US'] as const)(
    'describes the effective historical kill-only kit without promising assist points in %s',
    (language) => {
      const historical = { ...definition, onAssist: undefined };
      const rules = runProgressRules(historical, language);
      expect(rules).toHaveLength(3);
      expect(rules.join(' ')).not.toMatch(/Assistance|assist/);
      expect(localizeRunProgressDefinition(historical, language).description).toContain(
        language === 'fr-FR'
          ? 'Les dégâts et les assistances ne donnent aucun point.'
          : 'Damage and assists grant no points.',
      );
      expect(localizeRunProgressDefinition(definition, language).description).toContain(
        language === 'fr-FR' ? 'assistances qui lui sont attribuées' : 'credited assists',
      );
      expect(definition.onAssist).toHaveLength(3);
    },
  );

  it('renders assist triggers from an unfamiliar counter definition without mutating it', () => {
    const custom: RunProgressionDefinition = {
      key: 'test.assisted_power',
      name: 'Pouvoir partagé',
      description: 'Une règle générique.',
      cap: 30,
      onAssist: [{ targetTier: 'normal', abilityOnly: true, amount: 2 }],
    };
    const original = JSON.stringify(custom);
    render(<RunProgressCounters definitions={[custom]} variant="rules" />);
    expect(
      screen.getByText('Assistance attribuée par compétence sur un ennemi normal : +2'),
    ).toBeVisible();
    expect(JSON.stringify(custom)).toBe(original);
    expect(runProgressRules(custom, 'en-US')).toEqual([
      'Credited ability assist on a normal enemy : +2',
    ]);
  });

  it('omits stat bonuses the canonical runtime ignores', () => {
    const ignored: RunProgressionDefinition = {
      ...definition,
      statBonuses: { abilityPower: undefined, armor: Number.NaN, attackDamage: -1, magicResist: 2 },
    };
    expect(runProgressBonusText(ignored, 3, 'fr-FR')).toBe('+6 RM');
  });

  it('shows persisted run AP in the champion sheet exactly once after normal stat scaling', () => {
    const champion = championDB.getById('Veigar');
    expect(champion?.passive.runProgression).toBeDefined();
    useRunStore.setState({ authorityAttempt: null });
    useEnhancementStore.setState({ enhancements: {} });
    useMasteryStore.setState({ champions: {} });
    const instance = new ChampionInstance(champion!, 5, 1.2, {}, { [key]: 17 });
    const view = render(
      <RunTeamStatsPanel
        team={[{ championId: 'Veigar', level: 5, statMultiplier: 1.2, runProgress: { [key]: 17 } }]}
        inventory={[]}
      />,
    );
    expect(view.container.querySelector('[data-stat="abilityPower"] dd')).toHaveTextContent(
      new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
        instance.getEnhancedStats().abilityPower,
      ),
    );
    expect(view.container.querySelector(`[data-counter-key="${key}"]`)).toHaveAttribute(
      'data-counter-value',
      '17',
    );
    expect(screen.getByText('+17 AP')).toBeVisible();
  });

  it('refreshes champion-sheet assist rules when resuming a frozen v22 attempt', () => {
    const historical: RunAuthorityAttempt = {
      attemptId: '11111111-1111-4111-8111-111111111111',
      runUuid: '22222222-2222-4222-8222-222222222222',
      ownerUserId: '33333333-3333-4333-8333-333333333333',
      seed: 3,
      rulesetVersion: 3,
      gameplayRulesetVersion: 22,
      engineVersion: 'run-engine-v22',
      difficulty: 'normal',
      mode: 'normal',
      initialTeam: ['Veigar', 'Garen'],
      runeIds: [],
      enhancementSnapshot: {},
      masterySnapshot: {},
      startedAt: '2026-10-10T10:00:00Z',
      expiresAt: '2026-10-10T11:00:00Z',
      status: 'started',
      commands: [],
      nextSequence: 1,
      lastAcknowledgedSequence: 0,
      journalHash: 'fixture-journal',
      finishCommandId: null,
    };
    useRunStore.setState({ authorityAttempt: null });
    useEnhancementStore.setState({ enhancements: {} });
    useMasteryStore.setState({ champions: {} });
    const view = render(
      <RunTeamStatsPanel
        team={[{ championId: 'Veigar', runProgress: { [key]: 17 } }]}
        inventory={[]}
      />,
    );
    expect(view.container.querySelectorAll('.run-progress__rules li')).toHaveLength(6);
    act(() => useRunStore.setState({ authorityAttempt: historical }));
    expect(view.container.querySelectorAll('.run-progress__rules li')).toHaveLength(3);
    expect(view.container.querySelector('.run-progress')).toHaveTextContent(
      'Les dégâts et les assistances ne donnent aucun point.',
    );
    expect(view.container.querySelector(`[data-counter-key="${key}"]`)).toHaveAttribute(
      'data-counter-value',
      '17',
    );
    act(() => useRunStore.setState({ authorityAttempt: null }));
    expect(view.container.querySelectorAll('.run-progress__rules li')).toHaveLength(6);
  });

  it('syncs a real credited assist into combat counters and the attributed gain log', async () => {
    vi.useFakeTimers();
    const player = new ChampionInstance({ ...veigar, stats: { ...veigar.stats, attackSpeed: 2 } });
    const garen = championDB.getById('Garen')!;
    const ally = new ChampionInstance({
      ...garen,
      stats: { ...garen.stats, attackSpeed: 1, attackDamage: 2000 },
    });
    const ashe = championDB.getById('Ashe')!;
    const enemy = new ChampionInstance({
      ...ashe,
      stats: { ...ashe.stats, hp: 300, armor: 0, magicResist: 0 },
    });
    const players = [player, ally];
    const enemies = [enemy];
    const random = () => 0.5;
    const { result } = renderHook(() =>
      useBattleManager({ playerTeam: players, enemyTeam: enemies, random, autoPlay: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const manager = result.current.getManager()!;
    const target = manager.getEnemyCombatants()[0];
    act(() => {
      expect(manager.currentTurnEntry?.champion).toBe(player);
      expect(
        result.current.submitAction({ type: ActionType.SpellQ, targetId: target.targetId }),
      ).toBe(true);
    });
    expect(player.getRunCounter(key)).toBe(0);
    act(() => {
      for (let turn = 0; manager.currentTurnEntry?.side !== 'player' && turn < 5; turn += 1)
        result.current.processTurn();
      expect(manager.currentTurnEntry?.champion).toBe(ally);
      expect(
        result.current.submitAction({ type: ActionType.BasicAttack, targetId: target.targetId }),
      ).toBe(true);
    });
    const store = useBattleStore.getState();
    expect(store.playerTeam[0].runProgress).toEqual({ [key]: 1 });
    expect(store.log.find((event) => event.type === 'run_counter_gain')).toMatchObject({
      amount: 1,
      counterKey: key,
      counterValue: 1,
      sourceCombatantId: manager.getPlayerCombatants()[0].targetId,
      targetCombatantId: target.targetId,
      sourceSide: 'player',
      targetSide: 'enemy',
    });
    const view = render(
      <>
        <CombatantPortrait combatant={store.playerTeam[0]} isActive={false} onSelect={() => {}} />
        <CombatLog />
      </>,
    );
    expect(screen.getByRole('button', { name: /Cibler Veigar.*1\/200, \+1 AP/ })).toBeVisible();
    expect(view.container.querySelector('.combat-log__entry--run_counter_gain')).toHaveTextContent(
      'Veigar : Pouvoir maléfique phénoménal +1 (total 1)',
    );
  });

  it('syncs a real spell kill into combat counters and a log with authoritative attribution', async () => {
    vi.useFakeTimers();
    const player = new ChampionInstance(veigar);
    const enemy = new ChampionInstance({
      ...championDB.getById('Ashe')!,
      stats: { ...championDB.getById('Ashe')!.stats, hp: 1 },
    });
    const random = () => 0.5;
    const players = [player];
    const enemies = [enemy];
    const { result } = renderHook(() =>
      useBattleManager({ playerTeam: players, enemyTeam: enemies, random, autoPlay: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const manager = result.current.getManager()!;
    const target = manager.getEnemyCombatants()[0];
    act(() => {
      for (let turn = 0; manager.currentTurnEntry?.side !== 'player' && turn < 5; turn += 1)
        result.current.processTurn();
      expect(
        result.current.submitAction({ type: ActionType.SpellQ, targetId: target.targetId }),
      ).toBe(true);
    });
    const store = useBattleStore.getState();
    expect(player.getRunCounter(key)).toBe(1);
    expect(store.playerTeam[0].runProgress).toEqual({ [key]: 1 });
    const gain = store.log.find((entry) => entry.type === 'run_counter_gain');
    expect(gain).toMatchObject({
      amount: 1,
      counterKey: key,
      counterValue: 1,
      sourceCombatantId: manager.getPlayerCombatants()[0].targetId,
      targetCombatantId: target.targetId,
      sourceSide: 'player',
      targetSide: 'enemy',
    });
    const view = render(
      <>
        <CombatantPortrait combatant={store.playerTeam[0]} isActive={false} onSelect={() => {}} />
        <CombatLog />
      </>,
    );
    expect(screen.getByRole('button', { name: /Cibler Veigar.*1\/200, \+1 AP/ })).toBeVisible();
    expect(view.container.querySelector('.combat-log__entry--run_counter_gain')).toHaveTextContent(
      'Veigar : Pouvoir maléfique phénoménal +1 (total 1)',
    );
    expect(view.container.querySelector('.combat-log__entry--run_counter_gain')).toHaveAttribute(
      'data-counter-value',
      '1',
    );
  });
});

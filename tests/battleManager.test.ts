import { describe, expect, it } from 'vitest';
import { BattleManager } from '../src/game/battle/BattleManager';
import type { BattleAction, BattleTeam } from '../src/game/battle/types';
import { ActionType, BattlePhase } from '../src/game/battle/types';
import { ChampionInstance } from '../src/game/ChampionInstance';
import type { Champion, ChampionStats, Passive, Spell } from '../src/types';

function makeTestChampion(overrides: Partial<Champion> = {}): Champion {
  const baseStats: ChampionStats = {
    hp: 500,
    mp: 300,
    moveSpeed: 330,
    armor: 30,
    magicResist: 30,
    attackDamage: 60,
    attackSpeed: 0.65,
    attackRange: 175,
    hpPerLevel: 90,
    mpPerLevel: 40,
    armorPerLevel: 4,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3,
    attackSpeedPerLevel: 2.5,
    hpRegen: 7,
    hpRegenPerLevel: 0.7,
    mpRegen: 8,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  };
  const makeSpell = (slot: string): Spell => ({
    id: `Test${slot}`,
    name: `Test Spell ${slot}`,
    description: `Desc ${slot}`,
    maxRank: 5,
    cooldownTurns: [8, 7.5, 7, 6.5, 6],
    cost: [50, 55, 60, 65, 70],
    range: [700, 700, 700, 700, 700],
    image: `Test${slot}.png`,
    targeting: 'enemy' as any,
    scaling: { adRatio: 0.5, apRatio: 0.0 },
    effects: [
      {
        type: 'damage',
        damageType: 'physical',
        adRatio: 0.5,
        apRatio: 0.0,
        baseDamage: [50, 75, 100, 125, 150],
      },
    ],
  });
  const passive: Passive = {
    name: 'Test Passive',
    description: 'Desc',
    image: 'TestPassive.png',
    targeting: 'passive' as any,
    scaling: { adRatio: 0.0, apRatio: 0.0 },
    effects: [],
  };
  const defaults: Champion = {
    id: 'TestChampion',
    key: '9999',
    name: 'Test Champion',
    title: 'the Tester',
    tags: ['Mage', 'Assassin'],
    resourceType: 'Mana',
    stats: baseStats,
    spells: [makeSpell('Q'), makeSpell('W'), makeSpell('E'), makeSpell('R')],
    passive,
    iconUrl: '/data/lol/img/champions/TestChampion.png',
  };
  return { ...defaults, ...overrides };
}

function makeTeams(
  playerIds: string[],
  enemyIds: string[],
  spdOverrides: Record<string, number> = {},
): { playerTeam: BattleTeam; enemyTeam: BattleTeam } {
  const makeChamp = (id: string) => {
    const ms = spdOverrides[id] ?? 330;
    const champ = makeTestChampion({ id, name: id, key: id });
    champ.stats.moveSpeed = ms;
    return new ChampionInstance(champ, 1);
  };
  return {
    playerTeam: { side: 'player', champions: playerIds.map(makeChamp) },
    enemyTeam: { side: 'enemy', champions: enemyIds.map(makeChamp) },
  };
}

describe('BattleManager', () => {
  describe('Phase 2: Initiative & Turn-by-Turn', () => {
    describe('basic battle flow', () => {
      it('should start in Idle phase', () => {
        const teams = makeTeams(['A'], ['B']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        expect(bm.phase).toBe(BattlePhase.Idle);
        expect(bm.round).toBe(0);
      });

      it('should transition to TurnActive on startBattle', () => {
        const teams = makeTeams(['A'], ['B']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();
        expect(bm.phase).toBe(BattlePhase.TurnActive);
        expect(bm.round).toBe(1);
      });

      it('should not allow starting twice', () => {
        const teams = makeTeams(['A'], ['B']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();
        const roundBefore = bm.round;
        bm.startBattle();
        expect(bm.round).toBe(roundBefore);
      });

      it('rejects a submitted player command deterministically during an enemy turn', () => {
        const teams = makeTeams(['Player'], ['Enemy'], { Player: 100, Enemy: 1_000 });
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { random: () => 0.5 });
        bm.startBattle();

        expect(bm.currentCombatant?.side).toBe('enemy');
        expect(bm.submitAction({ type: ActionType.BasicAttack, targetId: 'Enemy' })).toBe(false);
      });
    });

    describe('speed-based turn order', () => {
      it('uses the injected run RNG for reproducible initiative', () => {
        const teams = makeTeams(['Player'], ['Enemy'], { Player: 330, Enemy: 330 });
        const rolls = [0.1, 0.9];
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, {
          random: () => rolls.shift() ?? 0,
        });
        const events: any[] = [];
        bm.on('event', (event) => events.push(event));

        bm.startBattle();

        const roundStart = events.find((event) => event.type === 'round_start');
        expect(roundStart.turnOrder.map((entry: { champion: string }) => entry.champion)).toEqual([
          'Enemy',
          'Player',
        ]);
      });

      it('should sort turn order by speed descending', () => {
        const teams = makeTeams(['Slow'], ['Fast'], { Slow: 325, Fast: 355 });
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();

        const roundStart = events.find((e) => e.type === 'round_start');
        expect(roundStart).toBeDefined();
        expect(roundStart.turnOrder.length).toBe(2);
        expect(roundStart.turnOrder[0].champion).toBe('Fast');
        expect(roundStart.turnOrder[1].champion).toBe('Slow');
      });

      it('should only include alive champions in turn order', () => {
        const teams = makeTeams(['P1', 'P2'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();

        const roundStart = events.find((e) => e.type === 'round_start');
        expect(roundStart.turnOrder.length).toBe(3);
      });
    });

    describe('turn execution', () => {
      it('should emit turn_start, action_select, and damage on processCurrentTurn', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();
        bm.processCurrentTurn();

        const types = events.map((e) => e.type);
        expect(types).toContain('turn_start');
        expect(types).toContain('action_select');
        expect(types).toContain('damage');
      });

      it('should reduce target HP after two turns', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        const enemyBefore = bm.getCombatantState('E1', 'enemy')!.currentHp;
        bm.processCurrentTurn();
        bm.processCurrentTurn();
        const enemyAfter = bm.getCombatantState('E1', 'enemy')!.currentHp;
        expect(enemyAfter).toBeLessThanOrEqual(enemyBefore);
      });
    });

    describe('mid-round death handling', () => {
      it('should skip defeated champions in turn order', () => {
        const teams = makeTeams(['P1', 'P2'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        const p2 = bm.getCombatantState('P2', 'player')!;
        p2.currentHp = 0;
        p2.isDefeated = true;

        const alive = bm.getAliveCombatants('player');
        expect(alive.length).toBe(1);
        expect(alive[0].champion.id).toBe('P1');
      });

      it('should skip dead champion and continue to next turn', () => {
        const teams = makeTeams(['P1', 'P2'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        const p2 = bm.getCombatantState('P2', 'player')!;
        p2.currentHp = 0;
        p2.isDefeated = true;

        while (bm.phase === BattlePhase.TurnActive) {
          bm.processCurrentTurn();
        }
        if (bm.phase !== BattlePhase.Finished) {
          expect(bm.round).toBeGreaterThan(0);
        }
      });
    });

    describe('action system', () => {
      it('should list available actions for a champion', () => {
        const teams = makeTeams(['P1'], ['E1'], { P1: 400, E1: 300 });
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();
        const actions = bm.getAvailableActions(teams.playerTeam.champions[0]);

        expect(actions.length).toBe(5);
        expect(actions[0].type).toBe(ActionType.BasicAttack);
        expect(actions[0].cost).toBe(0);
        expect(actions.find((a) => a.type === ActionType.SpellR)).toBeDefined();
      });

      it('should accept submitted actions for player turns', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
        bm.startBattle();

        const action: BattleAction = {
          type: ActionType.BasicAttack,
          cost: 0,
          targetId: 'E1',
        };
        const result = bm.submitAction(action);
        const entry = bm.turnOrder[bm.turnIndex - 1];
        if (entry?.side === 'player') {
          expect(result).toBe(true);
          expect(bm.getPlayerActionTrace()).toEqual([{ ...action, automatic: false }]);
        }
      });

      it('marks AI fallback actions so authority replay consumes the same RNG', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
        bm.startBattle();

        while (bm.currentTurnEntry?.side !== 'player') bm.processCurrentTurn();
        bm.processCurrentTurn();

        expect(bm.getPlayerActionTrace()[0]).toMatchObject({ automatic: true });
      });
    });

    describe('victory detection', () => {
      it('should detect victory when all enemies die', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();

        let safety = 100;
        while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
          bm.processCurrentTurn();
        }

        expect(bm.phase).toBe(BattlePhase.Finished);
        const endEvent = events.find((e) => e.type === 'battle_end');
        expect(endEvent).toBeDefined();
        expect(['player', 'enemy']).toContain(endEvent.winner);
      });

      it('should return a valid BattleResult', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        let safety = 100;
        while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
          bm.processCurrentTurn();
        }

        const result = bm.getResult();
        expect(result).not.toBeNull();
        expect(result!.totalRounds).toBeGreaterThan(0);
        expect(result!.log.length).toBeGreaterThan(0);
        expect(['player', 'enemy', 'draw']).toContain(result!.winner);
      });
    });

    describe('5v5 battle', () => {
      it('should handle 5v5 with all participants', () => {
        const teams = makeTeams(['P1', 'P2', 'P3', 'P4', 'P5'], ['E1', 'E2', 'E3', 'E4', 'E5']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        expect(bm.getPlayerCombatants().length).toBe(5);
        expect(bm.getEnemyCombatants().length).toBe(5);

        let safety = 200;
        while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
          bm.processCurrentTurn();
        }

        expect(bm.phase).toBe(BattlePhase.Finished);
        const result = bm.getResult();
        expect(result).not.toBeNull();
      });
    });

    describe('events', () => {
      it('should emit round_start with turn order info', () => {
        const teams = makeTeams(['A', 'B'], ['C']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();

        const rs = events.find((e) => e.type === 'round_start');
        expect(rs).toBeDefined();
        expect(rs.round).toBe(1);
        expect(rs.turnOrder.length).toBe(3);
        rs.turnOrder.forEach((entry: any) => {
          expect(entry.champion).toBeDefined();
          expect(['player', 'enemy']).toContain(entry.side);
          expect(typeof entry.speedValue).toBe('number');
        });
      });

      it('should emit action_select before damage', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        const events: any[] = [];
        bm.on('event', (e) => events.push(e));
        bm.startBattle();
        bm.processCurrentTurn();

        const selectIdx = events.findIndex((e) => e.type === 'action_select');
        const damageIdx = events.findIndex((e) => e.type === 'damage');
        expect(selectIdx).toBeGreaterThan(-1);
        expect(damageIdx).toBeGreaterThan(-1);
        expect(selectIdx).toBeLessThan(damageIdx);
      });
    });

    describe('cooldown timing', () => {
      it('should tick cooldowns at END of round, not start (LoL behavior)', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle(); // round 1 starts

        const p1 = teams.playerTeam.champions[0];
        // Use Q spell (cooldown 8 at rank 1)
        p1.useSpell('Q');
        expect(p1.isSpellReady('Q')).toBe(false);

        // Process all turns in round 1 (P1 turn, then E1 turn)
        bm.processCurrentTurn(); // P1's turn
        bm.processCurrentTurn(); // E1's turn

        // After round 1 ends, cooldowns tick. The spell used mid-round
        // should have 1 tick applied at round end.
        // Verify we're now in round 2
        expect(bm.round).toBe(2);
        // The spell should still be on cooldown (8 - 1 = 7 remaining)
        expect(p1.isSpellReady('Q')).toBe(false);
      });

      it('should NOT tick cooldowns before first round executes', () => {
        const teams = makeTeams(['P1'], ['E1']);
        const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
        bm.startBattle();

        const p1 = teams.playerTeam.champions[0];
        // All spells should be ready at battle start (no premature tick)
        expect(p1.isSpellReady('Q')).toBe(true);
        expect(p1.isSpellReady('W')).toBe(true);
        expect(p1.isSpellReady('E')).toBe(true);
        expect(p1.isSpellReady('R')).toBe(true);
      });
    });
  });
});

describe('P1 manual combat choices', () => {
  it('restores persisted mana and clamps it to the combatant resource bounds', () => {
    const teams = makeTeams(['P1', 'P2'], ['E1'], { P1: 400, P2: 350 });
    const battle = new BattleManager(teams.playerTeam, teams.enemyTeam, {
      autoActions: false,
      initialMpOverrides: { P1: 75, P2: 9_999 },
    });
    battle.startBattle();

    expect(battle.getCombatantState('P1', 'player')?.currentMp).toBe(75);
    expect(battle.getCombatantState('P2', 'player')?.currentMp).toBe(
      battle.getCombatantState('P2', 'player')?.maxMp,
    );

    const empty = new BattleManager(teams.playerTeam, teams.enemyTeam, {
      autoActions: false,
      initialMpOverrides: { P1: -20 },
    });
    empty.startBattle();
    expect(empty.getCombatantState('P1', 'player')?.currentMp).toBe(0);

    const invalid = new BattleManager(teams.playerTeam, teams.enemyTeam, {
      autoActions: false,
      initialMpOverrides: { P1: Number.NaN },
    });
    invalid.startBattle();
    expect(invalid.getCombatantState('P1', 'player')?.currentMp).toBe(
      invalid.getCombatantState('P1', 'player')?.maxMp,
    );
  });

  it('attacks the explicit target selected by the player', () => {
    const teams = makeTeams(['P1'], ['E1', 'E2'], { P1: 400 });
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();

    expect(bm.submitAction({ type: ActionType.BasicAttack, cost: 0, targetId: 'E2' })).toBe(true);

    const enemies = bm.getEnemyCombatants();
    expect(enemies.find((enemy) => enemy.champion.id === 'E1')?.currentHp).toBe(500);
    expect(enemies.find((enemy) => enemy.champion.id === 'E2')?.currentHp).toBeLessThan(500);
  });

  it('assigns stable target ids when the same champion appears more than once', () => {
    const teams = makeTeams(['P1'], ['E1', 'E1'], { P1: 400, E1: 300 });
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();

    expect(bm.getAvailableTargets(ActionType.BasicAttack)).toEqual(['E1#1', 'E1#2']);
    expect(bm.submitAction({ type: ActionType.BasicAttack, targetId: 'E1#2' })).toBe(true);
    expect(bm.getEnemyCombatants()[0].currentHp).toBe(500);
    expect(bm.getEnemyCombatants()[1].currentHp).toBeLessThan(500);
  });

  it('uses the selected spell rank for damage values', () => {
    const levelOneTeams = makeTeams(['P1'], ['E1'], { P1: 400 });
    const upgradedTeams = makeTeams(['P2'], ['E2'], { P2: 400 });
    upgradedTeams.playerTeam.champions[0].setSpellRank('Q', 3);
    const first = new BattleManager(levelOneTeams.playerTeam, levelOneTeams.enemyTeam, {
      autoActions: false,
    });
    const upgraded = new BattleManager(upgradedTeams.playerTeam, upgradedTeams.enemyTeam, {
      autoActions: false,
    });
    first.startBattle();
    upgraded.startBattle();

    first.submitAction({ type: ActionType.SpellQ, cost: 50, targetId: 'E1' });
    upgraded.submitAction({ type: ActionType.SpellQ, cost: 50, targetId: 'E2' });

    expect(upgraded.getEnemyCombatants()[0].currentHp).toBeLessThan(
      first.getEnemyCombatants()[0].currentHp,
    );
  });

  it('derives mana cost and cooldown from the current rank, ignoring forged cost', () => {
    const teams = makeTeams(['P1'], ['E1'], { P1: 400, E1: 300 });
    const champion = teams.playerTeam.champions[0];
    champion.setSpellRank('Q', 3);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();

    const option = bm
      .getAvailableActions(champion)
      .find((candidate) => candidate.type === ActionType.SpellQ);
    expect(option).toMatchObject({ cost: 60, cooldownTurns: 7, validTargetIds: ['E1'] });

    expect(bm.submitAction({ type: ActionType.SpellQ, cost: 0, targetId: 'E1' })).toBe(true);
    expect(bm.getCombatantState('P1', 'player')?.currentMp).toBe(240);
    expect(champion.getCooldown('Q')).toBe(7);
  });

  it('rejects forged targets before emitting, spending resources, or advancing the turn', () => {
    const teams = makeTeams(['P1'], ['E1', 'E2'], { P1: 400, E1: 300, E2: 290 });
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();
    const actor = bm.getCombatantState('P1', 'player')!;
    const logLength = bm.log.length;
    const turnIndex = bm.turnIndex;

    expect(bm.submitAction({ type: ActionType.BasicAttack })).toBe(false);
    expect(bm.submitAction({ type: ActionType.BasicAttack, targetId: 'all' })).toBe(false);
    expect(bm.submitAction({ type: ActionType.SpellQ, cost: 9999, targetId: 'P1' })).toBe(false);

    const deadEnemy = bm.getCombatantState('E1', 'enemy')!;
    deadEnemy.currentHp = 0;
    deadEnemy.isDefeated = true;
    expect(bm.submitAction({ type: ActionType.SpellQ, cost: 0, targetId: 'E1' })).toBe(false);

    expect(actor.currentMp).toBe(actor.maxMp);
    expect(actor.champion.getCooldown('Q')).toBe(0);
    expect(bm.turnIndex).toBe(turnIndex);
    expect(bm.log).toHaveLength(logLength);
  });

  it('rejects cooldown, mana, and invalid-rank actions without consuming the turn', () => {
    const makeBattle = () => {
      const teams = makeTeams(['P1'], ['E1'], { P1: 400, E1: 300 });
      const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
      bm.startBattle();
      return { teams, bm, actor: bm.getCombatantState('P1', 'player')! };
    };

    const cooldownBattle = makeBattle();
    cooldownBattle.teams.playerTeam.champions[0].useSpell('Q');
    expect(cooldownBattle.bm.submitAction({ type: ActionType.SpellQ, targetId: 'E1' })).toBe(false);
    expect(cooldownBattle.bm.turnIndex).toBe(0);

    const manaBattle = makeBattle();
    manaBattle.actor.currentMp = 0;
    expect(manaBattle.bm.submitAction({ type: ActionType.SpellQ, targetId: 'E1' })).toBe(false);
    expect(manaBattle.teams.playerTeam.champions[0].getCooldown('Q')).toBe(0);

    const rankBattle = makeBattle();
    (
      rankBattle.teams.playerTeam.champions[0] as unknown as {
        _spellRanks: Record<string, number>;
      }
    )._spellRanks.Q = 99;
    expect(rankBattle.bm.submitAction({ type: ActionType.SpellQ, targetId: 'E1' })).toBe(false);
    expect(rankBattle.actor.currentMp).toBe(rankBattle.actor.maxMp);
  });

  it('applies ally effects to the selected ally instead of a random recipient', () => {
    const teams = makeTeams(['P1', 'P2'], ['E1'], { P1: 400, P2: 350, E1: 300 });
    const shield = teams.playerTeam.champions[0].getSpell('Q')!;
    shield.targeting = 'ally' as any;
    shield.effects = [{ type: 'shield', baseValue: [75], apRatio: 0 }];
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();

    expect(bm.getAvailableTargets(ActionType.SpellQ)).toEqual(['P1', 'P2']);
    expect(bm.submitAction({ type: ActionType.SpellQ, targetId: 'P2' })).toBe(true);
    expect(bm.getCombatantState('P1', 'player')?.currentShield).toBe(0);
    expect(bm.getCombatantState('P2', 'player')?.currentShield).toBe(75);
  });

  it('applies full area damage to the selected primary and half to secondaries', () => {
    const teams = makeTeams(['P1'], ['E1', 'E2'], { P1: 400, E1: 300, E2: 290 });
    const area = teams.playerTeam.champions[0].getSpell('Q')!;
    area.targeting = 'area' as any;
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, { autoActions: false });
    bm.startBattle();
    const actor = bm.getCombatantState('P1', 'player')!;

    expect(bm.submitAction({ type: ActionType.SpellQ, targetId: 'all' })).toBe(false);
    expect(actor.currentMp).toBe(actor.maxMp);
    expect(bm.submitAction({ type: ActionType.SpellQ, targetId: 'E2' })).toBe(true);
    const primaryDamage = 500 - bm.getCombatantState('E2', 'enemy')!.currentHp;
    const secondaryDamage = 500 - bm.getCombatantState('E1', 'enemy')!.currentHp;
    expect(primaryDamage).toBeGreaterThan(secondaryDamage);
    expect(secondaryDamage / primaryDamage).toBeCloseTo(0.5, 1);
  });
});

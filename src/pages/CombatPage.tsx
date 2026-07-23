import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { TurnIndicator } from '@/components/CombatUI/TurnIndicator';
import { championDB } from '@/data';
import { ITEM_DATABASE } from '@/data/items';
import { isFinalRunVictory } from '@/game/battle/runOutcome';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import type { CombatEncounter } from '@/game/map/types';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import type { Item, ItemStatBonuses, RunSummary, TeamMember } from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateEventStatBonuses } from '@/utils/statCalculator';
import { addXp, calculateXpGain } from '@/utils/xpSystem';

function buildTeamInstances(
  championIds: string[],
  levels?: Record<string, number>,
  statMultipliers?: Record<string, number>,
): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const id of championIds) {
    const champ = championDB.getById(id);
    if (champ) {
      instances.push(new ChampionInstance(champ, levels?.[id] ?? 1, statMultipliers?.[id] ?? 1));
    }
  }
  return instances;
}

/**
 * Apply enhancement bonuses and item bonuses to champion instances.
 * Retrieves enhancement state from the store and applies stat bonuses.
 * Also applies item bonuses from equipped items.
 */
function applyEnhancementsToTeam(
  instances: ChampionInstance[],
  inventory: import('@/types/run').InventoryEntry[],
  team: TeamMember[],
): void {
  const enhancementStore = useEnhancementStore.getState();

  for (const instance of instances) {
    const champ = championDB.getById(instance.id);
    if (!champ) continue;

    // Get enhancement state for this champion
    const enhancementState = enhancementStore.getEnhancementState(instance.id);

    // Get the enhancement tree for this champion's role
    const tree = enhancementTreeProvider.getTreeForChampion(champ);

    // Calculate stat bonuses from unlocked nodes
    const enhancementBonuses = enhancementService.calculateStatBonuses(
      tree,
      enhancementState.unlockedNodes,
    );
    const flatBonuses = enhancementBonuses.flat as Record<string, number>;

    // Calculate item bonuses
    const equippedItems = inventory.filter((entry) => entry.equippedToChampionId === instance.id);
    for (const entry of equippedItems) {
      const itemStats = entry.item.stats;
      // Map item stat keys to CalculatedStats keys (used by ChampionInstance)
      const itemStatMap: Record<string, keyof import('@/utils/champion').CalculatedStats> = {
        hp: 'hp',
        atk: 'attackDamage',
        def: 'armor',
        ap: 'abilityPower',
        spd: 'moveSpeed',
        crit: 'crit',
      };
      for (const [key, value] of Object.entries(itemStats)) {
        const calcStatsKey = itemStatMap[key];
        if (calcStatsKey && value) {
          // EnhancementStatBonuses.flat uses StatType keys, but ChampionInstance
          // applies them by casting to keyof CalculatedStats, so we need to use
          // the CalculatedStats key names
          flatBonuses[calcStatsKey] = (flatBonuses[calcStatsKey] || 0) + value;
        }
      }
    }

    const runMember = team.find((member) => member.championId === instance.id);
    const eventBonuses = calculateEventStatBonuses(runMember?.statBoosts);
    for (const [stat, value] of Object.entries(eventBonuses)) {
      flatBonuses[stat] = (flatBonuses[stat] || 0) + value;
    }

    // Apply combined bonuses to the champion instance
    instance.setEnhancementBonuses(enhancementBonuses);
  }
}

/**
 * Get enhancement bonus descriptions for a champion instance.
 * Returns an array of short description strings for UI display.
 */
function getEnhancementDescriptions(championId: string): string[] {
  const enhancementStore = useEnhancementStore.getState();
  const enhancementState = enhancementStore.getEnhancementState(championId);

  if (Object.keys(enhancementState.unlockedNodes).length === 0) return [];

  const champ = championDB.getById(championId);
  if (!champ) return [];

  const tree = enhancementTreeProvider.getTreeForChampion(champ);
  const bonuses = enhancementService.calculateStatBonuses(tree, enhancementState.unlockedNodes);

  const descriptions: string[] = [];

  // Add flat stat bonuses
  for (const [stat, value] of Object.entries(bonuses.flat)) {
    if (value > 0) {
      const statNames: Record<string, string> = {
        hp: 'PV',
        mp: 'PM',
        atk: 'AD',
        ap: 'AP',
        def: 'Armure',
        mr: 'RM',
        spd: 'Vitesse',
        crit: 'Critique',
        attackSpeed: 'Vitesse ATQ',
        hpRegen: 'Regen PV',
        mpRegen: 'Regen PM',
        armorPen: 'Pen. Armure',
        magicPen: 'Pen. Magique',
        lifesteal: 'Vol de vie',
        omnivamp: 'Omnivamp',
        tenacity: 'Ténacité',
        abilityHaste: 'Hâte',
        attackRange: 'Portée',
      };
      const name = statNames[stat] || stat;
      descriptions.push(`+${value} ${name}`);
    }
  }

  // Add percentage bonuses
  for (const [stat, percent] of Object.entries(bonuses.percent)) {
    if (percent > 0) {
      const statNames: Record<string, string> = {
        hp: 'PV',
        mp: 'PM',
        atk: 'AD',
        ap: 'AP',
        def: 'Armure',
        mr: 'RM',
        spd: 'Vitesse',
        crit: 'Critique',
        attackSpeed: 'Vitesse ATQ',
        hpRegen: 'Regen PV',
        mpRegen: 'Regen PM',
        armorPen: 'Pen. Armure',
        magicPen: 'Pen. Magique',
        lifesteal: 'Vol de vie',
        omnivamp: 'Omnivamp',
        tenacity: 'Ténacité',
        abilityHaste: 'Hâte',
        attackRange: 'Portée',
      };
      const name = statNames[stat] || stat;
      descriptions.push(`+${Math.round(percent * 100)}% ${name}`);
    }
  }

  // Add effect descriptions
  for (const effect of bonuses.effects) {
    if (effect.description) {
      descriptions.push(effect.description);
    }
  }

  return descriptions;
}

/** Build enemy team from encounter data */
function buildEnemyTeamFromEncounter(
  encounter: CombatEncounter,
  difficultyMultiplier: number,
): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const enemy of encounter.enemies) {
    const champ = championDB.getById(enemy.championId);
    if (champ) {
      // Enemy level scales with run level and node difficulty
      // Base level is 1 for normal combats
      const baseLevel = enemy.level ?? 1;
      const instance = new ChampionInstance(champ, baseLevel);

      // Apply stat multiplier by directly modifying the champion's base stats
      // This is more reliable than using enhancement bonuses with mismatched stat names
      const multiplier = (enemy.statMultiplier || 1) * difficultyMultiplier;
      if (multiplier !== 1.0) {
        const baseStats = champ.stats;

        // Create a modified champion with scaled stats
        const scaledChamp = {
          ...champ,
          stats: {
            ...baseStats,
            hp: Math.round(baseStats.hp * multiplier),
            hpPerLevel: Math.round(baseStats.hpPerLevel * multiplier),
            mp: Math.round(baseStats.mp * multiplier),
            mpPerLevel: Math.round(baseStats.mpPerLevel * multiplier),
            armor: Math.round(baseStats.armor * multiplier),
            armorPerLevel: Math.round(baseStats.armorPerLevel * multiplier),
            magicResist: Math.round(baseStats.magicResist * multiplier),
            magicResistPerLevel: Math.round(baseStats.magicResistPerLevel * multiplier),
            attackDamage: Math.round(baseStats.attackDamage * multiplier),
            attackDamagePerLevel: Math.round(baseStats.attackDamagePerLevel * multiplier),
            attackSpeed: Math.round(baseStats.attackSpeed * multiplier * 100) / 100,
            attackSpeedPerLevel: Math.round(baseStats.attackSpeedPerLevel * multiplier * 100) / 100,
            hpRegen: Math.round(baseStats.hpRegen * multiplier * 10) / 10,
            hpRegenPerLevel: Math.round(baseStats.hpRegenPerLevel * multiplier * 10) / 10,
            mpRegen: Math.round(baseStats.mpRegen * multiplier * 10) / 10,
            mpRegenPerLevel: Math.round(baseStats.mpRegenPerLevel * multiplier * 10) / 10,
            crit: Math.round(baseStats.crit * multiplier * 10) / 10,
            critPerLevel: Math.round(baseStats.critPerLevel * multiplier * 10) / 10,
          },
        };

        const scaledInstance = new ChampionInstance(scaledChamp, baseLevel);
        instances.push(scaledInstance);
      } else {
        instances.push(instance);
      }
    }
  }
  return instances;
}

const SLOT_TO_ACTION: Record<string, ActionType> = {
  Q: ActionType.SpellQ,
  W: ActionType.SpellW,
  E: ActionType.SpellE,
  R: ActionType.SpellR,
};

export function CombatPage() {
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const runLevel = useRunStore((s) => s.runLevel);
  const navigate = useAppNavigate();

  const battlePhase = useBattleStore((s) => s.phase);
  const round = useBattleStore((s) => s.round);
  const playerTeam = useBattleStore((s) => s.playerTeam);
  const enemyTeam = useBattleStore((s) => s.enemyTeam);
  const currentTurnChampionId = useBattleStore((s) => s.currentTurnChampionId);
  const currentTurnSide = useBattleStore((s) => s.currentTurnSide);
  const winner = useBattleStore((s) => s.winner);
  const isPlayerTurn = useBattleStore((s) => s.isPlayerTurn);
  const battleSpeed = useSettingsStore((s) => s.battleSpeed);
  const difficulty = useSettingsStore((s) => s.difficulty);
  const difficultyMultiplier = getDifficultyMultiplier(difficulty);

  const [autoPlay, setAutoPlay] = useState(true);
  const [turnTick, setTurnTick] = useState(0);
  const hasNavigatedAfterLossRef = useRef(false);
  const endRunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending endRun timeout on mount
  useEffect(() => {
    return () => {
      if (endRunTimeoutRef.current) {
        clearTimeout(endRunTimeoutRef.current);
      }
    };
  }, []);

  // Reset the ref when battlePhase changes to starting (new combat)
  useEffect(() => {
    if (battlePhase === 'starting') {
      hasNavigatedAfterLossRef.current = false;
      setTurnTick(0); // Reset turn tick for new battle
    }
  }, [battlePhase]);

  // Navigate away if the run is no longer active (only once after a loss)
  useEffect(() => {
    if (!isActive && !hasNavigatedAfterLossRef.current) {
      hasNavigatedAfterLossRef.current = true;
      navigate(ROUTES.STARTER_SELECT);
    }
  }, [isActive, navigate]);

  // Build player instances with persisted levels
  const teamLevels = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) {
      m[t.championId] = t.level ?? 1;
    }
    return m;
  }, [team]);
  const teamStatMultipliers = useMemo(
    () => Object.fromEntries(team.map((member) => [member.championId, member.statMultiplier ?? 1])),
    [team],
  );

  // Create a stable string key that includes both championIds and their levels
  // This ensures playerInstances is recreated when levels change
  const teamKey = useMemo(() => {
    return team.map((t) => `${t.championId}:${t.level ?? 1}`).join(',');
  }, [team]);

  // Get inventory for item bonuses
  const inventory = useRunStore((s) => s.inventory);

  const playerInstances = useMemo(() => {
    const instances = buildTeamInstances(
      team.map((m) => m.championId),
      teamLevels,
      teamStatMultipliers,
    );
    // Apply enhancement bonuses and item bonuses to player champions
    applyEnhancementsToTeam(instances, inventory, team);
    return instances;
  }, [teamKey, teamLevels, teamStatMultipliers, inventory]);

  // Get enhancement descriptions for each player champion (memoized)
  // Use teamKey to ensure this updates when team composition or levels change
  const playerEnhancementBonuses = useMemo(() => {
    const bonuses: Record<string, string[]> = {};
    for (const member of team) {
      const descs = getEnhancementDescriptions(member.championId);
      bonuses[member.championId] = descs;
      if (descs.length > 0) {
        console.log('[CombatPage] Enhancement bonuses for', member.championId, ':', descs);
      }
    }
    return bonuses;
  }, [teamKey]);

  // Check for empty player team (invalid champion ID) - navigate to game over
  useEffect(() => {
    if (
      isActive &&
      playerInstances.length === 0 &&
      team.length > 0 &&
      !hasNavigatedAfterLossRef.current
    ) {
      // Player team is empty but should have champions - invalid champion ID
      const championIds = team.map((m) => m.championId);
      console.error('CombatPage: Player team is empty but run has champions.');
      console.error('Champion IDs in team:', championIds);
      console.error('Champion DB size:', championDB.count());
      // Try to look up each champion to see which ones are missing
      for (const id of championIds) {
        const champ = championDB.getById(id);
        console.error(`Champion "${id}" lookup result:`, champ ? 'FOUND' : 'NOT FOUND');
      }
      // Build a summary and navigate to game over
      const rs = useRunStore.getState();
      runStatsTracker.markSurvived([]);
      const summary: RunSummary = runStatsTracker.buildSummary({
        won: false,
        wavesCompleted: rs.totalWavesCompleted,
        biomesVisited: rs.biomesVisited,
        goldEarned: rs.gold,
        runLevel: rs.runLevel,
      });
      navigate(ROUTES.GAME_OVER, { state: { summary } });
      hasNavigatedAfterLossRef.current = true;
      setTimeout(() => {
        rs.endRun(false);
        runStatsTracker.reset();
      }, 100);
    }
  }, [isActive, playerInstances.length, team.length, team, navigate]);

  // Build HP overrides from persisted team state, clamped to max HP
  const initialHpOverrides = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) {
      if (t.currentHp !== undefined) {
        const champ = championDB.getById(t.championId);
        if (champ) {
          const level = t.level ?? 1;
          // Calculate max HP at current level using LoL growth formula
          const baseHp = champ.stats.hp;
          const hpPerLevel = champ.stats.hpPerLevel;
          const maxHp = Math.round(baseHp + hpPerLevel * (level - 1));
          // Clamp current HP to max HP to prevent exceeding maximum after level up
          m[t.championId] = Math.min(t.currentHp, maxHp);
        } else {
          m[t.championId] = t.currentHp;
        }
      }
    }
    return Object.keys(m).length > 0 ? m : undefined;
  }, [team]);

  // Get encounter data from store
  const currentEncounter = useRunStore((s) => s.currentEncounter);
  const runSeed = useRunStore((s) => s.seed);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const battleRandom = useMemo(() => {
    const rng = createScopedRunRng(
      runSeed,
      `combat:${currentEncounter?.id ?? currentNodeId ?? 'unknown'}`,
    );
    return () => rng.next();
  }, [currentEncounter?.id, currentNodeId, runSeed]);

  // Memoize enemy instances to prevent recreation on every render
  const enemyInstances = useMemo(() => {
    if (currentEncounter && currentEncounter.type === 'combat') {
      return buildEnemyTeamFromEncounter(currentEncounter, difficultyMultiplier);
    }
    return [];
  }, [
    currentEncounter?.id,
    currentEncounter?.type,
    currentEncounter?.enemies?.map((e) => e.championId).join(','),
    difficultyMultiplier,
  ]);

  const handleComplete = useCallback(
    (w: 'player' | 'enemy' | 'draw') => {
      // Clear any pending endRun timeout from a previous combat
      if (endRunTimeoutRef.current) {
        clearTimeout(endRunTimeoutRef.current);
        endRunTimeoutRef.current = null;
      }

      if (w === 'player') {
        const runStore = useRunStore.getState();

        // 1. Award gold: 50 + runLevel * 10
        const goldReward = 50 + runLevel * 10;
        runStore.addGold(goldReward);

        // 2. Award XP to all surviving player champions
        const currentNode = runStore.getCurrentNode();
        const isBossNode = currentNode?.type === 'boss';
        const isEliteNode = currentNode?.type === 'elite';
        const xpGain = calculateXpGain(runLevel, isEliteNode, isBossNode);

        // Update each team member with XP and potential level-ups
        const teamUpdates = runStore.team.map((member) => {
          const currentLevel = member.level ?? 1;
          const currentXp = member.currentXp ?? 0;
          const result = addXp(currentLevel, currentXp, xpGain);

          return {
            championId: member.championId,
            currentHp: member.currentHp ?? 0,
            level: result.newLevel,
            currentXp: result.remainingXp,
          };
        });

        runStore.updateTeamAfterCombat(teamUpdates);

        // 3. Advance wave
        runStore.nextWave();

        // 4. Complete current map node (unlocks next nodes)
        let advancedToNextBiome = false;
        if (currentNode) {
          // 5. Item drop chance (~20%) — scoped to this run and encounter.
          const itemRng = createScopedRunRng(
            runStore.seed,
            `drop:${currentNode.id}:${runStore.totalWavesCompleted}`,
          );
          if (itemRng.next() < 0.2) {
            const itemDefs = Object.values(ITEM_DATABASE);
            if (itemDefs.length > 0) {
              const drop = itemDefs[Math.floor(itemRng.next() * itemDefs.length)];
              const item: Item = {
                id: drop.id,
                name: drop.name,
                description: drop.description,
                iconUrl: drop.iconUrl,
                stats: drop.stats.reduce<ItemStatBonuses>((acc, s) => {
                  const key = s.stat as keyof ItemStatBonuses;
                  acc[key] = (acc[key] ?? 0) + s.value;
                  return acc;
                }, {}),
                passiveId: drop.passive?.id,
                goldValue: drop.goldValue,
              };
              runStore.addItem(item);
            }
          }

          // 6. Resolve encounter (completes the node)
          runStore.resolveEncounter();

          // 7. Check if we just completed the boss -- advance to next biome
          if (isBossNode) {
            runStore.incrementRunLevel();
            advancedToNextBiome = runStore.advanceToNextBiome();
          }
        }

        // 8. Build RunSummary for victory display
        // Mark surviving player champions
        const rs2 = useRunStore.getState();
        const aliveIds = rs2.team.filter((m) => (m.currentHp ?? 0) > 0).map((m) => m.championId);
        runStatsTracker.markSurvived(aliveIds);
        const victorySummary: RunSummary = runStatsTracker.buildSummary({
          won: true,
          wavesCompleted: rs2.totalWavesCompleted,
          biomesVisited: rs2.biomesVisited,
          goldEarned: rs2.gold,
          runLevel: rs2.runLevel,
        });
        // Only the boss of the last biome ends the run.
        if (isFinalRunVictory(isBossNode, advancedToNextBiome)) {
          const completedRunId = rs2.runId;
          navigate(ROUTES.GAME_OVER, { state: { summary: victorySummary } });
          void rs2.endRun(true, completedRunId);
          runStatsTracker.reset();
          return;
        }
        // Reset tracker for next combat
        runStatsTracker.reset();

        // Navigate back to the map to choose the next node
        navigate(ROUTES.RUN);
      } else {
        // On draw or loss: build RunSummary from tracked stats, navigate with state
        const rs = useRunStore.getState();
        // Capture the current runId to prevent stale timeouts from affecting new runs
        const currentRunId = rs.runId;
        // Mark all player champions as dead (none survived)
        runStatsTracker.markSurvived([]);
        const summary: RunSummary = runStatsTracker.buildSummary({
          won: false,
          wavesCompleted: rs.totalWavesCompleted,
          biomesVisited: rs.biomesVisited,
          goldEarned: rs.gold,
          runLevel: rs.runLevel,
        });
        // Navigate to game over screen
        navigate(ROUTES.GAME_OVER, { state: { summary } });
        // End the run (resets isActive, team, gold, etc.) - delayed to avoid race conditions
        // Store the timeout reference so it can be cleared if player starts a new run
        // Pass the runId to ensure only the correct run is ended
        endRunTimeoutRef.current = setTimeout(() => {
          void rs.endRun(false, currentRunId);
          runStatsTracker.reset();
          endRunTimeoutRef.current = null;
        }, 100);
      }
    },
    [runLevel, navigate],
  );

  const { processTurn, submitAction, getManager } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: autoPlay,
    onComplete: handleComplete,
    initialHpOverrides,
    random: battleRandom,
  });

  const handleCast = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      const actionType = SLOT_TO_ACTION[slot];
      if (!actionType) return;
      submitAction({ type: actionType, cost: 0 });
    },
    [submitAction],
  );

  // Auto-process all turns when autoPlay is enabled
  useEffect(() => {
    if (autoPlay && battlePhase === 'turn_active') {
      const delay = Math.max(50, 400 / battleSpeed);
      const timer = setTimeout(() => {
        processTurn();
        setTurnTick((t) => t + 1);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, battlePhase, processTurn, turnTick, battleSpeed]);

  // Save final HP states when battle finishes with player victory
  useEffect(() => {
    if (battlePhase === 'finished' && winner === 'player') {
      const bm = getManager();
      if (!bm) return;
      const finalStates = bm.getFinalPlayerStates();
      if (finalStates.length > 0) {
        const runStore = useRunStore.getState();
        runStore.updateTeamAfterCombat(
          finalStates.map((s) => ({
            championId: s.championId,
            currentHp: s.currentHp,
            level: teamLevels[s.championId] ?? 1,
            currentXp: runStore.team.find((m) => m.championId === s.championId)?.currentXp ?? 0,
          })),
        );
      }
    }
  }, [battlePhase, winner, getManager, teamLevels]);

  const currentChampion = [...playerTeam, ...enemyTeam].find((c) => c.id === currentTurnChampionId);
  const currentSpell = currentChampion?.spells;

  // Keyboard shortcuts
  const canCast = isPlayerTurn && battlePhase === 'turn_active';
  const canCastSlot = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      if (!canCast || !currentSpell) return false;
      const sp = currentSpell.find((s) => s.slot === slot);
      return !!sp && sp.isReady;
    },
    [canCast, currentSpell],
  );

  useKeyboardShortcuts({
    onCastQ: canCastSlot('Q') ? () => handleCast('Q') : undefined,
    onCastW: canCastSlot('W') ? () => handleCast('W') : undefined,
    onCastE: canCastSlot('E') ? () => handleCast('E') : undefined,
    onCastR: canCastSlot('R') ? () => handleCast('R') : undefined,
    onNextTurn:
      (!autoPlay || isPlayerTurn) && battlePhase === 'turn_active' ? processTurn : undefined,
    onBack: canLeaveActiveCombat(battlePhase) ? () => navigate(ROUTES.RUN) : undefined,
    enabled: battlePhase !== 'finished',
  });

  if (!isActive) return null;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button
          style={backBtnStyle}
          disabled={!canLeaveActiveCombat(battlePhase)}
          onClick={() => {
            playUIClick();
            navigate(ROUTES.RUN);
          }}
          aria-label="Back to map"
          title={
            canLeaveActiveCombat(battlePhase)
              ? 'Back to map'
              : 'Finish the active combat before returning to the map'
          }
        >
          ← Map
        </button>
        <span style={{ color: '#c8aa6e', fontWeight: 700 }}>Combat — Round {round}</span>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <BattleSpeedControl />
        <button
          onClick={() => {
            playUIClick();
            setAutoPlay(!autoPlay);
          }}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            color: autoPlay ? '#22c55e' : '#ef4444',
            border: '1px solid ' + (autoPlay ? '#22c55e' : '#ef4444'),
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          aria-label="Toggle auto-play"
        >
          Auto: {autoPlay ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Main area */}
      <div style={mainStyle}>
        {/* Player team panel */}
        <div style={leftPanelStyle}>
          <div style={teamTitleStyle('#3b82f6')}>Votre équipe</div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.id}`}
              combatant={c}
              isActive={c.id === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
            />
          ))}
          {playerTeam.length === 0 && <div style={emptyStyle}>Aucun champion</div>}
        </div>

        {/* Center: battle arena / status */}
        <div style={centerStyle}>
          {battlePhase === 'idle' && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
              <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>
                Préparation du combat...
              </div>
            </div>
          )}
          {(battlePhase === 'turn_active' ||
            battlePhase === 'starting' ||
            battlePhase === 'turn_transition') && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>
                ⚔️
              </div>
              <div style={{ fontSize: 16, color: '#ffd700', fontWeight: 'bold' }}>
                {currentTurnSide === 'player' ? 'À votre tour !' : "Tour de l'ennemi..."}
              </div>
              {currentChampion && (
                <div style={{ fontSize: 14, color: '#fff', marginTop: 8 }}>
                  {currentChampion.name}
                </div>
              )}
              {(!autoPlay || isPlayerTurn) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={processTurn}
                    style={nextTurnBtnStyle}
                    aria-label="Execute turn (Space)"
                  >
                    ▶ Exécuter le tour
                    <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.6 }}>[Space]</span>
                  </button>
                </div>
              )}
            </div>
          )}
          {battlePhase === 'finished' && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>
                {winner === 'player' ? '🏆' : winner === 'draw' ? '🤝' : '💀'}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color:
                    winner === 'player' ? '#22c55e' : winner === 'draw' ? '#ffd700' : '#ef4444',
                  marginBottom: 12,
                }}
              >
                {winner === 'player' ? 'VICTOIRE !' : winner === 'draw' ? 'ÉGALITÉ' : 'DÉFAITE'}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {winner === 'player' && (
                  <button
                    onClick={() => {
                      playUIClick();
                      navigate(ROUTES.RUN);
                    }}
                    style={nextBtnStyle}
                  >
                    Continuer →
                  </button>
                )}
                <button onClick={() => navigate(ROUTES.MENU)} style={backBtnStyle2}>
                  Menu
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enemy team panel */}
        <div style={rightPanelStyle}>
          <div style={teamTitleStyle('#ef4444')}>Ennemis</div>
          {enemyTeam.map((c, i) => (
            <CombatantPortrait
              key={`${c.id}-${i}`}
              combatant={c}
              isActive={c.id === currentTurnChampionId}
            />
          ))}
          {enemyTeam.length === 0 && <div style={emptyStyle}>Aucun ennemi</div>}
        </div>
      </div>

      {/* Bottom: ability bar + log */}
      <div style={bottomStyle}>
        {isPlayerTurn && currentChampion && !currentChampion.isDefeated && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <AbilityBar champion={currentChampion} onCast={handleCast} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CombatLog />
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '8px 16px',
  background: '#161b22',
  borderBottom: '1px solid #1e2a3a',
  flexShrink: 0,
};

const backBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 8,
  padding: 8,
  overflow: 'hidden',
};

const leftPanelStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #30363d',
  padding: 8,
  overflow: 'auto',
};

const rightPanelStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #30363d',
  padding: 8,
  overflow: 'auto',
};

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

const teamTitleStyle = (color: string): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 'bold',
  color,
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 4,
  paddingBottom: 4,
  borderBottom: '1px solid #30363d',
});

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#555',
  textAlign: 'center',
  padding: 20,
};

const arenaPlaceholderStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #30363d',
};

const nextTurnBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#c89033',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 'bold',
  cursor: 'pointer',
};

const nextBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 'bold',
  cursor: 'pointer',
};

const backBtnStyle2: React.CSSProperties = {
  padding: '10px 24px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
};

const bottomStyle: React.CSSProperties = {
  height: 220,
  display: 'flex',
  flexDirection: 'column',
  padding: '0 8px 8px',
  flexShrink: 0,
};

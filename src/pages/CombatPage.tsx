import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { TurnIndicator } from '@/components/CombatUI/TurnIndicator';
import { championDB } from '@/data';
import { ITEM_DATABASE } from '@/data/items';
import { getAugmentDefinition } from '@/data/items/augmentDatabase';
import { getRuneDefinition } from '@/data/items/runeDatabase';
import { AugmentManager } from '@/game/augments/AugmentManager';
import { isFinalRunVictory } from '@/game/battle/runOutcome';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { RuneManager } from '@/game/runes/RuneManager';
import type { CombatEncounter } from '@/game/map/types';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import type { FinalCombatantState, Item, ItemStatBonuses, TeamMember } from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateEventStatBonuses } from '@/utils/statCalculator';
import { logger } from '@/utils/logger';
import { addXp, calculateXpGain } from '@/utils/xpSystem';
import {
  arenaPlaceholderStyle,
  backBtnStyle,
  backBtnStyle2,
  bottomStyle,
  centerStyle,
  containerStyle,
  emptyStyle,
  headerStyle,
  leftPanelStyle,
  mainStyle,
  nextBtnStyle,
  nextTurnBtnStyle,
  rightPanelStyle,
  teamTitleStyle,
} from './combatPageStyles';

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
  const runState = useRunStore.getState();
  const augmentManager = new AugmentManager();
  for (const id of runState.augmentIds) {
    const augment = getAugmentDefinition(id);
    if (augment)
      augmentManager.acquireAugment(augment, runState.currentBiome ?? 'unknown', runState.runLevel);
  }
  augmentManager.biomesCleared = runState.currentBiomeIndex;

  for (const instance of instances) {
    const champ = championDB.getById(instance.id);
    if (!champ) continue;

    // Get enhancement state for this champion
    const enhancementState = runState.authorityAttempt
      ? {
          unlockedNodes:
            runState.authorityAttempt.enhancementSnapshot[instance.id] ??
            runState.authorityAttempt.enhancementSnapshot[instance.id.toLowerCase()] ??
            {},
        }
      : enhancementStore.getEnhancementState(instance.id);

    // Get the enhancement tree for this champion's role
    const tree = enhancementTreeProvider.getTreeForChampion(champ);

    // Calculate stat bonuses from unlocked nodes
    const enhancementBonuses = enhancementService.calculateStatBonuses(
      tree,
      enhancementState.unlockedNodes,
    );
    const flatBonuses = enhancementBonuses.flat as Record<string, number>;
    const percentBonuses = enhancementBonuses.percent as Record<string, number>;
    const statKeyMap: Record<string, string> = {
      hp: 'hp',
      atk: 'attackDamage',
      def: 'armor',
      ap: 'abilityPower',
      spd: 'moveSpeed',
      crit: 'crit',
    };

    const augmentBonuses = augmentManager.getTeamStatBonuses();
    for (const [stat, bonus] of Object.entries(augmentBonuses)) {
      const target = statKeyMap[stat] ?? stat;
      flatBonuses[target] = (flatBonuses[target] || 0) + bonus.flat;
      percentBonuses[target] = (percentBonuses[target] || 0) + bonus.percent;
    }

    const runeManager = new RuneManager();
    for (const id of runState.runeIds) {
      const rune = getRuneDefinition(id);
      if (rune) runeManager.equipRune(rune);
    }
    const baseStats = instance.getStats();
    runeManager.evaluateConditions({
      currentHp: baseStats.hp,
      maxHp: baseStats.hp,
      turnNumber: 1,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      killsThisBattle: 0,
      abilitiesCastThisBattle: 0,
      isBuffed: false,
      isCCd: false,
      alliesAlive: instances.length,
      totalAllies: instances.length,
      lastActionWasCrit: false,
    });
    for (const [stat, bonus] of Object.entries(runeManager.getActiveStatBonuses())) {
      const target = statKeyMap[stat] ?? stat;
      flatBonuses[target] = (flatBonuses[target] || 0) + bonus.flat;
      percentBonuses[target] = (percentBonuses[target] || 0) + bonus.percent;
    }

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
      const passive = ITEM_DATABASE[entry.item.id]?.passive;
      if (passive && (passive.trigger === 'always' || passive.trigger === 'combat_start')) {
        for (const modifier of passive.modifiers) {
          const target = itemStatMap[modifier.stat] ?? modifier.stat;
          if (modifier.type === 'flat') {
            flatBonuses[target] = (flatBonuses[target] || 0) + modifier.value;
          } else {
            percentBonuses[target] = (percentBonuses[target] || 0) + modifier.value;
          }
        }
        enhancementBonuses.effects.push({
          type: `item:${passive.trigger}`,
          description: passive.description,
          value: passive.flatValue,
        });
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
  const runState = useRunStore.getState();
  const unlockedNodes = runState.authorityAttempt
    ? (runState.authorityAttempt.enhancementSnapshot[championId] ??
      runState.authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
      {})
    : useEnhancementStore.getState().getEnhancementState(championId).unlockedNodes;

  if (Object.keys(unlockedNodes).length === 0) return [];

  const champ = championDB.getById(championId);
  if (!champ) return [];

  const tree = enhancementTreeProvider.getTreeForChampion(champ);
  const bonuses = enhancementService.calculateStatBonuses(tree, unlockedNodes);

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
  useRunImagePreload();
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const runLevel = useRunStore((s) => s.runLevel);
  const completedCombatStats = useRunStore((s) => s.completedCombatStats);
  const authorityAttempt = useRunStore((s) => s.authorityAttempt);
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
  const difficultyMultiplier = getDifficultyMultiplier(authorityAttempt?.difficulty ?? difficulty);
  const isAuthorityRun = authorityAttempt !== null;

  const [autoPlay, setAutoPlay] = useState(true);
  const [turnTick, setTurnTick] = useState(0);
  const [selectedTargetId, setSelectedTargetId] = useState<string | 'all'>('all');
  const hasNavigatedAfterLossRef = useRef(false);

  // Restore statistics from encounters completed before a reload/navigation.
  // The current encounter is intentionally not persisted until it is won.
  useEffect(() => {
    if (isActive) {
      runStatsTracker.restore(completedCombatStats);
    }
  }, [completedCombatStats, isActive]);

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
    for (const instance of instances) {
      const ranks = team.find((member) => member.championId === instance.id)?.spellRanks;
      for (const slot of ['Q', 'W', 'E', 'R'] as const) {
        instance.setSpellRank(slot, ranks?.[slot] ?? 1);
      }
    }
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
        logger.debug('[CombatPage] Enhancement bonuses for', member.championId, ':', descs);
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
      logger.error('CombatPage: Player team is empty but run has champions.');
      logger.debug('Champion IDs in team:', championIds);
      logger.debug('Champion DB size:', championDB.count());
      // Try to look up each champion to see which ones are missing
      for (const id of championIds) {
        const champ = championDB.getById(id);
        logger.debug(`Champion "${id}" lookup result:`, champ ? 'FOUND' : 'NOT FOUND');
      }
      hasNavigatedAfterLossRef.current = true;
      void finalizeCombatRun('enemy', []).then((outcome) => {
        if (outcome.completed || outcome.queuedForRetry) {
          navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
        }
      });
    }
  }, [isActive, playerInstances.length, team.length, team, navigate]);

  // Build HP overrides from persisted team state, clamped to max HP
  const initialHpOverrides = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) {
      if (t.currentHp !== undefined) {
        const instance = playerInstances.find((champion) => champion.id === t.championId);
        if (instance) {
          const maxHp = instance.getEnhancedStats().hp;
          // Clamp current HP to max HP to prevent exceeding maximum after level up
          m[t.championId] = Math.min(t.currentHp, maxHp);
        } else {
          m[t.championId] = t.currentHp;
        }
      }
    }
    return Object.keys(m).length > 0 ? m : undefined;
  }, [team, playerInstances]);
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
    (w: 'player' | 'enemy' | 'draw', finalPlayerStates: FinalCombatantState[]) => {
      const commandState = useRunStore.getState();
      const combatNodeId = commandState.currentNodeId;
      if (
        combatNodeId &&
        !commandState.recordRunCommand(
          { kind: 'resolve_combat', nodeId: combatNodeId },
          `resolve_combat:${commandState.currentBiomeIndex}:${combatNodeId}`,
        )
      ) {
        logger.error('CombatPage: unable to record the authoritative combat resolution.');
        return;
      }

      if (w === 'player') {
        const runStore = useRunStore.getState();
        const finalHpByChampionId = new Map(
          finalPlayerStates.map((champion) => [champion.championId, champion.currentHp] as const),
        );

        // 1. Award gold: 50 + runLevel * 10
        const goldReward = 50 + runLevel * 10;
        runStore.addGold(goldReward);

        // 2. Award XP to all surviving player champions
        const currentNode = runStore.getCurrentNode();
        const isBossNode = currentNode?.type === 'boss';
        const isEliteNode = currentNode?.type === 'elite';
        const xpGain = calculateXpGain(runLevel, isEliteNode, isBossNode);

        // Update each team member with XP and potential level-ups
        const previousTeam = runStore.team;
        const teamUpdates = previousTeam.map((member) => {
          const currentLevel = member.level ?? 1;
          const currentXp = member.currentXp ?? 0;
          const result = addXp(currentLevel, currentXp, xpGain);

          return {
            championId: member.championId,
            currentHp: finalHpByChampionId.get(member.championId) ?? member.currentHp ?? 0,
            currentMp:
              finalPlayerStates.find((champion) => champion.championId === member.championId)
                ?.currentMp ??
              member.currentMp ??
              0,
            level: result.newLevel,
            currentXp: result.remainingXp,
          };
        });

        runStore.updateTeamAfterCombat(teamUpdates);
        const pendingSpellUpgrades = teamUpdates.flatMap((update, index) =>
          Array.from(
            {
              length: Math.max(0, update.level - (previousTeam[index]?.level ?? 1)),
            },
            () => update.championId,
          ),
        );
        const levelsGained = pendingSpellUpgrades.length;
        runStore.queueSpellUpgrades(pendingSpellUpgrades);

        // 3. Advance wave
        runStore.nextWave();

        // 4. Complete current map node (unlocks next nodes)
        let advancedToNextBiome = false;
        if (currentNode) {
          // 5. Item drop chance (~20%) — scoped to this run and encounter.
          const completedWaveCount = useRunStore.getState().totalWavesCompleted;
          const itemRng = createScopedRunRng(
            runStore.seed,
            `drop:${currentNode.id}:${completedWaveCount}`,
          );
          let droppedItemName: string | null = null;
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
              droppedItemName = item.name;
            }
          }
          runStore.setLastCombatRewards({
            xp: xpGain,
            gold: goldReward,
            itemName: droppedItemName,
            levelsGained,
          });

          // 6. Resolve encounter (completes the node)
          if (!runStore.resolveEncounter()) {
            logger.error('CombatPage: unable to record the completed combat node.');
            return;
          }

          // 7. Check if we just completed the boss -- advance to next biome
          if (isBossNode) {
            runStore.incrementRunLevel();
            advancedToNextBiome = runStore.advanceToNextBiome();
          }
        }

        // Only the boss of the last biome ends the run.
        if (isFinalRunVictory(isBossNode, advancedToNextBiome)) {
          void finalizeCombatRun('player', finalPlayerStates).then((outcome) => {
            if (outcome.completed || outcome.queuedForRetry) {
              navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
            }
          });
          return;
        }

        // Persist the cumulative stats only after the encounter has completed.
        useRunStore.setState({ completedCombatStats: runStatsTracker.toArray() });

        // Navigate back to the map to choose the next node
        navigate(ROUTES.RUN);
      } else {
        void finalizeCombatRun(w, finalPlayerStates).then((outcome) => {
          if (outcome.completed || outcome.queuedForRetry) {
            navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
          }
        });
      }
    },
    [runLevel, navigate],
  );

  const { processTurn, submitAction } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: isAuthorityRun ? true : autoPlay,
    onComplete: handleComplete,
    initialHpOverrides,
    random: battleRandom,
  });

  const handleCast = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      if (isAuthorityRun) return;
      const actionType = SLOT_TO_ACTION[slot];
      if (!actionType) return;
      submitAction({ type: actionType, cost: 0, targetId: selectedTargetId });
    },
    [isAuthorityRun, submitAction, selectedTargetId],
  );

  // Auto-process all turns when autoPlay is enabled
  useEffect(() => {
    if ((isAuthorityRun || autoPlay) && battlePhase === 'turn_active') {
      const delay = Math.max(50, 400 / battleSpeed);
      const timer = setTimeout(() => {
        processTurn();
        setTurnTick((t) => t + 1);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, isAuthorityRun, battlePhase, processTurn, turnTick, battleSpeed]);

  const currentChampion = [...playerTeam, ...enemyTeam].find((c) => c.id === currentTurnChampionId);
  const currentSpell = currentChampion?.spells;

  // Keyboard shortcuts
  const canCast = !isAuthorityRun && isPlayerTurn && battlePhase === 'turn_active';
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
      !isAuthorityRun && (!autoPlay || isPlayerTurn) && battlePhase === 'turn_active'
        ? processTurn
        : undefined,
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
          disabled={isAuthorityRun}
          onClick={() => {
            if (isAuthorityRun) return;
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
            cursor: isAuthorityRun ? 'not-allowed' : 'pointer',
          }}
          aria-label="Toggle auto-play"
        >
          Auto: {isAuthorityRun || autoPlay ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Main area */}
      <div className="combat-layout" style={mainStyle}>
        {/* Player team panel */}
        <div className="combat-team-panel" style={leftPanelStyle}>
          <div style={teamTitleStyle('#3b82f6')}>Votre équipe</div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.id}`}
              combatant={c}
              isActive={c.id === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
              isSelected={selectedTargetId === c.id}
              onSelect={() => setSelectedTargetId(c.id)}
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
              {!isAuthorityRun && (!autoPlay || isPlayerTurn) && (
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
        <div className="combat-team-panel" style={rightPanelStyle}>
          <div style={teamTitleStyle('#ef4444')}>Ennemis</div>
          {enemyTeam.map((c, i) => (
            <CombatantPortrait
              key={`${c.id}-${i}`}
              combatant={c}
              isActive={c.id === currentTurnChampionId}
              isSelected={selectedTargetId === c.id}
              onSelect={() => setSelectedTargetId(c.id)}
            />
          ))}
          {enemyTeam.length === 0 && <div style={emptyStyle}>Aucun ennemi</div>}
        </div>
      </div>

      {/* Bottom: ability bar + log */}
      <div style={bottomStyle}>
        {!isAuthorityRun && isPlayerTurn && currentChampion && !currentChampion.isDefeated && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              aria-pressed={selectedTargetId === 'all'}
              onClick={() => setSelectedTargetId('all')}
            >
              Zone
            </button>
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

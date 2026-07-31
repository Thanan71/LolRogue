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
import { AugmentManager } from '@/game/augments/AugmentManager';
import {
  DEFAULT_COMBAT_AUTOPLAY,
  getAutoTurnDelayMs,
  shouldAutoAdvanceCombatTurn,
  supportsManualAuthorityCombat,
} from '@/game/battle/autoplay';
import { isFinalRunVictory } from '@/game/battle/runOutcome';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { ActionType } from '@/game/battle/types';
import type { BattleEvent } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { NodeType, type CombatEncounter } from '@/game/map/types';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import { UNAVAILABLE_ENHANCEMENT_EFFECTS } from '@/game/rules/catalogSupport';
import {
  buildResolvedEnemyTeam,
  itemDefinitionToRunItem,
  resolveCombatEncounter,
} from '@/game/run/encounterResolver';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import type { FinalCombatantState, TeamMember } from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateEventStatBonuses, toCombatStatKey } from '@/utils/statCalculator';
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
    instance.setMasteryLevel(
      runState.authorityAttempt
        ? (runState.authorityAttempt.masterySnapshot?.[instance.id] ??
            runState.authorityAttempt.masterySnapshot?.[instance.id.toLowerCase()] ??
            0)
        : useMasteryStore.getState().getChampionMastery(instance.id).level,
    );

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
    const augmentBonuses = augmentManager.getTeamStatBonuses();
    for (const [stat, bonus] of Object.entries(augmentBonuses)) {
      const target = toCombatStatKey(stat) ?? stat;
      flatBonuses[target] = (flatBonuses[target] || 0) + bonus.flat;
      percentBonuses[target] = (percentBonuses[target] || 0) + bonus.percent;
    }

    // Calculate item bonuses
    const equippedItems = inventory.filter((entry) => entry.equippedToChampionId === instance.id);
    for (const entry of equippedItems) {
      const itemStats = entry.item.stats;
      // Map item stat keys to CalculatedStats keys (used by ChampionInstance)
      for (const [key, value] of Object.entries(itemStats)) {
        const calcStatsKey = toCombatStatKey(key);
        if (calcStatsKey && value) {
          // EnhancementStatBonuses.flat uses StatType keys, but ChampionInstance
          // applies them by casting to keyof CalculatedStats, so we need to use
          // the CalculatedStats key names
          flatBonuses[calcStatsKey] = (flatBonuses[calcStatsKey] || 0) + value;
        }
      }
      const passive = ITEM_DATABASE[entry.item.id]?.passive;
      if (passive?.trigger === 'always') {
        for (const modifier of passive.modifiers) {
          const target = toCombatStatKey(modifier.stat) ?? modifier.stat;
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
      descriptions.push(
        stat === 'attackRange' ? `+${value} ${name} (indisponible)` : `+${value} ${name}`,
      );
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
      descriptions.push(
        stat === 'attackRange'
          ? `+${Math.round(percent * 100)}% ${name} (indisponible)`
          : `+${Math.round(percent * 100)}% ${name}`,
      );
    }
  }

  // Add effect descriptions
  for (const effect of bonuses.effects) {
    if (effect.description) {
      descriptions.push(
        UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type)
          ? `${effect.description} (indisponible)`
          : effect.description,
      );
    }
  }

  return descriptions;
}

const LEGACY_ENCOUNTER_ENGINE_VERSIONS = new Set([
  'run-engine-v1',
  'run-engine-v2',
  'run-engine-v3',
  'run-engine-v4',
  'run-engine-v5',
]);

/**
 * Compatibility adapter for an attempt created before encounter ruleset v1.
 * It must remain byte-for-byte equivalent in behavior to those archived
 * authority engines until their attempts have expired.
 */
function buildLegacyEnemyTeam(
  encounter: CombatEncounter,
  difficultyMultiplier: number,
): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const enemy of encounter.enemies) {
    const champion = championDB.getById(enemy.championId);
    if (!champion) continue;
    const level = enemy.level ?? 1;
    const multiplier = (enemy.statMultiplier || 1) * difficultyMultiplier;
    if (multiplier === 1) {
      instances.push(new ChampionInstance(champion, level));
      continue;
    }

    const base = champion.stats;
    const scaledChampion = {
      ...champion,
      stats: {
        ...base,
        hp: Math.round(base.hp * multiplier),
        hpPerLevel: Math.round(base.hpPerLevel * multiplier),
        mp: Math.round(base.mp * multiplier),
        mpPerLevel: Math.round(base.mpPerLevel * multiplier),
        armor: Math.round(base.armor * multiplier),
        armorPerLevel: Math.round(base.armorPerLevel * multiplier),
        magicResist: Math.round(base.magicResist * multiplier),
        magicResistPerLevel: Math.round(base.magicResistPerLevel * multiplier),
        attackDamage: Math.round(base.attackDamage * multiplier),
        attackDamagePerLevel: Math.round(base.attackDamagePerLevel * multiplier),
        attackSpeed: Math.round(base.attackSpeed * multiplier * 100) / 100,
        attackSpeedPerLevel: Math.round(base.attackSpeedPerLevel * multiplier * 100) / 100,
        hpRegen: Math.round(base.hpRegen * multiplier * 10) / 10,
        hpRegenPerLevel: Math.round(base.hpRegenPerLevel * multiplier * 10) / 10,
        mpRegen: Math.round(base.mpRegen * multiplier * 10) / 10,
        mpRegenPerLevel: Math.round(base.mpRegenPerLevel * multiplier * 10) / 10,
        crit: Math.round(base.crit * multiplier * 10) / 10,
        critPerLevel: Math.round(base.critPerLevel * multiplier * 10) / 10,
      },
    };
    instances.push(new ChampionInstance(scaledChampion, level));
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
  const currentWave = useRunStore((s) => s.currentWave);
  const authorityAttempt = useRunStore((s) => s.authorityAttempt);
  const runeIds = useRunStore((s) => s.runeIds);
  const runeStacks = useRunStore((s) => s.runeStacks);
  const augmentIds = useRunStore((s) => s.augmentIds);
  const enhancementStates = useEnhancementStore((s) => s.enhancements);
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
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled);
  const setKeyboardShortcutsEnabled = useSettingsStore((s) => s.setKeyboardShortcutsEnabled);
  const effectiveDifficulty = authorityAttempt?.difficulty ?? difficulty;
  const isAuthorityRun = authorityAttempt !== null;
  const usesLegacyEncounterRules =
    authorityAttempt !== null &&
    LEGACY_ENCOUNTER_ENGINE_VERSIONS.has(authorityAttempt.engineVersion);
  const supportsManualCombat = supportsManualAuthorityCombat(authorityAttempt?.engineVersion);
  const requiresServerAutoPlay = isAuthorityRun && !supportsManualCombat;

  const [autoPlay, setAutoPlay] = useState(DEFAULT_COMBAT_AUTOPLAY);
  const [autoActionRemainingMs, setAutoActionRemainingMs] = useState<number | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [pendingActionType, setPendingActionType] = useState<ActionType>();
  const hasNavigatedAfterLossRef = useRef(false);

  // Reset the ref when battlePhase changes to starting (new combat)
  useEffect(() => {
    if (battlePhase === 'starting') {
      hasNavigatedAfterLossRef.current = false;
      setAutoPlay(false);
      setAutoActionRemainingMs(null);
    }
  }, [battlePhase]);

  useEffect(() => {
    setSelectedTargetId(undefined);
    setPendingActionType(undefined);
  }, [currentTurnChampionId, currentTurnSide]);

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
  const ruleLoadout = useMemo(
    () =>
      buildCombatRuleLoadout({
        championIds: team.map((member) => member.championId),
        runeIds,
        runeStacks,
        augmentIds,
        inventory,
        getUnlockedEnhancements: (championId) =>
          authorityAttempt
            ? (authorityAttempt.enhancementSnapshot[championId] ??
              authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
              {})
            : (enhancementStates[championId]?.unlockedNodes ?? {}),
      }),
    [augmentIds, authorityAttempt, enhancementStates, inventory, runeIds, runeStacks, team],
  );

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
  const currentNode = useMemo(() => useRunStore.getState().getCurrentNode(), [currentNodeId]);
  const battleRandom = useMemo(() => {
    const rng = createScopedRunRng(
      runSeed,
      `combat:${currentEncounter?.id ?? currentNodeId ?? 'unknown'}`,
    );
    return () => rng.next();
  }, [currentEncounter?.id, currentNodeId, runSeed]);

  // Memoize enemy instances to prevent recreation on every render
  const enemyInstances = useMemo(() => {
    if (
      !currentEncounter ||
      currentEncounter.type !== 'combat' ||
      !currentNode ||
      ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(currentNode.type)
    ) {
      return [];
    }
    if (usesLegacyEncounterRules) {
      return buildLegacyEnemyTeam(currentEncounter, getDifficultyMultiplier(effectiveDifficulty));
    }
    return buildResolvedEnemyTeam(
      resolveCombatEncounter({
        seed: runSeed,
        nodeId: currentNode.id,
        biome: currentNode.biome,
        nodeType: currentNode.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
        wave: currentWave,
        runLevel,
        difficulty: effectiveDifficulty,
        encounter: currentEncounter,
        inventory,
      }),
    );
  }, [
    currentEncounter?.id,
    currentEncounter?.type,
    currentNode,
    currentWave,
    effectiveDifficulty,
    inventory,
    runLevel,
    runSeed,
    usesLegacyEncounterRules,
  ]);

  const handleComplete = useCallback(
    (
      w: 'player' | 'enemy' | 'draw',
      finalPlayerStates: FinalCombatantState[],
      consumedItemInstanceIds: string[],
      nextRuneStacks: Record<string, Record<string, number>>,
      playerActionTrace: import('@/game/battle/actionTrace').CombatActionTrace,
      combatEvents: BattleEvent[] = [],
    ) => {
      const commandState = useRunStore.getState();
      const combatNodeId = commandState.currentNodeId;
      const previousClaims = commandState.claimedEncounterNodeIds;
      if (
        !combatNodeId ||
        !commandState.claimCurrentEncounter() ||
        !useRunStore.getState().recordRunCommand(
          {
            kind: 'resolve_combat',
            nodeId: combatNodeId,
            actions: supportsManualCombat ? playerActionTrace : undefined,
          },
          `resolve_combat:${commandState.currentBiomeIndex}:${combatNodeId}`,
        )
      ) {
        useRunStore.setState({ claimedEncounterNodeIds: previousClaims });
        logger.error('CombatPage: unable to record the authoritative combat resolution.');
        return;
      }
      useRunStore.getState().consumeItems(consumedItemInstanceIds, {
        source: 'combat',
        nodeId: combatNodeId,
        wave: commandState.currentWave,
      });
      useRunStore.getState().setRuneStacks(nextRuneStacks);
      useRunStore.getState().commitCombatEvents(combatEvents);

      if (w === 'player') {
        const runStore = useRunStore.getState();
        const finalHpByChampionId = new Map(
          finalPlayerStates.map((champion) => [champion.championId, champion.currentHp] as const),
        );

        const currentNode = runStore.getCurrentNode();
        const encounter = currentNode?.encounter;
        if (
          !currentNode ||
          encounter?.type !== 'combat' ||
          ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(currentNode.type)
        ) {
          logger.error('CombatPage: the resolved combat encounter is unavailable.');
          return;
        }

        const augmentManager = new AugmentManager();
        for (const id of runStore.augmentIds) {
          const definition = getAugmentDefinition(id);
          if (definition) augmentManager.acquireAugment(definition);
        }
        const usesLegacyRewards =
          runStore.authorityAttempt !== null &&
          LEGACY_ENCOUNTER_ENGINE_VERSIONS.has(runStore.authorityAttempt.engineVersion);
        const resolution = usesLegacyRewards
          ? null
          : resolveCombatEncounter({
              seed: runStore.seed,
              nodeId: currentNode.id,
              biome: currentNode.biome,
              nodeType: currentNode.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
              wave: runStore.currentWave,
              runLevel: runStore.runLevel,
              difficulty:
                runStore.authorityAttempt?.difficulty ?? useSettingsStore.getState().difficulty,
              encounter,
              inventory: runStore.inventory,
              bonusGold: augmentManager.getBonusGold(),
            });
        const goldReward =
          resolution?.reward.gold ?? 50 + runStore.runLevel * 10 + augmentManager.getBonusGold();
        runStore.addGold(goldReward, {
          source: 'combat',
          nodeId: currentNode.id,
          wave: runStore.currentWave,
        });

        // Team XP includes KO champions by design. This avoids a permanent
        // snowball and matches the authority replay and reward copy.
        const isBossNode = currentNode?.type === 'boss';
        const xpGain =
          resolution?.reward.xpPerChampion ??
          calculateXpGain(runStore.runLevel, currentNode.type === NodeType.Elite, isBossNode);

        const previousTeam = runStore.team;
        const teamUpdates = previousTeam.map((member) => {
          const currentLevel = member.level ?? 1;
          const currentXp = member.currentXp ?? 0;
          const result = addXp(currentLevel, currentXp, xpGain);
          const implicitMaxHp =
            playerInstances
              .find((champion) => champion.id === member.championId)
              ?.getEnhancedStats().hp ?? 1;

          return {
            championId: member.championId,
            currentHp: Math.min(
              implicitMaxHp,
              (finalHpByChampionId.get(member.championId) ?? member.currentHp ?? implicitMaxHp) +
                implicitMaxHp * augmentManager.getHealAfterBattlePercent(),
            ),
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

        let droppedItemName: string | null = null;
        if (resolution?.reward.droppedItem) {
          const itemResult = runStore.addItem(resolution.reward.droppedItem, {
            source: 'combat',
            nodeId: currentNode.id,
            wave: runStore.currentWave,
          });
          if (itemResult.success) droppedItemName = resolution.reward.droppedItem.name;
        }

        // Legacy engines chose their drop after incrementing the wave and used
        // a different RNG scope. Preserve it only for in-flight old attempts.
        runStore.completeCombatProgression();
        if (usesLegacyRewards) {
          const itemRng = createScopedRunRng(
            runStore.seed,
            `drop:${currentNode.id}:${useRunStore.getState().totalWavesCompleted}`,
          );
          if (itemRng.next() < 0.2) {
            const definitions = Object.values(ITEM_DATABASE);
            const definition = definitions[Math.floor(itemRng.next() * definitions.length)];
            if (definition) {
              const item = itemDefinitionToRunItem(definition);
              const itemResult = runStore.addItem(item, {
                source: 'combat',
                nodeId: currentNode.id,
                wave: runStore.currentWave,
              });
              if (itemResult.success) droppedItemName = item.name;
            }
          }
        }
        runStore.setLastCombatRewards({
          xp: xpGain,
          gold: goldReward,
          itemName: droppedItemName,
          levelsGained,
        });

        // Complete current map node (unlocks next nodes).
        let advancedToNextBiome = false;
        if (currentNode) {
          // 6. Resolve encounter (completes the node)
          if (!runStore.resolveEncounter()) {
            logger.error('CombatPage: unable to record the completed combat node.');
            return;
          }

          // 7. Check if we just completed the boss -- advance to next biome
          if (isBossNode) {
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
    [runLevel, navigate, supportsManualCombat],
  );

  const { processTurn, submitAction, getAvailableActions } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: requiresServerAutoPlay ? true : autoPlay,
    onComplete: handleComplete,
    initialHpOverrides,
    random: battleRandom,
    ruleLoadout,
  });

  const currentChampion = [...playerTeam, ...enemyTeam].find(
    (c) => c.targetId === currentTurnChampionId && c.side === currentTurnSide,
  );
  const currentSpell = currentChampion?.spells;

  const chooseAction = useCallback(
    (actionType: ActionType) => {
      if (requiresServerAutoPlay) return;
      const option = getAvailableActions().find((candidate) => candidate.type === actionType);
      if (!option) return;

      if (option.requiresTarget && !option.validTargetIds.includes(selectedTargetId ?? '')) {
        setSelectedTargetId(undefined);
        setPendingActionType(actionType);
        return;
      }

      const accepted = submitAction({
        type: actionType,
        targetId: option.requiresTarget ? selectedTargetId : undefined,
      });
      if (accepted) {
        setSelectedTargetId(undefined);
        setPendingActionType(undefined);
      }
    },
    [getAvailableActions, requiresServerAutoPlay, selectedTargetId, submitAction],
  );

  const handleCast = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      const actionType = SLOT_TO_ACTION[slot];
      if (!actionType) return;
      chooseAction(actionType);
    },
    [chooseAction],
  );

  const handleTargetSelect = useCallback(
    (targetId: string) => {
      const options = getAvailableActions();
      if (pendingActionType) {
        const pending = options.find((candidate) => candidate.type === pendingActionType);
        if (!pending?.validTargetIds.includes(targetId)) return;
        const accepted = submitAction({ type: pendingActionType, targetId });
        if (accepted) {
          setSelectedTargetId(undefined);
          setPendingActionType(undefined);
        }
        return;
      }

      if (options.some((option) => option.validTargetIds.includes(targetId))) {
        setSelectedTargetId(targetId);
      }
    },
    [getAvailableActions, pendingActionType, submitAction],
  );

  const autoActionDelayMs = getAutoTurnDelayMs(battleSpeed);
  const shouldAutoAdvance = shouldAutoAdvanceCombatTurn({
    phase: battlePhase,
    isAuthorityRun: requiresServerAutoPlay,
    autoPlay,
    isPlayerTurn,
  });

  // Enemy turns continue automatically in manual mode. Player turns only receive
  // a timer after the player explicitly enables auto-play.
  useEffect(() => {
    if (!shouldAutoAdvance) {
      setAutoActionRemainingMs(null);
      return;
    }

    const scheduledTurn = {
      championId: currentTurnChampionId,
      side: currentTurnSide,
      round,
    };
    const startedAt = Date.now();
    setAutoActionRemainingMs(autoActionDelayMs);
    const countdown = window.setInterval(() => {
      setAutoActionRemainingMs(Math.max(0, autoActionDelayMs - (Date.now() - startedAt)));
    }, 100);
    const timer = window.setTimeout(() => {
      const current = useBattleStore.getState();
      if (
        current.phase === 'turn_active' &&
        current.currentTurnChampionId === scheduledTurn.championId &&
        current.currentTurnSide === scheduledTurn.side &&
        current.round === scheduledTurn.round
      ) {
        processTurn();
      }
      setAutoActionRemainingMs(null);
    }, autoActionDelayMs);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [
    autoActionDelayMs,
    currentTurnChampionId,
    currentTurnSide,
    processTurn,
    round,
    shouldAutoAdvance,
  ]);

  // Keyboard shortcuts
  const canCast = !requiresServerAutoPlay && isPlayerTurn && battlePhase === 'turn_active';
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
      !requiresServerAutoPlay && !autoPlay && isPlayerTurn && battlePhase === 'turn_active'
        ? processTurn
        : undefined,
    onBack: canLeaveActiveCombat(battlePhase) ? () => navigate(ROUTES.RUN) : undefined,
    enabled: keyboardShortcutsEnabled && battlePhase !== 'finished',
  });

  if (!isActive) return null;

  const visibleActionOptions =
    !requiresServerAutoPlay && isPlayerTurn && battlePhase === 'turn_active'
      ? getAvailableActions()
      : [];
  const pendingOption = visibleActionOptions.find(
    (candidate) => candidate.type === pendingActionType,
  );
  const selectableTargetIds = new Set(
    pendingOption
      ? pendingOption.validTargetIds
      : visibleActionOptions.flatMap((option) => option.validTargetIds),
  );

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
          type="button"
          disabled={requiresServerAutoPlay}
          onClick={() => {
            if (requiresServerAutoPlay) return;
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
            cursor: requiresServerAutoPlay ? 'not-allowed' : 'pointer',
          }}
          aria-label={
            requiresServerAutoPlay
              ? 'Mode automatique serveur activé'
              : autoPlay
                ? 'Désactiver le mode automatique'
                : 'Activer le mode automatique'
          }
          aria-pressed={requiresServerAutoPlay || autoPlay}
          aria-describedby="combat-auto-status"
          title={
            requiresServerAutoPlay
              ? 'La résolution automatique est requise pour cette run vérifiée.'
              : 'Active ou désactive les actions automatiques du joueur.'
          }
        >
          {requiresServerAutoPlay ? 'Auto serveur' : `Auto : ${autoPlay ? 'ON' : 'OFF'}`}
        </button>
      </div>

      {/* Main area */}
      <div className="combat-layout" style={mainStyle}>
        {/* Player team panel */}
        <div className="combat-team-panel" style={leftPanelStyle}>
          <div style={teamTitleStyle('#3b82f6')}>Votre équipe</div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.targetId}`}
              combatant={c}
              isActive={c.targetId === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
              isSelected={selectedTargetId === c.targetId}
              onSelect={
                !c.isDefeated && selectableTargetIds.has(c.targetId)
                  ? () => handleTargetSelect(c.targetId)
                  : undefined
              }
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
              <div
                id="combat-auto-status"
                aria-live="off"
                style={{ color: '#8b949e', fontSize: 12, marginTop: 10 }}
              >
                {autoActionRemainingMs !== null
                  ? `${
                      requiresServerAutoPlay
                        ? 'Résolution serveur'
                        : isPlayerTurn
                          ? 'Action automatique'
                          : 'Action ennemie'
                    } dans ${(autoActionRemainingMs / 1000).toFixed(1)} s`
                  : isPlayerTurn
                    ? 'Mode manuel — choisissez une action ou appuyez sur Espace.'
                    : "En attente du tour de l'ennemi…"}
              </div>
              {!requiresServerAutoPlay && !autoPlay && isPlayerTurn && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={processTurn}
                    style={nextTurnBtnStyle}
                    aria-label="Execute turn (Space)"
                    aria-keyshortcuts="Space"
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
          {enemyTeam.map((c) => (
            <CombatantPortrait
              key={`enemy-${c.targetId}`}
              combatant={c}
              isActive={c.targetId === currentTurnChampionId}
              isSelected={selectedTargetId === c.targetId}
              onSelect={
                !c.isDefeated && selectableTargetIds.has(c.targetId)
                  ? () => handleTargetSelect(c.targetId)
                  : undefined
              }
            />
          ))}
          {enemyTeam.length === 0 && <div style={emptyStyle}>Aucun ennemi</div>}
        </div>
      </div>

      {/* Bottom: ability bar + log */}
      <div style={bottomStyle}>
        {!requiresServerAutoPlay &&
          isPlayerTurn &&
          currentChampion &&
          !currentChampion.isDefeated && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <button
                type="button"
                disabled={
                  !visibleActionOptions.some(
                    (candidate) => candidate.type === ActionType.BasicAttack,
                  )
                }
                onClick={() => chooseAction(ActionType.BasicAttack)}
                style={nextTurnBtnStyle}
                aria-label="Attaque de base"
              >
                ⚔ Attaque
              </button>
              <AbilityBar champion={currentChampion} onCast={handleCast} />
              {pendingOption && (
                <div
                  role="status"
                  style={{ width: '100%', textAlign: 'center', color: '#c8aa6e', fontSize: 12 }}
                >
                  Choisissez une cible valide.
                </div>
              )}
            </div>
          )}
        <details
          style={{
            margin: '0 auto 8px',
            maxWidth: 680,
            color: '#8b949e',
            fontSize: 12,
            textAlign: 'left',
          }}
        >
          <summary style={{ color: '#c8aa6e', cursor: 'pointer' }}>
            Raccourcis clavier — {keyboardShortcutsEnabled ? 'activés' : 'désactivés'}
          </summary>
          <div style={{ padding: '8px 0', lineHeight: 1.6 }}>
            <div>Q / W / E / R : choisir un sort disponible.</div>
            <div>Espace : exécuter le tour manuel.</div>
            <div>Échap : retourner à la carte lorsque le combat est terminé.</div>
            <div>Tab puis Entrée ou Espace : activer le contrôle ayant le focus.</div>
            <button
              type="button"
              onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              aria-pressed={keyboardShortcutsEnabled}
              style={{ ...nextTurnBtnStyle, marginTop: 6 }}
            >
              {keyboardShortcutsEnabled ? 'Désactiver les raccourcis' : 'Activer les raccourcis'}
            </button>
          </div>
        </details>
        <div style={{ flex: 1, minHeight: 0 }}>
          <CombatLog />
        </div>
      </div>
    </div>
  );
}

import type { BattleEvent } from '@/game/battle/types';
import type {
  ChampionRunStats,
  RunItemLedgerAction,
  RunLedger,
  RunLedgerContext,
  RunSummary,
  TeamMember,
} from '@/types/run';

export const RUN_LEDGER_VERSION = 1 as const;

function emptyChampionLedger(): RunLedger['champions'][string] {
  return {
    kills: 0,
    assists: 0,
    damageDealt: 0,
    damageToShields: 0,
    damageReceived: 0,
    healingDone: 0,
    healingReceived: 0,
    overhealing: 0,
    shieldingDone: 0,
    shieldingAbsorbed: 0,
    deaths: 0,
  };
}

export function createRunLedger(championIds: readonly string[] = []): RunLedger {
  return {
    version: RUN_LEDGER_VERSION,
    champions: Object.fromEntries(championIds.map((id) => [id, emptyChampionLedger()])),
    gold: { earned: 0, spent: 0 },
    items: [],
    nextItemEventSequence: 1,
  };
}

export function cloneRunLedger(ledger: RunLedger): RunLedger {
  return {
    version: RUN_LEDGER_VERSION,
    champions: Object.fromEntries(
      Object.entries(ledger.champions).map(([id, stats]) => [id, { ...stats }]),
    ),
    gold: { ...ledger.gold },
    items: ledger.items.map((event) => ({ ...event })),
    nextItemEventSequence: ledger.nextItemEventSequence,
  };
}

export function ensureLedgerChampion(ledger: RunLedger, championId: string): void {
  ledger.champions[championId] ??= emptyChampionLedger();
}

export function recordGoldGain(ledger: RunLedger, amount: number): RunLedger {
  const next = cloneRunLedger(ledger);
  next.gold.earned += Math.max(0, Math.round(amount));
  return next;
}

export function recordGoldSpend(ledger: RunLedger, amount: number): RunLedger {
  const next = cloneRunLedger(ledger);
  next.gold.spent += Math.max(0, Math.round(amount));
  return next;
}

export function recordItemLedgerEvent(
  ledger: RunLedger,
  input: {
    action: RunItemLedgerAction;
    itemId: string;
    instanceId: string;
    championId?: string | null;
    goldAmount?: number;
    context: RunLedgerContext;
  },
): RunLedger {
  const next = cloneRunLedger(ledger);
  next.items.push({
    sequence: next.nextItemEventSequence,
    action: input.action,
    source: input.context.source,
    itemId: input.itemId,
    instanceId: input.instanceId,
    championId: input.championId ?? null,
    goldAmount: Math.max(0, Math.round(input.goldAmount ?? 0)),
    nodeId: input.context.nodeId ?? null,
    wave: Math.max(1, Math.trunc(input.context.wave ?? 1)),
  });
  next.nextItemEventSequence++;
  return next;
}

function effectiveDamage(event: Extract<BattleEvent, { type: 'damage' }>): {
  hp: number;
  shield: number;
} {
  const shield = Math.max(0, Math.round(event.shieldDamage ?? 0));
  const hp = Math.max(0, Math.round(event.hpDamage ?? event.amount - shield));
  return { hp, shield };
}

/**
 * Commits one completed battle atomically. Partial battles are intentionally
 * absent from the persistent ledger, so a refresh can replay them safely.
 */
export function commitCombatEvents(
  ledger: RunLedger,
  events: readonly BattleEvent[],
  teamIds: readonly string[],
): RunLedger {
  const next = cloneRunLedger(ledger);
  const playerIds = new Set(teamIds);
  for (const championId of playerIds) ensureLedgerChampion(next, championId);
  const contributors = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.type === 'damage') {
      const damage = effectiveDamage(event);
      const targetKey = event.targetCombatantId ?? event.target;
      if (event.sourceSide === 'player' && playerIds.has(event.source)) {
        const stats = next.champions[event.source];
        stats.damageDealt += damage.hp;
        stats.damageToShields += damage.shield;
        if (event.targetSide === 'enemy' && damage.hp + damage.shield > 0) {
          const sources = contributors.get(targetKey) ?? new Set<string>();
          sources.add(event.source);
          contributors.set(targetKey, sources);
        }
      }
      if (event.targetSide === 'player' && playerIds.has(event.target)) {
        next.champions[event.target].damageReceived += damage.hp;
      }
      for (const [championId, amount] of Object.entries(event.shieldAbsorbedBySource ?? {})) {
        if (playerIds.has(championId)) {
          next.champions[championId].shieldingAbsorbed += Math.max(0, Math.round(amount));
        }
      }
      continue;
    }

    if (event.type === 'heal') {
      const applied = Math.max(0, Math.round(event.amount));
      const overhealing = Math.max(0, Math.round(event.overheal ?? 0));
      if (event.sourceSide === 'player' && playerIds.has(event.source)) {
        next.champions[event.source].healingDone += applied;
        next.champions[event.source].overhealing += overhealing;
      }
      if (event.targetSide === 'player' && playerIds.has(event.target)) {
        next.champions[event.target].healingReceived += applied;
      }
      continue;
    }

    if (event.type === 'shield') {
      if (event.countsAsShield === false) continue;
      if (event.sourceSide === 'player' && playerIds.has(event.source)) {
        next.champions[event.source].shieldingDone += Math.max(0, Math.round(event.amount));
      }
      continue;
    }

    // Observability-only combat events never alter persisted player progression.
    if (event.type === 'crowd_control_applied' || event.type === 'turn_skipped') continue;

    if (event.type !== 'defeat') continue;
    if (event.side === 'player' && playerIds.has(event.champion)) {
      next.champions[event.champion].deaths++;
      continue;
    }
    if (event.side !== 'enemy' || !event.defeatedBy || !playerIds.has(event.defeatedBy)) continue;

    next.champions[event.defeatedBy].kills++;
    const targetKey = event.combatantId ?? event.champion;
    for (const contributor of contributors.get(targetKey) ?? []) {
      if (contributor !== event.defeatedBy) next.champions[contributor].assists++;
    }
    contributors.delete(targetKey);
  }

  return next;
}

export function buildChampionRunStats(
  ledger: RunLedger,
  team: readonly (Pick<TeamMember, 'championId'> & { currentHp?: number | null })[],
): ChampionRunStats[] {
  return team
    .map((member) => {
      const stats = ledger.champions[member.championId] ?? emptyChampionLedger();
      const itemsCollected = [
        ...new Set(
          ledger.items
            .filter(
              (event) => event.action === 'equipped' && event.championId === member.championId,
            )
            .map((event) => event.itemId),
        ),
      ];
      return {
        championId: member.championId,
        kills: stats.kills,
        assists: stats.assists,
        totalDamage: stats.damageDealt,
        damageToShields: stats.damageToShields,
        damageReceived: stats.damageReceived,
        healingDone: stats.healingDone,
        healingReceived: stats.healingReceived,
        overhealing: stats.overhealing,
        shieldingDone: stats.shieldingDone,
        shieldingAbsorbed: stats.shieldingAbsorbed,
        deaths: stats.deaths,
        itemsCollected,
        survived: (member.currentHp ?? 0) > 0,
      };
    })
    .sort((left, right) => left.championId.localeCompare(right.championId));
}

export function buildRunSummaryFromLedger(input: {
  ledger: RunLedger;
  team: readonly (Pick<TeamMember, 'championId'> & { currentHp?: number | null })[];
  won: boolean;
  wavesCompleted: number;
  biomesVisited: RunSummary['biomesVisited'];
  goldBalance: number;
  runLevel: number;
}): RunSummary {
  const championStats = buildChampionRunStats(input.ledger, input.team);
  return {
    won: input.won,
    wavesCompleted: input.wavesCompleted,
    biomesVisited: [...input.biomesVisited],
    championStats,
    totalKills: championStats.reduce((sum, stats) => sum + stats.kills, 0),
    totalDamage: championStats.reduce((sum, stats) => sum + stats.totalDamage, 0),
    goldEarned: input.ledger.gold.earned,
    goldSpent: input.ledger.gold.spent,
    goldBalance: Math.max(0, Math.round(input.goldBalance)),
    itemEvents: input.ledger.items.map((event) => ({ ...event })),
    runLevel: input.runLevel,
  };
}

export function migrateLegacyStatsToLedger(
  stats: readonly Partial<ChampionRunStats>[],
  championIds: readonly string[],
  currentGold: number,
): RunLedger {
  const ledger = createRunLedger(championIds);
  ledger.gold.earned = Math.max(0, Math.round(currentGold));
  for (const legacy of stats) {
    if (!legacy.championId) continue;
    ensureLedgerChampion(ledger, legacy.championId);
    const target = ledger.champions[legacy.championId];
    target.kills = Math.max(0, Math.trunc(legacy.kills ?? 0));
    target.assists = Math.max(0, Math.trunc(legacy.assists ?? 0));
    target.damageDealt = Math.max(0, Math.round(legacy.totalDamage ?? 0));
    target.damageToShields = Math.max(0, Math.round(legacy.damageToShields ?? 0));
    target.damageReceived = Math.max(0, Math.round(legacy.damageReceived ?? 0));
    target.healingDone = Math.max(0, Math.round(legacy.healingDone ?? 0));
    target.healingReceived = Math.max(0, Math.round(legacy.healingReceived ?? 0));
    target.overhealing = Math.max(0, Math.round(legacy.overhealing ?? 0));
    target.shieldingDone = Math.max(0, Math.round(legacy.shieldingDone ?? 0));
    target.shieldingAbsorbed = Math.max(0, Math.round(legacy.shieldingAbsorbed ?? 0));
    target.deaths = Math.max(0, Math.trunc(legacy.deaths ?? 0));
  }
  return ledger;
}

import { decodeCombatActionTrace } from '@/game/battle/actionTrace';
import { parseChampionRunAccessSnapshot } from '@/services/championEconomyRunContract';
import { BIOMES, type RunState } from '@/types/run';
import { isRecord } from '@/utils/persistence';

type Check = (value: unknown) => boolean;
const text =
  (maximum = 8192, minimum = 0): Check =>
  (value) =>
    typeof value === 'string' && value.length >= minimum && value.length <= maximum;
const id = text(160, 1);
const number: Check = (value) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const nonnegative: Check = (value) => number(value) && (value as number) >= 0;
const integer: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 0;
const positive: Check = (value) => integer(value) && (value as number) > 0;
const seed: Check = (value) => Number.isSafeInteger(value);
const boolean: Check = (value) => typeof value === 'boolean';
const oneOf =
  (values: readonly unknown[]): Check =>
  (value) =>
    values.includes(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const array =
  (check: Check, maximum = 2000): Check =>
  (value) =>
    Array.isArray(value) && value.length <= maximum && value.every(check);
const dictionary =
  (check: Check, maximum = 1000): Check =>
  (value) =>
    isRecord(value) &&
    Object.keys(value).length <= maximum &&
    Object.entries(value).every(([key, entry]) => id(key) && check(entry));
const shape =
  (fields: Record<string, Check>, required = Object.keys(fields)): Check =>
  (value) =>
    isRecord(value) &&
    required.every(
      (key) => Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined,
    ) &&
    Object.entries(fields).every(([key, check]) => value[key] === undefined || check(value[key]));
const date: Check = (value) => text(64, 1)(value) && Number.isFinite(Date.parse(value as string));
const biome = oneOf(BIOMES);
const mode = oneOf(['normal', 'daily']);
const difficulty = oneOf(['easy', 'normal', 'hard']);
const nodeType = oneOf([
  'combat',
  'elite',
  'boss',
  'shop',
  'rest',
  'event',
  'treasure',
  'recruit',
  'start',
  'exit',
]);
const ids = array(id);
const stats = dictionary(number, 32);
const teamMember = shape(
  {
    championId: id,
    currentHp: nonnegative,
    currentMp: nonnegative,
    level: positive,
    currentXp: nonnegative,
    statMultiplier: nonnegative,
    statBoosts: stats,
    spellRanks: shape({ Q: integer, W: integer, E: integer, R: integer }, []),
  },
  ['championId'],
);
const shopItem = shape(
  {
    itemId: id,
    name: text(),
    description: text(),
    price: nonnegative,
    iconUrl: text(),
    stats,
    passiveId: id,
  },
  ['itemId', 'name', 'description', 'price', 'iconUrl', 'stats'],
);
const inventoryItem = shape({
  instanceId: id,
  equippedToChampionId: nullable(id),
  item: shape(
    {
      id,
      name: text(),
      description: text(),
      iconUrl: text(),
      stats,
      goldValue: nonnegative,
      passiveId: id,
    },
    ['id', 'name', 'description', 'iconUrl', 'stats', 'goldValue'],
  ),
});
const inventory = array(inventoryItem, 200);
const eventOutcome = shape(
  {
    type: oneOf([
      'gold_reward',
      'gold_cost',
      'item_reward',
      'heal',
      'damage',
      'champion_recruit',
      'stat_boost',
      'nothing',
    ]),
    weight: nonnegative,
    description: text(),
    goldAmount: number,
    item: shopItem,
    healPercent: nonnegative,
    damagePercent: nonnegative,
    championId: id,
    statBoost: shape({ stat: id, amount: number }),
  },
  ['type', 'weight', 'description'],
);

const encounter: Check = (value) => {
  if (
    !shape({ id, name: text(), description: text(), minRunLevel: nonnegative, type: id })(value) ||
    !isRecord(value)
  )
    return false;
  const checks: Record<string, Check> = {
    combat: shape({
      enemies: array(
        shape({ championId: id, statMultiplier: nonnegative, level: positive }, [
          'championId',
          'statMultiplier',
        ]),
        32,
      ),
      goldReward: nonnegative,
      itemDropChance: nonnegative,
    }),
    shop: shape({
      items: array(shopItem, 100),
      recruitableChampions: array(shape({ championId: id, cost: nonnegative }), 100),
      priceMultiplier: nonnegative,
    }),
    recruit: shape({
      championId: id,
      cost: nonnegative,
      successChance: nonnegative,
      statMultiplier: nonnegative,
    }),
    event: shape({ outcomes: array(eventOutcome, 100) }),
    rest: shape({ healPercent: nonnegative, goldCost: nonnegative, fullHeal: boolean }),
    treasure: shape({ gold: nonnegative, item: shopItem }, ['gold']),
  };
  return (
    Object.prototype.hasOwnProperty.call(checks, String(value.type)) &&
    checks[String(value.type)]!(value)
  );
};
const mapNode = shape({
  id,
  type: nodeType,
  column: integer,
  row: integer,
  nextNodeIds: ids,
  prevNodeIds: ids,
  biome,
  completed: boolean,
  accessible: boolean,
  encounter: nullable(encounter),
  metadata: shape({ title: text(), description: text(), icon: text() }),
});
const map: Check = (value) => {
  if (
    !shape({
      biome,
      nodes: array(mapNode, 1000),
      startNodeId: id,
      exitNodeId: id,
      columns: positive,
      rows: positive,
    })(value) ||
    !isRecord(value)
  )
    return false;
  const nodes = value.nodes as Array<Record<string, unknown>>;
  const nodeIds = new Set(nodes.map((node) => node.id));
  return (
    nodeIds.size === nodes.length &&
    nodeIds.has(value.startNodeId) &&
    nodeIds.has(value.exitNodeId) &&
    nodes.every(
      (node) =>
        node.biome === value.biome &&
        (node.nextNodeIds as string[]).every((entry) => nodeIds.has(entry)) &&
        (node.prevNodeIds as string[]).every((entry) => nodeIds.has(entry)),
    )
  );
};
const ledgerCounters = {
  kills: nonnegative,
  assists: nonnegative,
  damageDealt: nonnegative,
  damageToShields: nonnegative,
  damageReceived: nonnegative,
  healingDone: nonnegative,
  healingReceived: nonnegative,
  overhealing: nonnegative,
  shieldingDone: nonnegative,
  shieldingAbsorbed: nonnegative,
  deaths: nonnegative,
};
const championLedger = shape(
  { ...ledgerCounters, wavesParticipated: integer, biomesParticipated: array(biome, 6) },
  Object.keys(ledgerCounters),
);
const itemEvent = shape({
  sequence: positive,
  action: oneOf(['found', 'bought', 'sold', 'equipped', 'unequipped', 'consumed']),
  source: oneOf(['combat', 'shop', 'event', 'treasure', 'rest', 'recruit', 'inventory', 'legacy']),
  itemId: id,
  instanceId: id,
  championId: nullable(id),
  goldAmount: nonnegative,
  nodeId: nullable(id),
  wave: integer,
});
const ledger: Check = (value) => {
  if (
    !shape({
      version: oneOf([1, 2]),
      champions: dictionary(championLedger, 200),
      gold: shape({ earned: nonnegative, spent: nonnegative }),
      items: array(itemEvent, 10000),
      nextItemEventSequence: positive,
    })(value) ||
    !isRecord(value)
  )
    return false;
  const items = value.items as Array<{ sequence: number }>;
  return (
    items.every((item, index) => item.sequence === index + 1) &&
    value.nextItemEventSequence === items.length + 1
  );
};
const championStats = shape(
  {
    championId: id,
    kills: nonnegative,
    assists: nonnegative,
    totalDamage: nonnegative,
    damageToShields: nonnegative,
    damageReceived: nonnegative,
    healingDone: nonnegative,
    healingReceived: nonnegative,
    overhealing: nonnegative,
    shieldingDone: nonnegative,
    shieldingAbsorbed: nonnegative,
    deaths: nonnegative,
    itemsCollected: ids,
    survived: boolean,
    wavesParticipated: integer,
    biomesParticipated: array(biome, 6),
  },
  ['championId', 'kills', 'totalDamage', 'deaths', 'itemsCollected', 'survived'],
);
const summary = shape({
  won: boolean,
  wavesCompleted: integer,
  biomesVisited: array(biome, 6),
  championStats: array(championStats, 200),
  totalKills: nonnegative,
  totalDamage: nonnegative,
  goldEarned: nonnegative,
  goldSpent: nonnegative,
  goldBalance: nonnegative,
  itemEvents: array(itemEvent, 10000),
  runLevel: positive,
});
const completion = shape({
  runId: id,
  mode,
  won: boolean,
  runLevel: positive,
  wavesCompleted: integer,
  biomesVisited: array(biome, 6),
  goldEarned: nonnegative,
  goldSpent: nonnegative,
  goldBalance: nonnegative,
  summary,
  teamMembers: array(
    shape({ championId: id, level: positive, currentHp: nonnegative, currentMp: nonnegative }),
    5,
  ),
  startedAt: nullable(date),
  seed: nullable(seed),
  runeIds: ids,
  augmentIds: ids,
  ledger,
  daily: nullable(
    shape({
      dateKey: text(10, 10),
      dailySeed: seed,
      abandoned: boolean,
      itemCount: integer,
      currentBiome: nullable(biome),
      currentWave: positive,
      inventory,
      score: nonnegative,
    }),
  ),
});

const command: Check = (value) => {
  if (
    !shape({
      commandId: id,
      sequence: positive,
      kind: id,
      payload: (entry) => isRecord(entry),
      dedupeKey: text(512, 1),
    })(value) ||
    !isRecord(value)
  )
    return false;
  const payload = value.payload as Record<string, unknown>;
  const payloads: Record<string, string[]> = {
    move_node: ['node_id'],
    resolve_combat: ['node_id'],
    shop_buy_item: ['node_id', 'item_id'],
    shop_recruit: ['node_id', 'champion_id'],
    rest: ['node_id'],
    recruit: ['node_id'],
    event: ['node_id'],
    treasure: ['node_id'],
    resolve_node: ['node_id'],
    equip_item: ['instance_id', 'champion_id'],
    unequip_item: ['instance_id'],
    sell_item: ['instance_id'],
    choose_augment: ['augment_id'],
    upgrade_spell: ['champion_id', 'slot'],
    abandon_run: [],
  };
  if (!Object.prototype.hasOwnProperty.call(payloads, String(value.kind))) return false;
  const keys = [...payloads[String(value.kind)]!];
  if (
    value.kind === 'resolve_combat' &&
    Object.prototype.hasOwnProperty.call(payload, 'actions_json')
  ) {
    keys.push('actions_json');
    if (
      typeof payload.actions_json !== 'string' ||
      (payload.actions_json !== 'auto' && decodeCombatActionTrace(payload.actions_json) === null)
    )
      return false;
  }
  return (
    Object.keys(payload).length === keys.length &&
    keys.every((key) => key === 'actions_json' || id(payload[key])) &&
    (value.kind !== 'upgrade_spell' || ['Q', 'W', 'E', 'R'].includes(String(payload.slot)))
  );
};
const authorityAttempt: Check = (value) => {
  const fields = {
    attemptId: id,
    runUuid: id,
    ownerUserId: id,
    seed,
    rulesetVersion: positive,
    gameplayRulesetVersion: (version: unknown) => positive(version) && (version as number) <= 32767,
    engineVersion: id,
    difficulty,
    mode,
    dailyDate: nullable(text(10, 10)),
    dailyRulesetVersion: nullable(positive),
    dailyScoreVersion: nullable(positive),
    initialTeam: array(id, 5),
    runeIds: array(id, 100),
    enhancementSnapshot: dictionary(dictionary(integer, 500), 200),
    masterySnapshot: dictionary(integer, 200),
    championAccessSnapshot: nullable(
      (snapshot) => parseChampionRunAccessSnapshot(snapshot) !== null,
    ),
    economyVersion: nullable(oneOf([1])),
    startedAt: date,
    expiresAt: date,
    status: oneOf([
      'started',
      'active',
      'finished',
      'verifying',
      'verified',
      'rejected',
      'expired',
    ]),
    commands: array(command, 10000),
    nextSequence: positive,
    lastAcknowledgedSequence: integer,
    journalHash: text(512, 1),
    finishCommandId: nullable(id),
  };
  if (
    !shape(
      fields,
      Object.keys(fields).filter(
        (key) =>
          ![
            'masterySnapshot',
            'dailyDate',
            'dailyRulesetVersion',
            'dailyScoreVersion',
            'gameplayRulesetVersion',
            'championAccessSnapshot',
            'economyVersion',
          ].includes(key),
      ),
    )(value) ||
    !isRecord(value)
  )
    return false;
  const commands = value.commands as Array<{
    sequence: number;
    commandId: string;
    dedupeKey: string;
  }>;
  const team = value.initialTeam as string[];
  const accessSnapshot = parseChampionRunAccessSnapshot(value.championAccessSnapshot);
  return (
    (value.economyVersion !== 1 || accessSnapshot?.economyVersion === 1) &&
    (!accessSnapshot || accessSnapshot.economyVersion === (value.economyVersion ?? null)) &&
    team.length > 0 &&
    new Set(team).size === team.length &&
    commands.every((entry, index) => entry.sequence === index + 1) &&
    new Set(commands.map((entry) => entry.commandId)).size === commands.length &&
    new Set(commands.map((entry) => entry.dedupeKey)).size === commands.length &&
    value.nextSequence === commands.length + 1 &&
    (value.lastAcknowledgedSequence as number) <= commands.length
  );
};

/** Shape validation before any migration dereferences a nested collection. */
export function isPersistedRunState(value: unknown): value is Partial<RunState> {
  const fields: Record<string, Check> = {
    isActive: boolean,
    mode,
    runId: text(160),
    seed: nullable(seed),
    startedAt: nullable(date),
    authorityAttempt: nullable(authorityAttempt),
    pendingAuthorityStart: nullable(
      shape({
        commandId: id,
        ownerUserId: id,
        mode,
        team: array(id, 5),
        runeIds: array(id, 100),
        difficulty,
      }),
    ),
    isEnding: boolean,
    saveStatus: oneOf(['idle', 'saving', 'saved', 'failed', 'retrying']),
    saveError: nullable(text()),
    saveFailureKind: nullable(oneOf(['retryable', 'terminal'])),
    saveDiagnostic: nullable(shape({ attemptId: id, engineVersion: id, rejectionCode: id })),
    completedRunSnapshot: nullable(completion),
    serverProgression: nullable(
      shape(
        {
          runId: id,
          replayed: boolean,
          candiesEarned: nonnegative,
          candiesByChampion: dictionary(nonnegative, 200),
          candiesPerChampion: nonnegative,
          progressionVersion: positive,
          progressionSource: oneOf(['verified']),
          shardsEarned: integer,
          shardsBalance: integer,
          shardEconomyVersion: nullable(oneOf([1])),
          shardRotationFirstWinChampionIds: array(id, 5),
        },
        [
          'runId',
          'replayed',
          'candiesEarned',
          'candiesPerChampion',
          'progressionVersion',
          'progressionSource',
        ],
      ),
    ),
    rewardsApplied: boolean,
    ledger,
    nextItemInstanceId: positive,
    team: array(teamMember, 32),
    runLevel: positive,
    biomesVisited: array(biome, 6),
    currentBiome: nullable(biome),
    inventory,
    runeIds: ids,
    runeStacks: dictionary(dictionary(nonnegative, 200), 200),
    augmentIds: ids,
    pendingAugmentIds: ids,
    lastCombatRewards: nullable(
      shape(
        {
          xp: nonnegative,
          gold: nonnegative,
          itemId: nullable(id),
          itemName: nullable(text()),
          itemBlockedByCapacity: boolean,
          levelsGained: integer,
        },
        ['xp', 'gold', 'itemName', 'itemBlockedByCapacity', 'levelsGained'],
      ),
    ),
    pendingSpellUpgradeChampionIds: ids,
    gold: nonnegative,
    currentWave: positive,
    totalWavesCompleted: integer,
    biomeMaps: array(map, 6),
    currentBiomeIndex: integer,
    currentNodeId: nullable(id),
    frontierNodeIds: ids,
    chosenPathNodeIds: ids,
    completedNodeIds: ids,
    claimedEncounterNodeIds: ids,
    shopNodeStates: dictionary(
      shape({ visited: boolean, purchasedItemIds: ids, recruitedChampionIds: ids }),
      2000,
    ),
    pendingEncounter: nullable(shape({ nodeId: id, nodeType })),
    currentEncounter: nullable(
      (entry) => encounter(entry) && isRecord(entry) && entry.type === 'combat',
    ),
    combatCheckpointNodeId: nullable(id),
    combatRecoveryRequired: boolean,
    completedCombatStats: array(championStats, 200),
  };
  if (!shape(fields, [])(value) || !isRecord(value)) return false;
  if (
    Array.isArray(value.biomeMaps) &&
    value.biomeMaps.length > 0 &&
    ((value.currentBiomeIndex as number) ?? 0) >= value.biomeMaps.length
  )
    return false;
  const attempt = value.authorityAttempt;
  const snapshot = value.completedRunSnapshot;
  if (isRecord(attempt)) {
    if (value.isActive && value.runId !== attempt.runUuid) return false;
    if (
      isRecord(snapshot) &&
      (snapshot.runId !== attempt.runUuid || snapshot.mode !== attempt.mode)
    )
      return false;
    if (value.isActive && value.mode !== undefined && value.mode !== attempt.mode) return false;
  }
  return true;
}

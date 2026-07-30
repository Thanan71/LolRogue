import { beforeEach, describe, expect, it } from 'vitest';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import {
  getRunDomainInvariantViolations,
  normalizeRunDomainState,
} from '@/game/run/runDomainInvariants';
import { itemDefinitionToRunItem } from '@/game/run/encounterResolver';
import { createRunLedger } from '@/game/run/runLedger';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { migratePersistedRunState, useRunStore } from '@/stores/runStore';
import type { InventoryEntry, TeamMember } from '@/types/run';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const CHAMPION_CANDIDATES = ['Garen', 'Lux', 'Warwick', 'Ashe', 'Darius', 'Unknown'] as const;
const ITEM_CANDIDATES = [
  'long_sword',
  'boots',
  'health_potion',
  'infinity_edge',
  'unknown_item',
] as const;

describe('run domain invariants', () => {
  beforeEach(() => {
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'property-run',
      team: [{ championId: 'Garen', level: 18 }],
      ledger: createRunLedger(['Garen']),
    });
  });

  it('keeps every public team, inventory and spell command inside the domain', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const random = seeded(seed);
      useRunStore.setState({
        ...RUN_INITIAL_STATE,
        isActive: true,
        runId: `property-${seed}`,
        team: [{ championId: 'Garen', level: 18 }],
        ledger: createRunLedger(['Garen']),
      });

      for (let step = 0; step < 80; step++) {
        const state = useRunStore.getState();
        const championId = CHAMPION_CANDIDATES[Math.floor(random() * CHAMPION_CANDIDATES.length)]!;
        const itemId = ITEM_CANDIDATES[Math.floor(random() * ITEM_CANDIDATES.length)]!;
        switch (Math.floor(random() * 7)) {
          case 0:
            state.addChampion(
              championId,
              [-1, 0.1, 1, 10, 99, Number.NaN][Math.floor(random() * 6)],
            );
            break;
          case 1: {
            const requested = Array.from(
              { length: Math.floor(random() * 8) },
              () => CHAMPION_CANDIDATES[Math.floor(random() * CHAMPION_CANDIDATES.length)]!,
            );
            state.setTeam(requested);
            break;
          }
          case 2: {
            const definition = ITEM_DATABASE[itemId];
            state.addItem(
              definition
                ? itemDefinitionToRunItem(definition)
                : {
                    id: itemId,
                    name: itemId,
                    description: '',
                    iconUrl: '',
                    stats: {},
                    goldValue: 1,
                  },
            );
            break;
          }
          case 3: {
            const instance =
              state.inventory[Math.floor(random() * Math.max(1, state.inventory.length))];
            state.equipItem(instance?.instanceId ?? 'missing', championId);
            break;
          }
          case 4:
            state.removeChampion(championId);
            break;
          case 5:
            state.queueSpellUpgrades([championId, championId]);
            break;
          default:
            state.upgradeSpell(
              championId,
              (['Q', 'W', 'E', 'R'] as const)[Math.floor(random() * 4)]!,
            );
        }

        expect(
          getRunDomainInvariantViolations(useRunStore.getState()),
          `seed ${seed}, step ${step}`,
        ).toEqual([]);
      }
    }
  });

  it('repairs randomized corrupt persisted states during migration', () => {
    for (let seed = 1; seed <= 160; seed++) {
      const random = seeded(seed);
      const team = Array.from({ length: Math.floor(random() * 10) }, (_, index) => ({
        championId: CHAMPION_CANDIDATES[Math.floor(random() * CHAMPION_CANDIDATES.length)]!,
        level: Math.floor(random() * 40) - 10,
        spellRanks: { Q: index + 1, W: -1, E: 99, R: 99 },
      })) as TeamMember[];
      const inventory = Array.from({ length: Math.floor(random() * 35) }, (_, index) => {
        const itemId = ITEM_CANDIDATES[Math.floor(random() * ITEM_CANDIDATES.length)]!;
        const definition = ITEM_DATABASE[itemId];
        return {
          instanceId: index % 3 === 0 ? 'duplicate' : `item_corrupt_${index}`,
          item: definition
            ? itemDefinitionToRunItem(definition)
            : {
                id: itemId,
                name: itemId,
                description: '',
                iconUrl: '',
                stats: {},
                goldValue: 1,
              },
          equippedToChampionId:
            CHAMPION_CANDIDATES[Math.floor(random() * CHAMPION_CANDIDATES.length)]!,
        };
      }) as InventoryEntry[];
      const pendingSpellUpgradeChampionIds = Array.from(
        { length: Math.floor(random() * 20) },
        () => CHAMPION_CANDIDATES[Math.floor(random() * CHAMPION_CANDIDATES.length)]!,
      );

      const migrated = migratePersistedRunState(
        {
          ...RUN_INITIAL_STATE,
          isActive: true,
          runId: `corrupt-${seed}`,
          team,
          inventory,
          pendingSpellUpgradeChampionIds,
        },
        5,
      );
      expect(getRunDomainInvariantViolations(migrated), `corrupt persisted seed ${seed}`).toEqual(
        [],
      );
    }
  });

  it('queues every legal multi-level choice and never consumes a locked choice', () => {
    useRunStore.setState({
      team: [{ championId: 'Garen', level: 5 }],
      pendingSpellUpgradeChampionIds: [],
    });
    expect(useRunStore.getState().queueSpellUpgrades(['Garen', 'Garen', 'Garen'])).toBe(3);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toHaveLength(3);

    expect(useRunStore.getState().upgradeSpell('Garen', 'R')).toBe(false);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toHaveLength(3);
    expect(useRunStore.getState().upgradeSpell('Garen', 'Q')).toBe(true);
    expect(useRunStore.getState().upgradeSpell('Garen', 'Q')).toBe(true);
    expect(useRunStore.getState().upgradeSpell('Garen', 'Q')).toBe(false);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toEqual(['Garen']);

    useRunStore.setState({
      team: [{ ...useRunStore.getState().team[0]!, level: 11 }],
    });
    expect(useRunStore.getState().upgradeSpell('Garen', 'R')).toBe(true);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toEqual([]);
  });

  it('normalizes a direct corrupt domain snapshot idempotently', () => {
    const once = normalizeRunDomainState({
      team: [
        { championId: 'garen', level: 3, spellRanks: { Q: 99 } },
        { championId: 'Garen' },
        { championId: 'missing' },
      ],
      inventory: [],
      pendingSpellUpgradeChampionIds: ['Garen', 'missing', 'Garen', 'Garen', 'Garen'],
    });
    const twice = normalizeRunDomainState(once);
    expect(twice).toEqual(once);
    expect(getRunDomainInvariantViolations(twice)).toEqual([]);
  });
});

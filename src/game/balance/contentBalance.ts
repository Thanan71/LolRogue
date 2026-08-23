import { implementedChampions } from '@/data/champion';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import { generateRunMap } from '@/game/map';
import { BIOME_MAP_CONFIGS, NodeType } from '@/game/map/types';
import { resolveCombatEncounter } from '@/game/run/encounterResolver';
import { BIOME_INFO, BIOMES, type Biome } from '@/types/run';
import type { AuthorityDifficulty } from '@/types/runAttempt';

export const BALANCE_MODEL_VERSION = 1;

export interface ChampionDesignProfile {
  role: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  synergies: readonly string[];
}

export const CHAMPION_DESIGN: Record<string, ChampionDesignProfile> = {
  Garen: {
    role: 'frontline autonome / exécution',
    strengths: ['durabilité', 'dégâts de zone', 'finition des cibles faibles'],
    weaknesses: ['portée courte', 'peu de contrôle', 'fenêtres de dégâts prévisibles'],
    synergies: ['Lux', 'Soraka', 'Ashe'],
  },
  Annie: {
    role: 'mage burst / contrôle',
    strengths: ['burst magique', 'étourdissement', 'dégâts de zone'],
    weaknesses: ['fragile', 'dépendante du mana', 'faible dégâts soutenus'],
    synergies: ['Leona', 'Malphite', 'Warwick'],
  },
  Ashe: {
    role: 'carry distance / contrôle',
    strengths: ['ralentissements', 'portée', 'initiation à distance'],
    weaknesses: ['fragile', 'mobilité faible', 'besoin de protection'],
    synergies: ['Leona', 'Soraka', 'Garen'],
  },
  Darius: {
    role: 'bruiser cumulatif / exécution',
    strengths: ['duels longs', 'sustain', 'exécutions en chaîne'],
    weaknesses: ['portée courte', 'mise en place des stacks', 'sensible au contrôle'],
    synergies: ['Leona', 'Lux', 'Soraka'],
  },
  Lux: {
    role: 'mage utilitaire / burst',
    strengths: ['portée', 'boucliers', 'contrôle et burst'],
    weaknesses: ['fragile', 'cooldowns', 'moins fiable au contact'],
    synergies: ['Garen', 'Jinx', 'Malphite'],
  },
  Soraka: {
    role: 'support de sustain',
    strengths: ['soins', 'stabilisation des combats longs', 'silence'],
    weaknesses: ['faible pression seule', 'fragile', 'coût en PV de ses soins'],
    synergies: ['Darius', 'Warwick', 'Jinx'],
  },
  Jinx: {
    role: 'hypercarry à resets',
    strengths: ['dégâts soutenus', 'zone', 'accélération après élimination'],
    weaknesses: ['fragile', 'démarrage lent', 'besoin de frontline'],
    synergies: ['Leona', 'Lux', 'Soraka'],
  },
  Leona: {
    role: 'tank engage / contrôle',
    strengths: ['initiation', 'contrôles successifs', 'résistances'],
    weaknesses: ['faibles dégâts seule', 'portée d’engage', 'dépendante des alliés'],
    synergies: ['Ashe', 'Jinx', 'Annie'],
  },
  Malphite: {
    role: 'tank anti-physique / engage',
    strengths: ['armure', 'engage de zone', 'perturbation de vitesse d’attaque'],
    weaknesses: ['mana', 'dégâts soutenus limités', 'moins fort contre magie'],
    synergies: ['Annie', 'Lux', 'Jinx'],
  },
  Warwick: {
    role: 'bruiser sustain / poursuite',
    strengths: ['soins personnels', 'finition', 'contrôle monocible'],
    weaknesses: ['portée courte', 'dépendant des cibles blessées', 'sensible au burst'],
    synergies: ['Lux', 'Soraka', 'Ashe'],
  },
};

export interface BiomeDesignProfile {
  mechanic: string;
  playerChoice: string;
  visualIdentity: string;
  generatorContract: string;
}

export const BIOME_DESIGN: Record<Biome, BiomeDesignProfile> = {
  top_lane: {
    mechanic: 'Duels d’attrition',
    playerChoice: 'route stable contre détour élite pour accélérer la puissance',
    visualIdentity: 'pierre, remparts et tons ardoise',
    generatorContract: 'premier biome, difficulté minimale et embranchements modérés',
  },
  jungle: {
    mechanic: 'Exploration ramifiée',
    playerChoice: 'davantage de routes, événements, trésors et recrutements',
    visualIdentity: 'canopée dense, vert profond et embuscades',
    generatorContract: 'carte la plus longue et branchChance maximal',
  },
  mid_lane: {
    mechanic: 'Pression arcanique',
    playerChoice: 'carte courte avec davantage d’élites et accès régulier au shop',
    visualIdentity: 'runes, éclairs et contraste violet-or',
    generatorContract: 'peu de colonnes, eliteChance élevé et faible ramification',
  },
  bot_lane: {
    mechanic: 'Formations duo',
    playerChoice: 'composer contre carry et protection, avec routes économiques',
    visualIdentity: 'marché côtier, bannières et tons azur',
    generatorContract: 'shops, événements et formations marksman/support',
  },
  river: {
    mechanic: 'Risque contre récupération',
    playerChoice: 'forte pression élite compensée par repos et trésors fréquents',
    visualIdentity: 'eau, brume et reflets cyan',
    generatorContract: 'eliteChance maximal hors base, rest/treasure élevés',
  },
  base: {
    mechanic: 'Siège final',
    playerChoice: 'préparation finale courte, sans événement aléatoire, avant le boss',
    visualIdentity: 'forteresse, rouge sombre et or',
    generatorContract: 'carte la plus courte, difficulté et eliteChance maximales',
  },
};

export interface CatalogDifficultyIndicators {
  difficulty: AuthorityDifficulty;
  combatNodeCount: number;
  meanEncounterPower: number;
  meanNodeGoldReward: number;
  meanNodeDropChance: number;
}

export interface ContentCatalogAnalysis {
  modelVersion: number;
  gameplayRulesetVersion: number;
  contentHash: string;
  dailyScoreVersion: number;
  mapSeedCount: number;
  difficultyIndicators: CatalogDifficultyIndicators[];
  biomeNodeTypeCounts: Record<Biome, Record<string, number>>;
  economy: {
    minShopPrice: number;
    maxShopPrice: number;
    augmentCount: number;
    stackableAugmentCount: number;
  };
}

const DIFFICULTIES: AuthorityDifficulty[] = ['easy', 'normal', 'hard'];

export function analyzeContentCatalog(mapSeedCount = 250): ContentCatalogAnalysis {
  if (!Number.isInteger(mapSeedCount) || mapSeedCount < 1) {
    throw new Error('mapSeedCount must be positive.');
  }

  const totals = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      { combatNodes: 0, enemyPower: 0, gold: 0, dropChance: 0 },
    ]),
  ) as Record<
    AuthorityDifficulty,
    { combatNodes: number; enemyPower: number; gold: number; dropChance: number }
  >;
  const biomeNodeTypeCounts = Object.fromEntries(
    BIOMES.map((biome) => [biome, {} as Record<string, number>]),
  ) as Record<Biome, Record<string, number>>;

  for (let seed = 1; seed <= mapSeedCount; seed++) {
    const maps = generateRunMap(seed);
    for (const [biomeIndex, map] of maps.entries()) {
      for (const node of map.nodes) {
        biomeNodeTypeCounts[map.biome][node.type] =
          (biomeNodeTypeCounts[map.biome][node.type] ?? 0) + 1;
        if (
          !node.encounter ||
          node.encounter.type !== 'combat' ||
          ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(node.type)
        )
          continue;

        for (const difficulty of DIFFICULTIES) {
          const result = resolveCombatEncounter({
            seed,
            nodeId: node.id,
            biome: map.biome,
            nodeType: node.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
            wave: biomeIndex * 10 + node.column + 1,
            runLevel: biomeIndex + 1,
            difficulty,
            encounter: node.encounter,
            inventory: [],
          });
          const total = totals[difficulty];
          total.combatNodes++;
          total.enemyPower += result.enemies.reduce(
            (sum, enemy) => sum + enemy.statMultiplier * enemy.level,
            0,
          );
          total.gold += result.reward.gold;
          total.dropChance += result.reward.itemDropChance;
        }
      }
    }
  }

  const prices = Object.values(ITEM_DATABASE).map((item) => item.goldValue);
  const augments = Object.values(AUGMENT_DATABASE);
  return {
    modelVersion: BALANCE_MODEL_VERSION,
    gameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
    contentHash: CURRENT_AUTHORITY_VERSION.contentHash,
    dailyScoreVersion: CURRENT_AUTHORITY_VERSION.dailyScore,
    mapSeedCount,
    difficultyIndicators: DIFFICULTIES.map((difficulty) => {
      const total = totals[difficulty];
      return {
        difficulty,
        combatNodeCount: total.combatNodes,
        meanEncounterPower: total.enemyPower / total.combatNodes,
        meanNodeGoldReward: total.gold / total.combatNodes,
        meanNodeDropChance: total.dropChance / total.combatNodes,
      };
    }),
    biomeNodeTypeCounts,
    economy: {
      minShopPrice: Math.min(...prices),
      maxShopPrice: Math.max(...prices),
      augmentCount: augments.length,
      stackableAugmentCount: augments.filter((augment) => augment.stackable).length,
    },
  };
}

export function validateBalanceCatalog(): string[] {
  const errors: string[] = [];
  const championIds = implementedChampions.map((champion) => champion.id).sort();
  const profileIds = Object.keys(CHAMPION_DESIGN).sort();
  if (JSON.stringify(championIds) !== JSON.stringify(profileIds)) {
    errors.push('Champion design profiles do not match the implemented roster.');
  }
  for (const biome of BIOMES) {
    const config = BIOME_MAP_CONFIGS[biome];
    const profile = BIOME_DESIGN[biome];
    if (!profile || !BIOME_INFO[biome] || config.minColumns > config.maxColumns) {
      errors.push(`Biome ${biome} has an incomplete design contract.`);
    }
  }
  for (const augment of Object.values(AUGMENT_DATABASE)) {
    if (augment.maxStacks < 1 || (!augment.stackable && augment.maxStacks !== 1)) {
      errors.push(`Augment ${augment.id} has an invalid stacking contract.`);
    }
  }
  return errors;
}

import type { Locale } from './fr';

export type AdminExportContentCatalog = Readonly<{
  fileNamePrefix: string;
  unknown: string;
  yes: string;
  no: string;
  headers: readonly string[];
  biomes: Readonly<{
    top_lane: string;
    jungle: string;
    mid_lane: string;
    bot_lane: string;
    river: string;
    base: string;
  }>;
  championDetails: Readonly<{
    nameSeparator: string;
    labelSeparator: string;
    level: string;
    survived: string;
    kills: string;
    damageDealt: string;
    damageReceived: string;
    healingDone: string;
    finalHealth: string;
  }>;
}>;

export const adminExportContent = {
  'fr-FR': {
    fileNamePrefix: 'export_parties',
    unknown: 'Inconnu',
    yes: 'Oui',
    no: 'Non',
    headers: [
      'ID de partie',
      'Graine',
      'Joueur',
      'Nom affiché',
      'Victoire',
      'Niveau de partie',
      'Vagues terminées',
      'Biomes visités',
      'Nœuds terminés',
      'Combats gagnés',
      'Combats perdus',
      'Élites éliminées',
      'Boss éliminés',
      'Or gagné',
      'Or dépensé',
      'Éliminations totales',
      'Dégâts infligés',
      'Dégâts reçus',
      'Soins prodigués',
      'Soins reçus',
      'Bonbons gagnés',
      'Durée (secondes)',
      'Commencée le',
      'Terminée le',
      'Champions recrutés',
      'Objets achetés',
      'Équipe (champions)',
      'Détails des champions',
    ],
    biomes: {
      top_lane: 'Voie du haut',
      jungle: 'Jungle',
      mid_lane: 'Voie du milieu',
      bot_lane: 'Voie du bas',
      river: 'Rivière',
      base: 'Base ennemie',
    },
    championDetails: {
      nameSeparator: ' : ',
      labelSeparator: ' : ',
      level: 'niveau',
      survived: 'survie',
      kills: 'éliminations',
      damageDealt: 'dégâts infligés',
      damageReceived: 'dégâts reçus',
      healingDone: 'soins prodigués',
      finalHealth: 'PV finaux',
    },
  },
  'en-US': {
    fileNamePrefix: 'runs_export',
    unknown: 'Unknown',
    yes: 'Yes',
    no: 'No',
    headers: [
      'Run ID',
      'Seed',
      'Player',
      'Display name',
      'Victory',
      'Run level',
      'Waves completed',
      'Biomes visited',
      'Nodes completed',
      'Fights won',
      'Fights lost',
      'Elite kills',
      'Boss kills',
      'Gold earned',
      'Gold spent',
      'Total kills',
      'Damage dealt',
      'Damage taken',
      'Healing done',
      'Healing received',
      'Candies earned',
      'Duration (seconds)',
      'Started at',
      'Completed at',
      'Champions recruited',
      'Items purchased',
      'Team (champions)',
      'Champion details',
    ],
    biomes: {
      top_lane: 'Top lane',
      jungle: 'Jungle',
      mid_lane: 'Middle lane',
      bot_lane: 'Bottom lane',
      river: 'River',
      base: 'Enemy base',
    },
    championDetails: {
      nameSeparator: ': ',
      labelSeparator: ': ',
      level: 'level',
      survived: 'survived',
      kills: 'kills',
      damageDealt: 'damage dealt',
      damageReceived: 'damage taken',
      healingDone: 'healing done',
      finalHealth: 'final HP',
    },
  },
} as const satisfies Record<Locale, AdminExportContentCatalog>;

export function getAdminExportContent(selectedLocale: Locale): AdminExportContentCatalog {
  return adminExportContent[selectedLocale];
}

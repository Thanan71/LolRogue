import type { SpellSlot } from '@/game/ChampionInstance';
import type { RunLifecycleErrorCode } from '@/types/run';
import { type Locale, locale } from './fr';

type PreparationStat = 'hp' | 'attack' | 'defense' | 'abilityPower' | 'speed' | 'critical';
type SpellAvailability = 'available' | 'maximum' | 'locked';

export type RunPreparationContentCatalog = Readonly<{
  starter: Readonly<{
    back: string;
    dailyAuthoritativeLoadFailed: string;
    dailyOfferChanged: string;
    dailyUsed: string;
    dailyUnavailable: string;
    startFailures: Readonly<Record<RunLifecycleErrorCode, string>>;
    dailyTitle: string;
    normalTitle: string;
    resumableSubtitle: string;
    dailySubtitle: string;
    normalSubtitle: (starterCount: number, isGuest: boolean) => string;
    journeyLabel: string;
    journeyTeam: string;
    journeyRunes: string;
    journeyStart: string;
    rerollRoster: (remaining: number) => string;
    chooseRunes: string;
    runesHelp: string;
    selectedRunes: (selected: number, maximum: number) => string;
    effectBeforeSelection: string;
    selectionLimit: (starterCount: number) => string;
    selectedTeam: (names: readonly string[], selected: number, required: number) => string;
    emptySelection: string;
    loadingDaily: string;
    verifying: string;
    resumeVerifiedRun: string;
    confirmChoice: string;
    statLabels: Readonly<Record<PreparationStat, string>>;
    chooseChampion: (name: string) => string;
  }>;
  spellUpgrade: Readonly<{
    utilityEffect: string;
    pointAvailable: string;
    levelInstruction: (level: number) => string;
    abilitiesFor: (champion: string) => string;
    fallbackSpell: (slot: SpellSlot) => string;
    rank: string;
    mana: string;
    cooldown: string;
    turns: (value: string) => string;
    availability: Readonly<Record<SpellAvailability, string>>;
    ability: (slot: SpellSlot) => string;
    detailAvailability: Readonly<Record<SpellAvailability, string>>;
    estimatedEffects: string;
    currentRank: (rank: number) => string;
    nextRank: (rank: number) => string;
    upgradeConsequence: string;
    maximumRankReason: string;
    levelRequiredReason: string;
    upgradeSucceeded: (slot: SpellSlot, champion: string, rank: number) => string;
    upgradeFailed: (slot: SpellSlot, champion: string) => string;
    upgrade: (slot: SpellSlot, currentRank: number, nextRank: number) => string;
    maximumRank: (slot: SpellSlot) => string;
    levelRequired: (slot: SpellSlot) => string;
    estimatedDamageNote: string;
  }>;
}>;

function number(localeCode: Locale, value: number): string {
  return new Intl.NumberFormat(localeCode).format(value);
}

const frFR: RunPreparationContentCatalog = {
  starter: {
    back: 'Retour',
    dailyAuthoritativeLoadFailed: 'Impossible de charger le défi quotidien officiel.',
    dailyOfferChanged:
      'L’offre du défi quotidien a changé. Choisis un champion dans la nouvelle sélection.',
    dailyUsed: 'Le défi quotidien d’aujourd’hui a déjà été terminé.',
    dailyUnavailable: 'Impossible de vérifier la disponibilité du défi quotidien.',
    startFailures: {
      active_run: 'Termine ou abandonne la partie active avant d’en commencer une autre.',
      active_run_another_tab:
        'Une partie est active dans un autre onglet. Reprends-la au lieu d’en commencer une autre.',
      start_in_progress: 'Un départ de partie est déjà en cours de vérification.',
      auth_not_ready: 'Ton profil authentifié n’est pas encore prêt. Réessaie dans un instant.',
      invalid_team_size: 'La taille de l’équipe de départ est invalide.',
      duplicate_champion: 'Un champion ne peut apparaître qu’une fois dans l’équipe.',
      unknown_champion: 'L’équipe contient un champion inconnu.',
      unsupported_champion: 'L’équipe contient un champion non pris en charge.',
      invalid_starter_count: 'Le nombre de champions de départ est invalide pour ce mode.',
      secure_command_unavailable:
        'Ce navigateur ne peut pas créer la commande de départ sécurisée.',
      start_failed: 'La partie vérifiée n’a pas pu démarrer.',
      daily_starter_not_offered:
        'L’offre du défi quotidien a changé. Choisis le nouveau champion proposé.',
      account_changed: 'Le compte authentifié a changé pendant le démarrage.',
      stale_run: 'La partie demandée n’est plus la partie active.',
      finalization_in_progress: 'La finalisation d’une autre partie est déjà en cours.',
      finalization_failed: 'La partie précédente n’a pas pu être finalisée.',
    },
    dailyTitle: 'Compose ton équipe du jour',
    normalTitle: 'Compose ton équipe',
    resumableSubtitle:
      'Une tentative vérifiée interrompue est prête à reprendre avec ses choix d’origine.',
    dailySubtitle: 'Tous les joueurs affrontent la même graine quotidienne · 1 champion de départ',
    normalSubtitle: (starterCount, isGuest) =>
      `Partie normale : ta difficulté et tes choix · sélectionne exactement ${number('fr-FR', starterCount)} champion${starterCount > 1 ? 's' : ''}${isGuest ? ' · sauvegarde sur cet appareil uniquement' : ''}`,
    journeyLabel: 'Étapes de préparation',
    journeyTeam: 'Équipe',
    journeyRunes: 'Runes',
    journeyStart: 'Départ',
    rerollRoster: (remaining) => `Relancer la sélection (${number('fr-FR', remaining)})`,
    chooseRunes: 'Choisis tes runes',
    runesHelp: 'Jusqu’à 3 runes optionnelles pour personnaliser ta partie.',
    selectedRunes: (selected, maximum) =>
      `${number('fr-FR', selected)}/${number('fr-FR', maximum)} sélectionnée${selected === 1 ? '' : 's'}`,
    effectBeforeSelection: 'Effet avant sélection',
    selectionLimit: (starterCount) =>
      `Cette partie exige exactement ${number('fr-FR', starterCount)} champion${starterCount > 1 ? 's' : ''} de départ.`,
    selectedTeam: (names, selected, required) =>
      `${names.join(', ')} · ${number('fr-FR', selected)}/${number('fr-FR', required)} emplacement${selected > 1 ? 's' : ''} sélectionné${selected > 1 ? 's' : ''}`,
    emptySelection: 'Sélectionne un champion pour continuer',
    loadingDaily: 'Chargement du défi…',
    verifying: 'Vérification…',
    resumeVerifiedRun: 'Reprendre la partie vérifiée',
    confirmChoice: 'Confirmer le choix',
    statLabels: {
      hp: 'PV',
      attack: 'ATQ',
      defense: 'DÉF',
      abilityPower: 'PUI',
      speed: 'VIT',
      critical: 'CRIT',
    },
    chooseChampion: (name) => `Choisir ${name}`,
  },
  spellUpgrade: {
    utilityEffect: 'Effet utilitaire',
    pointAvailable: 'Point de compétence disponible',
    levelInstruction: (level) => `Niveau ${number('fr-FR', level)} · Choisis un sort à améliorer`,
    abilitiesFor: (champion) => `Compétences de ${champion}`,
    fallbackSpell: (slot) => `Sort ${slot}`,
    rank: 'Rang',
    mana: 'PM',
    cooldown: 'Recharge',
    turns: (value) => `${value} tour${value === '1' ? '' : 's'}`,
    availability: {
      available: 'Disponible',
      maximum: 'Maximum',
      locked: 'Verrouillé',
    },
    ability: (slot) => `Compétence ${slot}`,
    detailAvailability: {
      available: 'Améliorable',
      maximum: 'Rang maximum',
      locked: 'Verrouillé',
    },
    estimatedEffects: 'Effets estimés',
    currentRank: (rank) => `Rang actuel · ${number('fr-FR', rank)}`,
    nextRank: (rank) => `Prochain rang · ${number('fr-FR', rank)}`,
    upgradeConsequence: 'Augmente les valeurs du sort au prochain combat.',
    maximumRankReason: 'rang maximum',
    levelRequiredReason: 'Niveau de champion insuffisant pour le rang suivant',
    upgradeSucceeded: (slot, champion, rank) =>
      `${slot} de ${champion} amélioré au rang ${number('fr-FR', rank)}.`,
    upgradeFailed: (slot, champion) => `Impossible d’améliorer ${slot} de ${champion}. Réessayez.`,
    upgrade: (slot, currentRank, nextRank) =>
      `Améliorer ${slot} · rang ${number('fr-FR', currentRank)} → ${number('fr-FR', nextRank)}`,
    maximumRank: (slot) => `${slot} · rang maximum`,
    levelRequired: (slot) => `${slot} · niveau requis`,
    estimatedDamageNote:
      'Dégâts estimés avec les statistiques actuelles, avant les défenses de la cible.',
  },
};

const enUS: RunPreparationContentCatalog = {
  starter: {
    back: 'Back',
    dailyAuthoritativeLoadFailed: 'Unable to load the official daily challenge.',
    dailyOfferChanged: 'The daily challenge offer changed. Choose from the new champion roster.',
    dailyUsed: "Today's daily challenge has already been completed.",
    dailyUnavailable: 'Unable to check daily challenge availability.',
    startFailures: {
      active_run: 'Finish or abandon the active run before starting another.',
      active_run_another_tab:
        'A run is active in another tab. Resume it instead of starting another.',
      start_in_progress: 'A run start is already being verified.',
      auth_not_ready: 'Your authenticated profile is not ready yet. Try again in a moment.',
      invalid_team_size: 'The starting team size is invalid.',
      duplicate_champion: 'A champion can appear only once on the team.',
      unknown_champion: 'The team contains an unknown champion.',
      unsupported_champion: 'The team contains an unsupported champion.',
      invalid_starter_count: 'The number of starting champions is invalid for this mode.',
      secure_command_unavailable: 'This browser cannot create the secure start command.',
      start_failed: 'The verified run could not be started.',
      daily_starter_not_offered:
        'The daily challenge offer changed. Choose the newly offered champion.',
      account_changed: 'The authenticated account changed while the run was starting.',
      stale_run: 'The requested run is no longer the active run.',
      finalization_in_progress: 'Another run is still being finalized.',
      finalization_failed: 'The previous run could not be finalized.',
    },
    dailyTitle: 'Build your daily team',
    normalTitle: 'Build your team',
    resumableSubtitle:
      'An interrupted verified attempt is ready to resume with its original choices.',
    dailySubtitle: 'Every player faces the same daily seed · 1 starter',
    normalSubtitle: (starterCount, isGuest) =>
      `Normal run: your difficulty and your choices · select exactly ${number('en-US', starterCount)} champion${starterCount === 1 ? '' : 's'}${isGuest ? ' · saved on this device only' : ''}`,
    journeyLabel: 'Preparation steps',
    journeyTeam: 'Team',
    journeyRunes: 'Runes',
    journeyStart: 'Start',
    rerollRoster: (remaining) => `Reroll roster (${number('en-US', remaining)})`,
    chooseRunes: 'Choose your runes',
    runesHelp: 'Choose up to 3 optional runes to customize your run.',
    selectedRunes: (selected, maximum) =>
      `${number('en-US', selected)}/${number('en-US', maximum)} selected`,
    effectBeforeSelection: 'Effect before selection',
    selectionLimit: (starterCount) =>
      `This run requires exactly ${number('en-US', starterCount)} starting champion${starterCount === 1 ? '' : 's'}.`,
    selectedTeam: (names, selected, required) =>
      `${names.join(', ')} · ${number('en-US', selected)}/${number('en-US', required)} slot${selected === 1 ? '' : 's'} selected`,
    emptySelection: 'Select a champion to continue',
    loadingDaily: 'Loading challenge…',
    verifying: 'Verifying…',
    resumeVerifiedRun: 'Resume verified run',
    confirmChoice: 'Confirm selection',
    statLabels: {
      hp: 'HP',
      attack: 'ATK',
      defense: 'DEF',
      abilityPower: 'AP',
      speed: 'SPD',
      critical: 'CRIT',
    },
    chooseChampion: (name) => `Choose ${name}`,
  },
  spellUpgrade: {
    utilityEffect: 'Utility effect',
    pointAvailable: 'Skill point available',
    levelInstruction: (level) => `Level ${number('en-US', level)} · Choose a spell to upgrade`,
    abilitiesFor: (champion) => `${champion}'s abilities`,
    fallbackSpell: (slot) => `${slot} spell`,
    rank: 'Rank',
    mana: 'MP',
    cooldown: 'Cooldown',
    turns: (value) => `${value} turn${value === '1' ? '' : 's'}`,
    availability: {
      available: 'Available',
      maximum: 'Maximum',
      locked: 'Locked',
    },
    ability: (slot) => `${slot} ability`,
    detailAvailability: {
      available: 'Upgrade available',
      maximum: 'Maximum rank',
      locked: 'Locked',
    },
    estimatedEffects: 'Estimated effects',
    currentRank: (rank) => `Current rank · ${number('en-US', rank)}`,
    nextRank: (rank) => `Next rank · ${number('en-US', rank)}`,
    upgradeConsequence: 'Increases the spell values in the next combat.',
    maximumRankReason: 'Maximum rank reached',
    levelRequiredReason: 'Champion level too low for the next rank',
    upgradeSucceeded: (slot, champion, rank) =>
      `${champion}'s ${slot} upgraded to rank ${number('en-US', rank)}.`,
    upgradeFailed: (slot, champion) => `Unable to upgrade ${champion}'s ${slot}. Try again.`,
    upgrade: (slot, currentRank, nextRank) =>
      `Upgrade ${slot} · rank ${number('en-US', currentRank)} → ${number('en-US', nextRank)}`,
    maximumRank: (slot) => `${slot} · maximum rank`,
    levelRequired: (slot) => `${slot} · level required`,
    estimatedDamageNote: "Estimated damage with the current stats, before the target's defenses.",
  },
};

export const runPreparationContent = {
  'fr-FR': frFR,
  'en-US': enUS,
} as const satisfies Record<Locale, RunPreparationContentCatalog>;

export const runPreparationCopy = runPreparationContent[locale];

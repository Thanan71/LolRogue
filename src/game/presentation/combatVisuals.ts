import { ActionType } from '@/game/battle/types';

export type CombatVisualShape =
  | 'aura'
  | 'beam'
  | 'burst'
  | 'meteor'
  | 'projectile'
  | 'slash'
  | 'vortex'
  | 'wave';

export type CombatVisualTone =
  | 'arcane'
  | 'blood'
  | 'earth'
  | 'electric'
  | 'fire'
  | 'frost'
  | 'nature'
  | 'shadow'
  | 'solar'
  | 'steel';

export interface CombatVisualProfile {
  shape: CombatVisualShape;
  tone: CombatVisualTone;
  glyph: string;
  title: string;
}

const BASIC_ATTACK: CombatVisualProfile = {
  shape: 'slash',
  tone: 'steel',
  glyph: '✦',
  title: 'Attaque de base',
};

const PROFILES: Record<string, Partial<Record<ActionType, CombatVisualProfile>>> = {
  Annie: {
    [ActionType.SpellQ]: { shape: 'projectile', tone: 'fire', glyph: '●', title: 'Braise guidée' },
    [ActionType.SpellW]: { shape: 'wave', tone: 'fire', glyph: '≋', title: 'Cône ardent' },
    [ActionType.SpellE]: { shape: 'aura', tone: 'fire', glyph: '◇', title: 'Bouclier de lave' },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'fire',
      glyph: '✹',
      title: 'Invocation infernale',
    },
  },
  Ashe: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'frost',
      glyph: '❯',
      title: 'Volée glaciale',
    },
    [ActionType.SpellW]: { shape: 'wave', tone: 'frost', glyph: '❄', title: 'Éventail de givre' },
    [ActionType.SpellE]: { shape: 'aura', tone: 'frost', glyph: '◉', title: 'Vision cristalline' },
    [ActionType.SpellR]: {
      shape: 'projectile',
      tone: 'frost',
      glyph: '➶',
      title: 'Flèche de glace',
    },
  },
  Darius: {
    [ActionType.SpellQ]: { shape: 'vortex', tone: 'blood', glyph: '◒', title: 'Arc sanglant' },
    [ActionType.SpellW]: { shape: 'slash', tone: 'steel', glyph: '╱', title: 'Frappe écrasante' },
    [ActionType.SpellE]: {
      shape: 'projectile',
      tone: 'blood',
      glyph: '⌁',
      title: 'Traction brutale',
    },
    [ActionType.SpellR]: { shape: 'meteor', tone: 'blood', glyph: '▼', title: 'Exécution' },
  },
  Garen: {
    [ActionType.SpellQ]: { shape: 'slash', tone: 'solar', glyph: '✦', title: 'Frappe décisive' },
    [ActionType.SpellW]: { shape: 'aura', tone: 'steel', glyph: '⬡', title: 'Courage' },
    [ActionType.SpellE]: {
      shape: 'vortex',
      tone: 'steel',
      glyph: '◎',
      title: 'Tourbillon d’acier',
    },
    [ActionType.SpellR]: { shape: 'beam', tone: 'solar', glyph: '†', title: 'Jugement céleste' },
  },
  Jinx: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'electric',
      glyph: '✣',
      title: 'Rafale balistique',
    },
    [ActionType.SpellW]: {
      shape: 'beam',
      tone: 'electric',
      glyph: 'ϟ',
      title: 'Décharge électrique',
    },
    [ActionType.SpellE]: { shape: 'burst', tone: 'electric', glyph: '⌖', title: 'Piège explosif' },
    [ActionType.SpellR]: { shape: 'projectile', tone: 'fire', glyph: '➤', title: 'Super roquette' },
  },
  Leona: {
    [ActionType.SpellQ]: { shape: 'slash', tone: 'solar', glyph: '✷', title: 'Frappe solaire' },
    [ActionType.SpellW]: { shape: 'aura', tone: 'solar', glyph: '☼', title: 'Éclipse' },
    [ActionType.SpellE]: { shape: 'beam', tone: 'solar', glyph: '↝', title: 'Lame du zénith' },
    [ActionType.SpellR]: { shape: 'meteor', tone: 'solar', glyph: '✺', title: 'Éruption solaire' },
  },
  Lux: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'arcane',
      glyph: '◈',
      title: 'Entrave de lumière',
    },
    [ActionType.SpellW]: { shape: 'aura', tone: 'arcane', glyph: '◇', title: 'Prisme protecteur' },
    [ActionType.SpellE]: { shape: 'burst', tone: 'arcane', glyph: '◉', title: 'Sphère radieuse' },
    [ActionType.SpellR]: { shape: 'beam', tone: 'arcane', glyph: '━', title: 'Rayon final' },
  },
  Malphite: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'earth',
      glyph: '◆',
      title: 'Éclat de roche',
    },
    [ActionType.SpellW]: { shape: 'wave', tone: 'earth', glyph: '≋', title: 'Onde tellurique' },
    [ActionType.SpellE]: { shape: 'burst', tone: 'earth', glyph: '✹', title: 'Fracas terrestre' },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'earth',
      glyph: '⬢',
      title: 'Impact inarrêtable',
    },
  },
  Soraka: {
    [ActionType.SpellQ]: { shape: 'meteor', tone: 'nature', glyph: '✧', title: 'Pluie d’étoiles' },
    [ActionType.SpellW]: { shape: 'aura', tone: 'nature', glyph: '✚', title: 'Grâce astrale' },
    [ActionType.SpellE]: { shape: 'vortex', tone: 'shadow', glyph: '◌', title: 'Zone de silence' },
    [ActionType.SpellR]: { shape: 'wave', tone: 'nature', glyph: '✦', title: 'Souhait cosmique' },
  },
  Warwick: {
    [ActionType.SpellQ]: { shape: 'slash', tone: 'blood', glyph: '◢', title: 'Morsure' },
    [ActionType.SpellW]: { shape: 'wave', tone: 'blood', glyph: '⌁', title: 'Piste sanglante' },
    [ActionType.SpellE]: { shape: 'burst', tone: 'shadow', glyph: '◖', title: 'Hurlement de peur' },
    [ActionType.SpellR]: { shape: 'projectile', tone: 'blood', glyph: '➤', title: 'Bond bestial' },
  },
};

const FALLBACK_SPELLS: Record<ActionType, CombatVisualProfile> = {
  [ActionType.BasicAttack]: BASIC_ATTACK,
  [ActionType.SpellQ]: { shape: 'projectile', tone: 'arcane', glyph: 'Q', title: 'Compétence Q' },
  [ActionType.SpellW]: { shape: 'wave', tone: 'arcane', glyph: 'W', title: 'Compétence W' },
  [ActionType.SpellE]: { shape: 'burst', tone: 'arcane', glyph: 'E', title: 'Compétence E' },
  [ActionType.SpellR]: { shape: 'beam', tone: 'solar', glyph: 'R', title: 'Compétence ultime' },
};

export function getCombatVisualProfile(
  championId: string | undefined,
  action: ActionType | undefined,
): CombatVisualProfile {
  if (!action || action === ActionType.BasicAttack) return BASIC_ATTACK;
  return (championId && PROFILES[championId]?.[action]) || FALLBACK_SPELLS[action];
}

export function actionTypeForSlot(slot: 'Q' | 'W' | 'E' | 'R'): ActionType {
  return {
    Q: ActionType.SpellQ,
    W: ActionType.SpellW,
    E: ActionType.SpellE,
    R: ActionType.SpellR,
  }[slot];
}

export function slotForAction(action: ActionType | undefined): 'Q' | 'W' | 'E' | 'R' | null {
  if (action === ActionType.SpellQ) return 'Q';
  if (action === ActionType.SpellW) return 'W';
  if (action === ActionType.SpellE) return 'E';
  if (action === ActionType.SpellR) return 'R';
  return null;
}

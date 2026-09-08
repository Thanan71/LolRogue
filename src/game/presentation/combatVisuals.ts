import { ActionType } from '@/game/battle/types';
import { combatCopy, combatVisualTitleId } from '@/i18n/combatContent';

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
  title: combatCopy.visuals.basic_attack,
};

function spellVisualTitle(
  championId: string | undefined,
  action: ActionType.SpellQ | ActionType.SpellW | ActionType.SpellE | ActionType.SpellR,
): string {
  return combatCopy.visuals[combatVisualTitleId(championId, action)];
}

const PROFILES: Record<string, Partial<Record<ActionType, CombatVisualProfile>>> = {
  Annie: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'fire',
      glyph: '●',
      title: spellVisualTitle('Annie', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'wave',
      tone: 'fire',
      glyph: '≋',
      title: spellVisualTitle('Annie', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'aura',
      tone: 'fire',
      glyph: '◇',
      title: spellVisualTitle('Annie', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'fire',
      glyph: '✹',
      title: spellVisualTitle('Annie', ActionType.SpellR),
    },
  },
  Ashe: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'frost',
      glyph: '❯',
      title: spellVisualTitle('Ashe', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'wave',
      tone: 'frost',
      glyph: '❄',
      title: spellVisualTitle('Ashe', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'aura',
      tone: 'frost',
      glyph: '◉',
      title: spellVisualTitle('Ashe', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'projectile',
      tone: 'frost',
      glyph: '➶',
      title: spellVisualTitle('Ashe', ActionType.SpellR),
    },
  },
  Darius: {
    [ActionType.SpellQ]: {
      shape: 'vortex',
      tone: 'blood',
      glyph: '◒',
      title: spellVisualTitle('Darius', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'slash',
      tone: 'steel',
      glyph: '╱',
      title: spellVisualTitle('Darius', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'projectile',
      tone: 'blood',
      glyph: '⌁',
      title: spellVisualTitle('Darius', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'blood',
      glyph: '▼',
      title: spellVisualTitle('Darius', ActionType.SpellR),
    },
  },
  Garen: {
    [ActionType.SpellQ]: {
      shape: 'slash',
      tone: 'solar',
      glyph: '✦',
      title: spellVisualTitle('Garen', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'aura',
      tone: 'steel',
      glyph: '⬡',
      title: spellVisualTitle('Garen', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'vortex',
      tone: 'steel',
      glyph: '◎',
      title: spellVisualTitle('Garen', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'beam',
      tone: 'solar',
      glyph: '†',
      title: spellVisualTitle('Garen', ActionType.SpellR),
    },
  },
  Jinx: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'electric',
      glyph: '✣',
      title: spellVisualTitle('Jinx', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'beam',
      tone: 'electric',
      glyph: 'ϟ',
      title: spellVisualTitle('Jinx', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'burst',
      tone: 'electric',
      glyph: '⌖',
      title: spellVisualTitle('Jinx', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'projectile',
      tone: 'fire',
      glyph: '➤',
      title: spellVisualTitle('Jinx', ActionType.SpellR),
    },
  },
  Leona: {
    [ActionType.SpellQ]: {
      shape: 'slash',
      tone: 'solar',
      glyph: '✷',
      title: spellVisualTitle('Leona', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'aura',
      tone: 'solar',
      glyph: '☼',
      title: spellVisualTitle('Leona', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'beam',
      tone: 'solar',
      glyph: '↝',
      title: spellVisualTitle('Leona', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'solar',
      glyph: '✺',
      title: spellVisualTitle('Leona', ActionType.SpellR),
    },
  },
  Lux: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'arcane',
      glyph: '◈',
      title: spellVisualTitle('Lux', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'aura',
      tone: 'arcane',
      glyph: '◇',
      title: spellVisualTitle('Lux', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'burst',
      tone: 'arcane',
      glyph: '◉',
      title: spellVisualTitle('Lux', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'beam',
      tone: 'arcane',
      glyph: '━',
      title: spellVisualTitle('Lux', ActionType.SpellR),
    },
  },
  Malphite: {
    [ActionType.SpellQ]: {
      shape: 'projectile',
      tone: 'earth',
      glyph: '◆',
      title: spellVisualTitle('Malphite', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'wave',
      tone: 'earth',
      glyph: '≋',
      title: spellVisualTitle('Malphite', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'burst',
      tone: 'earth',
      glyph: '✹',
      title: spellVisualTitle('Malphite', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'meteor',
      tone: 'earth',
      glyph: '⬢',
      title: spellVisualTitle('Malphite', ActionType.SpellR),
    },
  },
  Soraka: {
    [ActionType.SpellQ]: {
      shape: 'meteor',
      tone: 'nature',
      glyph: '✧',
      title: spellVisualTitle('Soraka', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'aura',
      tone: 'nature',
      glyph: '✚',
      title: spellVisualTitle('Soraka', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'vortex',
      tone: 'shadow',
      glyph: '◌',
      title: spellVisualTitle('Soraka', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'wave',
      tone: 'nature',
      glyph: '✦',
      title: spellVisualTitle('Soraka', ActionType.SpellR),
    },
  },
  Warwick: {
    [ActionType.SpellQ]: {
      shape: 'slash',
      tone: 'blood',
      glyph: '◢',
      title: spellVisualTitle('Warwick', ActionType.SpellQ),
    },
    [ActionType.SpellW]: {
      shape: 'wave',
      tone: 'blood',
      glyph: '⌁',
      title: spellVisualTitle('Warwick', ActionType.SpellW),
    },
    [ActionType.SpellE]: {
      shape: 'burst',
      tone: 'shadow',
      glyph: '◖',
      title: spellVisualTitle('Warwick', ActionType.SpellE),
    },
    [ActionType.SpellR]: {
      shape: 'projectile',
      tone: 'blood',
      glyph: '➤',
      title: spellVisualTitle('Warwick', ActionType.SpellR),
    },
  },
};

const FALLBACK_SPELLS: Record<ActionType, CombatVisualProfile> = {
  [ActionType.BasicAttack]: BASIC_ATTACK,
  [ActionType.SpellQ]: {
    shape: 'projectile',
    tone: 'arcane',
    glyph: 'Q',
    title: spellVisualTitle(undefined, ActionType.SpellQ),
  },
  [ActionType.SpellW]: {
    shape: 'wave',
    tone: 'arcane',
    glyph: 'W',
    title: spellVisualTitle(undefined, ActionType.SpellW),
  },
  [ActionType.SpellE]: {
    shape: 'burst',
    tone: 'arcane',
    glyph: 'E',
    title: spellVisualTitle(undefined, ActionType.SpellE),
  },
  [ActionType.SpellR]: {
    shape: 'beam',
    tone: 'solar',
    glyph: 'R',
    title: spellVisualTitle(undefined, ActionType.SpellR),
  },
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

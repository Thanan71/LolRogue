import type { SpellSlot } from '../ChampionInstance';
import { ActionType } from './types';

export function actionToSpellSlot(action: ActionType): SpellSlot | null {
  switch (action) {
    case ActionType.SpellQ:
      return 'Q';
    case ActionType.SpellW:
      return 'W';
    case ActionType.SpellE:
      return 'E';
    case ActionType.SpellR:
      return 'R';
    default:
      return null;
  }
}

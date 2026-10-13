import { useBattleStore } from '@/stores/battleStore';
import { useCombatController } from '../hooks/useCombatController';
import { useCombatEncounter } from '../hooks/useCombatEncounter';
import { CombatView } from './CombatView';
import '@/styles/combat-ui.css';

export function CombatScreen() {
  const encounter = useCombatEncounter();
  const controller = useCombatController({
    ...encounter,
    readBattle: useBattleStore.getState,
  });
  return <CombatView {...encounter} {...controller} />;
}

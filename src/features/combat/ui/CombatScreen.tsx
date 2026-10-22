import { requiresHistoricalAuthorityPlayback } from '@/game/authority/historicalAuthority';
import { useBattleStore } from '@/stores/battleStore';
import { useRunStore } from '@/stores/runStore';
import { useCombatController } from '../hooks/useCombatController';
import { useCombatEncounter } from '../hooks/useCombatEncounter';
import { CombatView } from './CombatView';
import { HistoricalCombatScreen } from './HistoricalCombatScreen';
import '@/styles/combat-ui.css';

export function CombatScreen() {
  const engineVersion = useRunStore((state) => state.authorityAttempt?.engineVersion);
  const runId = useRunStore((state) => state.runId);
  return requiresHistoricalAuthorityPlayback(engineVersion) ? (
    <HistoricalCombatScreen key={runId} />
  ) : (
    <CurrentCombatScreen />
  );
}

function CurrentCombatScreen() {
  const encounter = useCombatEncounter();
  const controller = useCombatController({
    ...encounter,
    readBattle: useBattleStore.getState,
  });
  return <CombatView {...encounter} {...controller} />;
}

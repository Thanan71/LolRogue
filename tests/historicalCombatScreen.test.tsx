// @vitest-environment jsdom
import type { User } from '@supabase/supabase-js';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/config/routes';
import { resumeHistoricalCombat } from '@/features/combat/application/historicalCombat';
import { CombatScreen } from '@/features/combat/ui/CombatScreen';
import type { HistoricalAuthorityVerifier } from '@/game/authority/historicalAuthority';
import {
  historicalAuthorityAttempt,
  historicalAuthorityCommands,
  requiresHistoricalAuthorityPlayback,
} from '@/game/authority/historicalAuthority';
import { getHistoricalCombatContent } from '@/i18n/historicalCombatContent';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import {
  HISTORICAL_COMBAT_ENGINE,
  HISTORICAL_COMBAT_HASH,
  historicalCombatFixture,
} from './helpers/historicalCombatFixture';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  load: vi.fn<(engineVersion: string) => Promise<HistoricalAuthorityVerifier | undefined>>(),
  currentEncounter: vi.fn(() => {
    throw new Error('Current encounter runtime must not mount');
  }),
  currentBattle: vi.fn(() => {
    throw new Error('Current battle runtime must not mount');
  }),
}));
vi.mock('@/game/authority/versionClientReplay.generated', () => ({
  HISTORICAL_AUTHORITY_ENGINES: ['run-engine-0.2.5'],
  loadHistoricalAuthorityVerifier: mocks.load,
}));
vi.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => mocks.navigate }));
vi.mock('@/features/combat/hooks/useCombatEncounter', () => ({
  useCombatEncounter: mocks.currentEncounter,
}));
vi.mock('@/features/combat/hooks/useBattleManager', () => ({
  useBattleManager: mocks.currentBattle,
}));

describe('TREE-04: historical compatibility UI and atomic completion', () => {
  let verifier: HistoricalAuthorityVerifier;
  const realEndRun = useRunStore.getState().endRun;
  beforeAll(async () => {
    verifier = (await resolveRegisteredAuthorityVerifier(
      HISTORICAL_COMBAT_ENGINE,
      HISTORICAL_COMBAT_HASH,
    ))!;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(verifier);
    useAuthStore.setState({ user: { id: 'historical-player' } as User });
    useRunStore.setState({ ...historicalCombatFixture(verifier), endRun: realEndRun });
  });
  afterEach(() => {
    cleanup();
    useRunStore.setState({ ...RUN_INITIAL_STATE, endRun: realEndRun });
    useAuthStore.setState({ user: null });
  });

  it('announces historical autoplay and never mounts current battle or encounter hooks', async () => {
    const user = userEvent.setup();
    render(<CombatScreen />);
    expect(screen.getByText(/règles et améliorations de sa version d’origine/)).toBeVisible();
    expect(screen.getByText(/repris automatiquement depuis son début/)).toBeVisible();
    expect(mocks.load).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reprendre le combat en automatique' }));
    expect(await screen.findByRole('heading', { name: 'Combat remporté' })).toBeVisible();
    expect(mocks.currentEncounter).not.toHaveBeenCalled();
    expect(mocks.currentBattle).not.toHaveBeenCalled();
    const state = useRunStore.getState();
    const frozen = verifier.replay(
      historicalAuthorityAttempt(state.authorityAttempt!),
      historicalAuthorityCommands(state.authorityAttempt!),
    );
    expect(state.ledger).toEqual(frozen.snapshot.ledger);
    expect(state.gold).toBe(frozen.snapshot.gold);
    await user.click(screen.getByRole('button', { name: 'Continuer sur la carte' }));
    expect(mocks.navigate).toHaveBeenCalledWith(ROUTES.RUN);
  });

  it('preserves the entire saved run on a load failure and offers a working retry', async () => {
    const before = structuredClone(useRunStore.getState().authorityAttempt);
    mocks.load.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<CombatScreen />);
    await user.click(screen.getByRole('button', { name: 'Reprendre le combat en automatique' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ta run est conservée');
    expect(useRunStore.getState().authorityAttempt).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Réessayer la reprise' }));
    expect(await screen.findByRole('heading', { name: 'Combat remporté' })).toBeVisible();
  });

  it('does not update another run when its lazy archive finishes loading', async () => {
    let finish!: (value: HistoricalAuthorityVerifier) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = resumeHistoricalCombat();
    useRunStore.setState({ runId: 'a-new-run', gold: 12345 });
    finish(verifier);
    await expect(pending).rejects.toThrow('changed while');
    expect(useRunStore.getState().runId).toBe('a-new-run');
    expect(useRunStore.getState().gold).toBe(12345);
  });

  it('uses the frozen terminal state when finalizing a historical defeat', async () => {
    const state = useRunStore.getState();
    const terminalFixture = historicalCombatFixture(verifier, {
      initialTeam: ['Soraka'],
      seed: 1,
      difficulty: 'hard' as const,
      enhancementSnapshot: {},
      masterySnapshot: {},
    });
    useRunStore.setState(terminalFixture);
    const endRun = vi.fn().mockResolvedValue({ success: true });
    useRunStore.setState({ endRun });
    const result = await resumeHistoricalCombat();
    expect(result.replay.snapshot.terminal).toBe(true);
    expect(result.replay.snapshot.endReason).toBe('defeat');
    expect(endRun).toHaveBeenCalledWith(
      false,
      state.runId,
      expect.objectContaining({ won: false }),
    );
    expect(result.finalization?.completed).toBe(true);
    expect(
      useRunStore.getState().authorityAttempt?.commands.map((command) => command.kind),
    ).toEqual(['move_node', 'resolve_combat']);
    expect(useRunStore.getState().team[0].currentHp).toBe(result.replay.snapshot.team[0].currentHp);
  });

  it('routes only generated replay-capable engines and provides French and English copy', () => {
    expect(requiresHistoricalAuthorityPlayback('run-engine-0.2.5')).toBe(true);
    expect(requiresHistoricalAuthorityPlayback('run-engine-0.3.0')).toBe(false);
    expect(requiresHistoricalAuthorityPlayback('unknown')).toBe(false);
    expect(requiresHistoricalAuthorityPlayback()).toBe(false);
    expect(getHistoricalCombatContent('en-US').automatic).toContain('automatically');
    expect(getHistoricalCombatContent('fr-FR').automatic).toContain('automatiquement');
  });
});

import type { PlayerEnhancementState } from '@/types/enhancementTree';
import type { ChampionMastery, Player } from '@/types/models';
import { applicationRepositories } from './container/applicationRepositories';
import type { IRepositoryContainer } from './interfaces/IRepositoryContainer';

/** Captured by the caller; the service never reads an authentication or UI store. */
export interface ProgressionRefreshScope {
  readonly userId: string | null;
  readonly isCurrent?: () => boolean;
}

export type ProgressionRefreshResult<T> =
  | { status: 'loaded'; data: T }
  | { status: 'guest' | 'stale' };

export interface EnhancementProgressionSnapshot {
  states: Map<string, PlayerEnhancementState>;
  masteries: ChampionMastery[] | null;
}

type ProgressionRepositories = Pick<IRepositoryContainer, 'player' | 'mastery' | 'enhancement'>;

function inactive(scope: ProgressionRefreshScope): 'guest' | 'stale' | null {
  if (!scope.userId) return 'guest';
  return scope.isCurrent?.() === false ? 'stale' : null;
}

/** Server reads and their identity boundary; applying the returned snapshot belongs to the UI. */
export class AccountProgressionService {
  constructor(private readonly repositories: ProgressionRepositories) {}

  async loadPlayer(
    scope: ProgressionRefreshScope,
  ): Promise<ProgressionRefreshResult<Player | null>> {
    return this.load(scope, async (userId) => {
      const result = await this.repositories.player.getPlayer(userId);
      if (result.error) throw result.error;
      return result.data;
    });
  }

  async loadMasteries(
    scope: ProgressionRefreshScope,
  ): Promise<ProgressionRefreshResult<ChampionMastery[] | null>> {
    return this.load(scope, async (userId) => {
      const result = await this.repositories.mastery.getChampionMastery(userId);
      if (result.error) throw result.error;
      return result.data;
    });
  }

  async loadEnhancements(
    scope: ProgressionRefreshScope,
  ): Promise<ProgressionRefreshResult<EnhancementProgressionSnapshot>> {
    return this.load(scope, async (userId) => {
      const states = await this.repositories.enhancement.getAllEnhancementStates(userId);
      if (inactive(scope)) return { states, masteries: null };
      const result = await this.repositories.mastery.getChampionMastery(userId);
      if (result.error) throw result.error;
      return { states, masteries: result.data };
    });
  }

  private async load<T>(
    scope: ProgressionRefreshScope,
    read: (userId: string) => Promise<T>,
  ): Promise<ProgressionRefreshResult<T>> {
    const status = inactive(scope);
    if (status) return { status };
    const userId = scope.userId;
    if (!userId) return { status: 'guest' };
    try {
      const data = await read(userId);
      return inactive(scope) ? { status: 'stale' } : { status: 'loaded', data };
    } catch (error) {
      if (inactive(scope)) return { status: 'stale' };
      throw error;
    }
  }
}

export const accountProgressionService = new AccountProgressionService(applicationRepositories);

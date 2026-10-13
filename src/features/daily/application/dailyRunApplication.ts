import { applicationRepositories } from '@/infrastructure/repositories/applicationRepositories';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';

/** Daily uses the existing repository contract; controllers can inject another implementation. */
export function createDailyRunApplication(repository: IDailyRunRepository): IDailyRunRepository {
  return {
    getDailyChallenge: () => repository.getDailyChallenge(),
    getDailyLeaderboard: (filters) => repository.getDailyLeaderboard(filters),
    reportDailyScore: (entryId, reason) => repository.reportDailyScore(entryId, reason),
    setLeaderboardPrivacy: (publicDisplayName, optOut) =>
      repository.setLeaderboardPrivacy(publicDisplayName, optOut),
  };
}

export const dailyRunApplication = createDailyRunApplication(applicationRepositories.dailyRun);

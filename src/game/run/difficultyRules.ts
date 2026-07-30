import type { AuthorityDifficulty } from '@/types/runAttempt';

export interface DifficultyRule {
  enemyStatMultiplier: number;
  goldMultiplier: number;
  dropMultiplier: number;
}

export const DIFFICULTY_RULES: Record<AuthorityDifficulty, DifficultyRule> = {
  easy: {
    enemyStatMultiplier: 0.85,
    goldMultiplier: 0.9,
    dropMultiplier: 0.9,
  },
  normal: {
    enemyStatMultiplier: 1,
    goldMultiplier: 1,
    dropMultiplier: 1,
  },
  hard: {
    enemyStatMultiplier: 1.2,
    goldMultiplier: 1.15,
    dropMultiplier: 1.15,
  },
};

export function getDifficultyRule(difficulty: AuthorityDifficulty): DifficultyRule {
  return DIFFICULTY_RULES[difficulty];
}

import type { AuthorityDifficulty } from '@/types/runAttempt';

export interface DifficultyRule {
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  goldMultiplier: number;
  dropMultiplier: number;
}

export const DIFFICULTY_RULES: Record<AuthorityDifficulty, DifficultyRule> = {
  easy: {
    enemyHealthMultiplier: 0.85,
    enemyDamageMultiplier: Math.sqrt(0.85),
    goldMultiplier: 0.9,
    dropMultiplier: 1,
  },
  normal: {
    enemyHealthMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1,
    dropMultiplier: 1,
  },
  hard: {
    enemyHealthMultiplier: 1.2,
    enemyDamageMultiplier: Math.sqrt(1.2),
    goldMultiplier: 1.15,
    dropMultiplier: 1,
  },
};

export function getDifficultyRule(difficulty: AuthorityDifficulty): DifficultyRule {
  return DIFFICULTY_RULES[difficulty];
}

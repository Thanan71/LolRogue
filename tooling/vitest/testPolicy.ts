import { configDefaults, type ViteUserConfig } from 'vitest/config';

/** Unit-test ordering and coverage gates, independent of deployment environment validation. */
export function createTestPolicy(argv: readonly string[] = process.argv): ViteUserConfig['test'] {
  return {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./tests/setup/react.ts'],
    // Keep Node's experimental process-wide storage from shadowing jsdom's per-window storage.
    execArgv: ['--no-experimental-webstorage'],
    fileParallelism: !argv.includes('--coverage'),
    sequence: {
      shuffle: true,
      seed: 20_260_801,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'html', 'lcov'],
      include: [
        'src/domain/**/*.ts',
        'src/game/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
        'src/utils/**/*.ts',
        'src/hooks/useKeyboardShortcuts.ts',
        'src/components/EncounterRoute.tsx',
        'src/components/RunLifecycleRoute.tsx',
        'src/shared/ui/Feedback.tsx',
        'src/shared/hooks/**/*.ts',
        'src/features/administration/**/*.ts',
        'src/features/administration/**/*.tsx',
        'src/features/combat/**/*.ts',
        'src/features/combat/**/*.tsx',
        'src/features/champions/**/*.ts',
        'src/features/champions/**/*.tsx',
        'src/features/daily/**/*.ts',
        'src/features/daily/**/*.tsx',
        'src/features/enhancements/**/*.ts',
        'src/features/enhancements/**/*.tsx',
        'src/infrastructure/**/*.ts',
        'src/pages/ProfilePage.tsx',
      ],
      exclude: ['**/*.d.ts', '**/types.ts', '**/index.ts', 'src/services/interfaces/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 72,
        // Vitest 4 uses accurate AST-based V8 remapping. These domain
        // baselines were remeasured during the v2 -> v4 migration instead of
        // preserving the false-positive percentages produced by v2.
        'src/game/**': {
          statements: 75,
          branches: 61,
          functions: 60,
          lines: 77,
        },
        'src/game/run/runAuthorityJournal.ts': {
          statements: 100,
          branches: 98,
          functions: 100,
          lines: 100,
        },
        'src/services/**': {
          statements: 55,
          branches: 50,
          functions: 60,
          lines: 58,
        },
        'src/stores/**': {
          statements: 45,
          branches: 38,
          functions: 35,
          lines: 49,
        },
        'src/utils/**': {
          statements: 50,
          branches: 40,
          functions: 55,
          lines: 50,
        },
        'src/services/runAttemptService.ts': {
          statements: 82,
          branches: 75,
          functions: 94,
          lines: 90,
        },
        'src/services/runService.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        'src/services/repositories/SupabaseAuthRepository.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'src/services/repositories/SupabaseRunRepository.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
        'src/services/repositories/runHistoryQueries.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
        'src/services/repositories/SupabaseDailyRunRepository.ts': {
          statements: 97,
          branches: 93,
          functions: 100,
          lines: 97,
        },
        'src/services/repositories/SupabasePlayerRepository.ts': {
          statements: 100,
          branches: 88,
          functions: 100,
          lines: 100,
        },
        'src/pages/ProfilePage.tsx': {
          statements: 95,
          branches: 90,
          functions: 90,
          lines: 95,
        },
        'src/stores/runStore.ts': {
          statements: 78,
          branches: 73,
          functions: 82,
          lines: 80,
        },
        'src/stores/authStore.ts': {
          statements: 50,
          branches: 38,
          functions: 65,
          lines: 54,
        },
        'src/stores/enhancementStore.ts': {
          statements: 45,
          branches: 44,
          functions: 35,
          lines: 49,
        },
        'src/utils/statCalculator.ts': {
          statements: 80,
          branches: 54,
          functions: 90,
          lines: 78,
        },
      },
    },
  };
}

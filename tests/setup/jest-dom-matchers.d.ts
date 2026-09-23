import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import 'vitest';

// jest-dom 7's Vitest entrypoint still declares the pre-Vitest-5 Assertion<T>.
// Keep the standalone matchers while matching Vitest 5's sync/async return type.
declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}

  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}

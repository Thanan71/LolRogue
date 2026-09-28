// @vitest-environment jsdom

import { describe, expect, expectTypeOf, it } from 'vitest';

// This function is compiled, not executed: invalid calls must remain type errors.
function matcherTypeContract(element: HTMLElement) {
  // @ts-expect-error The text matcher accepts string/RegExp, not a number.
  expect(element).toHaveTextContent(123);
  // @ts-expect-error Attribute names must be strings.
  expect(element).toHaveAttribute(123);
  // @ts-expect-error Vitest's synchronous DOM matchers do not return promises.
  const asynchronous: Promise<void> = expect(element).toBeInTheDocument();
  // @ts-expect-error Vitest's resolves chain returns a promise, not void.
  const synchronous: void = expect(Promise.resolve(element)).resolves.toBeInTheDocument();
  return { asynchronous, synchronous };
}
void matcherTypeContract;

describe('standalone jest-dom matchers with Vitest 5', () => {
  it('keeps synchronous, negated and asymmetric DOM matchers registered', () => {
    const button = document.createElement('button');
    button.textContent = 'Continue';
    button.setAttribute('aria-label', 'Continue the run');
    document.body.append(button);

    try {
      expectTypeOf(expect(button).toBeInTheDocument()).toEqualTypeOf<void>();
      expect(button).toHaveTextContent('Continue');
      expect(button).not.toBeDisabled();
      expect(button).toHaveAccessibleName(expect.stringContaining('Continue'));
      expect({ button }).toEqual({ button: expect.toHaveTextContent('Continue') });
    } finally {
      button.remove();
    }
  });

  it('preserves Promise<void> for resolves and rejects DOM assertions', async () => {
    const element = document.createElement('span');
    element.textContent = 'Ready';

    const resolved = expect(Promise.resolve(element)).resolves.toHaveTextContent('Ready');
    const rejected = expect(Promise.reject(element)).rejects.toHaveTextContent('Ready');
    expectTypeOf(resolved).toEqualTypeOf<Promise<void>>();
    expectTypeOf(rejected).toEqualTypeOf<Promise<void>>();
    await Promise.all([resolved, rejected]);
  });
});

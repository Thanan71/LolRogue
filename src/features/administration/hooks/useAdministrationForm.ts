import { useMemo } from 'react';
import {
  readAdministrationForm,
  type AdministrationContextKey,
} from '../domain/administrationNavigation';
import type { AdministrationNavigation } from './useAdministrationNavigation';

/** Keeps validated form identity stable while unrelated URL contexts change. */
export function useAdministrationForm<T extends object>(
  navigation: AdministrationNavigation | undefined,
  key: AdministrationContextKey,
  defaults: T,
  validate: (value: T) => unknown,
): T | null {
  const context = navigation?.location.contexts[key];
  const serialized = JSON.stringify(
    context
      ? Object.fromEntries(
          Object.keys(defaults)
            .filter((field) => field in context)
            .map((field) => [field, context[field]]),
        )
      : null,
  );
  const controlled = navigation !== undefined;
  return useMemo(() => {
    if (!controlled) return null;
    return readAdministrationForm(
      {
        group: 'overview',
        view: 'dashboard',
        player: null,
        run: null,
        contexts: { [key]: JSON.parse(serialized) },
      },
      key,
      defaults,
      validate,
    );
  }, [serialized, defaults, validate, controlled, key]);
}

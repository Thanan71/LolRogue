// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextTutorial } from '@/components/ContextTutorial';
import type { TutorialStorageKey } from '@/utils/ancillaryStorage';

const keys: TutorialStorageKey[] = ['lolrogue:tutorial:map:v2', 'lolrogue:tutorial:combat:v2'];
const tutorial = (storageKey: TutorialStorageKey) => (
  <ContextTutorial
    storageKey={storageKey}
    title="Storage tutorial"
    buttonLabel="Tutorial help"
    steps={[{ title: 'First step', body: 'Tutorial contents' }]}
  />
);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('tutorial cache integration', () => {
  it.each(keys)('migrates the existing completion and remains reopenable for %s', (key) => {
    const legacyKey = key.replace(':v2', ':v1');
    localStorage.setItem(legacyKey, 'done');
    render(tutorial(key));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      version: 2,
      state: { completed: true },
    });
    expect(localStorage.getItem(legacyKey)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '? Tutorial help' }));
    expect(screen.getByRole('dialog', { name: 'Storage tutorial' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '? Tutorial help' })).toHaveFocus();
  });

  it.each(keys)('shows a new tutorial once and persists its completion for %s', (key) => {
    const first = render(tutorial(key));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    first.unmount();
    render(tutorial(key));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['missing', 'getter', 'quota'] as const)(
    'allows closing and reopening the tutorial with %s storage',
    (mode) => {
      const backend = localStorage;
      if (mode === 'quota') {
        vi.stubGlobal('localStorage', {
          getItem: backend.getItem.bind(backend),
          removeItem: backend.removeItem.bind(backend),
          setItem: () => {
            throw new DOMException('full', 'QuotaExceededError');
          },
        });
      } else {
        vi.stubGlobal('localStorage', undefined);
        if (mode === 'getter')
          Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get: () => {
              throw new DOMException('blocked', 'SecurityError');
            },
          });
      }
      render(tutorial(keys[0]!));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '? Tutorial help' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
  );
});

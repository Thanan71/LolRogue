// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabasePage } from '@/pages/DatabasePage';
import { useAuthStore } from '@/stores/authStore';
import { useEnhancementStore } from '@/stores/enhancementStore';

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const scrollIntoView = vi.fn();

describe('base des champions sur mobile', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query === '(max-width: 48rem)' || query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  afterAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  beforeEach(() => {
    scrollIntoView.mockClear();
    useEnhancementStore.getState().reset();
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: true,
      isGuest: true,
      isInitialized: true,
      isLoading: false,
      error: null,
    });
  });

  it('amène le focus sur la fiche puis revient au champion sélectionné', async () => {
    render(
      <MemoryRouter>
        <DatabasePage />
      </MemoryRouter>,
    );

    const champion = screen.getByRole('button', { name: /Garen/i });
    fireEvent.click(champion);

    const detail = screen.getByRole('region', { name: 'Fiche de Garen' });
    await waitFor(() => expect(detail).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(screen.getByRole('button', { name: /Retour à la liste/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retour à la liste/i }));

    await waitFor(() => expect(champion).toHaveFocus());
  });
});

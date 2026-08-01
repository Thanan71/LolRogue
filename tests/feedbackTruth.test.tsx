// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationRegion } from '@/components/NotificationRegion';
import { GameOverPage } from '@/pages/GameOverPage';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useRunStore } from '@/stores/runStore';

describe("vérité et récupération de l'interface", () => {
  afterEach(() => {
    vi.useRealTimers();
    useRunStore.setState({
      saveStatus: 'idle',
      saveError: null,
      saveFailureKind: null,
      completedRunSnapshot: null,
    });
    useEnhancementStore.setState({ error: null });
  });

  it("n'invente pas une défaite lors d'un accès direct à Game Over", () => {
    render(
      <MemoryRouter initialEntries={['/game-over']}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Résultat introuvable')).toBeInTheDocument();
    expect(screen.queryByText('Défaite')).not.toBeInTheDocument();
  });

  it("conserve une erreur critique jusqu'à sa fermeture explicite", () => {
    vi.useFakeTimers();
    useRunStore.setState({
      saveStatus: 'failed',
      saveError: 'Serveur indisponible',
      saveFailureKind: 'retryable',
    });
    render(<NotificationRegion />);

    expect(screen.getByRole('alert')).toHaveTextContent('Serveur indisponible');
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LegalPage } from '@/pages/LegalPage';

describe('LegalPage', () => {
  it('exposes terms, privacy, retention, user rights and the Riot notice publicly', () => {
    render(
      <MemoryRouter initialEntries={['/legal']}>
        <LegalPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Informations légales et confidentialité' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conditions d’utilisation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confidentialité' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Accès, export et suppression' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/13 mois maximum/)).toBeInTheDocument();
    expect(screen.getByText(/Riot Games ne soutient ni ne sponsorise/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Politique officielle Riot Games' })).toHaveAttribute(
      'href',
      'https://www.riotgames.com/en/legal',
    );
  });
});

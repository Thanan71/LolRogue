// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreditsPage } from '@/pages/CreditsPage';

describe('CreditsPage', () => {
  it('presents navigable, current and legally attributed credits', () => {
    render(
      <MemoryRouter initialEntries={['/credits']}>
        <CreditsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Crédits' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Parcourir les crédits' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Technologies utilisées' })).toHaveAttribute(
      'href',
      '#credit-technologies',
    );
    expect(screen.getByRole('region', { name: 'Technologies utilisées' })).toBeInTheDocument();
    expect(screen.getByText('React 19')).toBeInTheDocument();
    expect(screen.getByText('Riot Games — Data Dragon')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Consulter les informations légales et de confidentialité',
      }),
    ).toHaveAttribute('href', '/legal');
  });
});

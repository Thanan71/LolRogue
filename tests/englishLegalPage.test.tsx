// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('English legal page', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.setItem(
      'lolrogue-settings',
      JSON.stringify({ state: { language: 'en-US' } }),
    );
  });

  it('renders every legal section from the English catalog', async () => {
    const { LegalPage } = await import('@/pages/LegalPage');

    render(
      <MemoryRouter initialEntries={['/legal']}>
        <LegalPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Legal information and privacy' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Terms of use' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText('Until account deletion')).toBeInTheDocument();
    expect(screen.getByText('Until browser data is cleared')).toBeInTheDocument();
    expect(screen.queryByText('Informations légales et confidentialité')).not.toBeInTheDocument();
    expect(screen.queryByText('Conditions d’utilisation')).not.toBeInTheDocument();
  });
});

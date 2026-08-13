// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RulesPage } from '@/pages/RulesPage';

describe('RulesPage', () => {
  it('uses the shared page shell and preserves search and category filtering', () => {
    const { container } = render(
      <MemoryRouter>
        <RulesPage />
      </MemoryRouter>,
    );

    expect(container.querySelector('main.ui-page-shell.rules-page')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('15 règle(s) affichée(s)');

    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'Combat' } });
    expect(screen.getByRole('status')).toHaveTextContent('5 règle(s) affichée(s)');
    expect(screen.getByRole('heading', { name: 'Autoplay' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rechercher une règle'), {
      target: { value: 'introuvable' },
    });
    expect(screen.getByText('Aucune règle trouvée')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByRole('status')).toHaveTextContent('15 règle(s) affichée(s)');
    expect(screen.getByLabelText('Rechercher une règle')).toHaveValue('');
    expect(screen.getByLabelText('Catégorie')).toHaveValue('Toutes');
  });
});

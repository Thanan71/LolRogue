// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { EncounterLayout } from '@/components/EncounterLayout';

describe('EncounterLayout', () => {
  it('owns the scrollable encounter shell and wraps long actions', () => {
    render(
      <EncounterLayout title="Long encounter title" gold={125} tone="orange">
        <p>{'Long content '.repeat(50)}</p>
        <button type="button">Continue</button>
      </EncounterLayout>,
    );
    expect(screen.getByRole('main')).toHaveClass('encounter-layout--orange');
    expect(screen.getByRole('heading', { name: 'Long encounter title' })).toBeInTheDocument();
    expect(screen.getByText('Or : 125')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' }).parentElement).toHaveClass(
      'encounter-layout__content',
    );
  });
});

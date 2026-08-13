// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { EncounterLayout } from '@/components/EncounterLayout';

describe('EncounterLayout', () => {
  it('owns the scrollable encounter shell and wraps long actions', () => {
    render(
      <EncounterLayout
        title="Long encounter title"
        gold={125}
        tone="orange"
        subtitle="Encounter guidance"
      >
        <p>{'Long content '.repeat(50)}</p>
        <button type="button">Continue</button>
      </EncounterLayout>,
    );
    expect(screen.getByRole('main')).toHaveClass('encounter-layout--orange');
    const heading = screen.getByRole('heading', { name: 'Long encounter title' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Encounter guidance')).toBeInTheDocument();
    expect(screen.getByLabelText('Or : 125')).toBeInTheDocument();
    const content = screen.getByRole('button', { name: 'Continue' }).closest('section');
    expect(content).toHaveClass('encounter-layout__content');
    expect(content).toHaveAttribute('aria-labelledby', heading.id);
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunHistoryFilters } from '@/components/history/RunHistoryFilters';

vi.mock('@/audio', () => ({ playUIClick: vi.fn(), playUIHover: vi.fn() }));

describe('gameplay release history filter', () => {
  it('offers semantic release labels while preserving numeric repository filters', () => {
    const onChange = vi.fn();
    render(<RunHistoryFilters value={{ mode: 'daily' }} onChange={onChange} />);
    const gameplay = screen.getByRole('combobox', { name: 'Version des règles de jeu' });
    expect(screen.getByRole('option', { name: 'v0.2.0' })).toHaveValue('23');
    expect(screen.getByRole('option', { name: 'v22' })).toHaveValue('22');
    expect(screen.queryByRole('option', { name: 'v23' })).not.toBeInTheDocument();

    fireEvent.change(gameplay, { target: { value: '23' } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'daily', gameplayRulesetVersion: 23 });
    fireEvent.change(gameplay, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'daily' });
  });

  it('preserves an unknown stored ordinal and keeps the selected release visible', () => {
    render(<RunHistoryFilters value={{ gameplayRulesetVersion: 300 }} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Version des règles de jeu' })).toHaveValue('300');
    expect(screen.getByRole('option', { name: 'v300' })).toHaveValue('300');
  });
});

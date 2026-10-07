// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunHistoryItem } from '@/components/history/RunHistoryItem';
import type { IRunRepository, RunHistoryEntry } from '@/services/interfaces/IRunRepository';
import type { Run } from '@/types/models';

vi.mock('@/audio', () => ({ playUIClick: vi.fn(), playUIHover: vi.fn() }));
const run = {
  id: 'history-run',
  progression_source: 'legacy',
  won: true,
  run_level: 1,
  waves_completed: 0,
  total_kills: 0,
  created_at: '2026-10-07T10:00:00Z',
  completed_at: '2026-10-07T10:00:00Z',
  rune_ids: [],
  augment_ids: [],
  total_damage_dealt: 0,
  total_healing_done: 0,
  total_shielding_done: 0,
  gold_earned: 0,
  total_gold_spent: 0,
  items_purchased: 0,
} as unknown as Run;
const entry: RunHistoryEntry = { run, attempt: null };
function openRow() {
  fireEvent.click(screen.getByText('Victoire').closest('summary')!);
}

describe('lazy history row details', () => {
  it('fetches on expansion, retries a failed request and caches successful details across toggles', async () => {
    const getRunHistoryDetails = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValueOnce({ data: { run, teamMembers: [] }, error: null });
    const view = render(
      <RunHistoryItem
        entry={entry}
        repository={{ getRunHistoryDetails } as unknown as IRunRepository}
      />,
    );
    expect(getRunHistoryDetails).not.toHaveBeenCalled();
    openRow();
    await screen.findByText('Les détails n’ont pas pu être chargés. Réessayez.');
    fireEvent.click(screen.getByRole('button', { name: 'Charger les détails' }));
    expect(await screen.findByText('Équipe non conservée')).toBeVisible();
    expect(getRunHistoryDetails).toHaveBeenCalledTimes(2);
    const disclosure = view.container.querySelector('details')!;
    act(() => {
      disclosure.open = false;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    act(() => {
      disclosure.open = true;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    await waitFor(() => expect(screen.getByText('Équipe non conservée')).toBeVisible());
    expect(getRunHistoryDetails).toHaveBeenCalledTimes(2);
  });
  it('deduplicates in-flight details and ignores a response after unmount', async () => {
    let finish: (value: unknown) => void = () => {};
    const getRunHistoryDetails = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <RunHistoryItem
        entry={entry}
        repository={{ getRunHistoryDetails } as unknown as IRunRepository}
      />,
    );
    openRow();
    await waitFor(() => expect(getRunHistoryDetails).toHaveBeenCalledTimes(1));
    const disclosure = view.container.querySelector('details')!;
    act(() => {
      disclosure.open = false;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    act(() => {
      disclosure.open = true;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    expect(getRunHistoryDetails).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => finish({ data: { run, teamMembers: [] }, error: null }));
    expect(screen.queryByText('Équipe non conservée')).not.toBeInTheDocument();
  });
});

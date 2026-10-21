// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useAdministrationNavigation } from '@/features/administration/hooks/useAdministrationNavigation';

function NavigationProbe() {
  const nav = useAdministrationNavigation();
  const history = useNavigate();
  const location = useLocation();
  return (
    <>
      <output>{JSON.stringify(nav.location)}</output>
      <code>{location.search}</code>
      <button onClick={() => nav.select('runs')}>Runs</button>
      <button onClick={() => nav.select('players')}>Players</button>
      <button onClick={() => nav.selectRun('00000000-0000-4000-8000-000000000001')}>Detail</button>
      <button onClick={() => nav.selectRun(null)}>Close</button>
      <button onClick={() => history(-1)}>Back</button>
      <button onClick={() => history(1)}>Forward</button>
    </>
  );
}
describe('administration browser history', () => {
  it('restores selections and exact list filters with Back/Forward, and on a fresh deep link', () => {
    const filters = JSON.stringify({
      playerId: '00000000-0000-4000-8000-000000000002',
      sortOrder: 'asc',
    });
    const initial = `/admin?group=runs&view=list&runFilters=${encodeURIComponent(filters)}`;
    const { unmount } = render(
      <MemoryRouter initialEntries={[initial]}>
        <NavigationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Detail'));
    expect(screen.getByRole('status')).toHaveTextContent('00000000-0000-4000-8000-000000000001');
    fireEvent.click(screen.getByText('Players'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('status')).toHaveTextContent('"group":"runs"');
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('status')).toHaveTextContent('"run":null');
    fireEvent.click(screen.getByText('Forward'));
    expect(screen.getByRole('status')).toHaveTextContent('"sortOrder":"asc"');
    const deepLink = `/admin${screen.getByText((_, element) => element?.tagName === 'CODE')?.textContent}`;
    unmount();
    render(
      <MemoryRouter initialEntries={[deepLink]}>
        <NavigationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('00000000-0000-4000-8000-000000000001');
    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByRole('status')).toHaveTextContent('"sortOrder":"asc"');
    expect(screen.getByRole('status')).toHaveTextContent('"run":null');
  });
  it('replaces the old tab deep link with the canonical monitoring route', () => {
    render(
      <MemoryRouter initialEntries={['/admin?tab=logs']}>
        <NavigationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('"group":"monitoring"');
    expect(screen.getByText((_, element) => element?.tagName === 'CODE')).toHaveTextContent(
      '?group=monitoring&view=logs',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseAdministrationLocation,
  readAdministrationForm,
  serializeAdministrationLocation,
} from '@/features/administration/domain/administrationNavigation';

describe('administration URL context', () => {
  it.each([
    ['dashboard', 'overview', 'dashboard'],
    ['analytics', 'overview', 'analytics'],
    ['logs', 'monitoring', 'logs'],
    ['authority', 'monitoring', 'authority'],
  ])('migrates legacy tab=%s', (tab, group, view) => {
    const location = parseAdministrationLocation(new URLSearchParams({ tab }));
    expect(location).toMatchObject({ group, view });
    expect(serializeAdministrationLocation(location).has('tab')).toBe(false);
  });
  it('round-trips independent filters, sort, population and selected identifiers', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const location = parseAdministrationLocation(
      new URLSearchParams({
        group: 'runs',
        view: 'list',
        run: id,
        player: id,
        players: JSON.stringify({ search: 'Ashe', accountState: 'guest', pageSize: '25' }),
        runFilters: JSON.stringify({
          sortBy: 'waves_completed',
          sortOrder: 'asc',
          from: '2026-01-01T00:00',
        }),
        runOptions: JSON.stringify({ population: 'attempts', pageSize: '100' }),
      }),
    );
    expect(parseAdministrationLocation(serializeAdministrationLocation(location))).toEqual(
      location,
    );
    expect(location.contexts.runFilters?.sortOrder).toBe('asc');
    const backToList = { ...location, run: null };
    expect(
      parseAdministrationLocation(serializeAdministrationLocation(backToList)).contexts,
    ).toEqual(location.contexts);
  });
  it('drops unknown parameters, DTO fields, invalid identifiers and oversized strings', () => {
    const location = parseAdministrationLocation(
      new URLSearchParams({
        group: 'root',
        view: 'injected',
        player: 'secret',
        run: '123',
        token: 'secret',
        players: JSON.stringify({
          search: 'a'.repeat(81),
          access_token: 'secret',
          accountState: 'root',
        }),
        runOptions: JSON.stringify({ pageSize: '10000', population: 'raw' }),
        diagnostics: '{bad json',
        balance: 'x'.repeat(4097),
      }),
    );
    expect(location).toEqual({
      group: 'overview',
      view: 'dashboard',
      player: null,
      run: null,
      contexts: {},
    });
    expect(serializeAdministrationLocation(location).toString()).toBe(
      'group=overview&view=dashboard',
    );
  });
  it('uses a valid view for the requested group', () => {
    expect(parseAdministrationLocation(new URLSearchParams('group=balance&view=logs')).view).toBe(
      'reports',
    );
  });
  it('requires the existing domain validator to accept hydrated forms', () => {
    const location = parseAdministrationLocation(
      new URLSearchParams({ runFilters: JSON.stringify({ from: 'invalid', sortBy: 'run_level' }) }),
    );
    const defaults = { from: '', sortBy: 'completed_at' };
    const validate = (value: typeof defaults) => {
      if (value.from === 'invalid') throw new Error('Invalid date');
    };
    expect(readAdministrationForm(location, 'runFilters', defaults, validate)).toEqual(defaults);
  });
});

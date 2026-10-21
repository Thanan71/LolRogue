import type { Page } from '@playwright/test';
import {
  adminPlayerDetailFixture,
  adminPlayerFixture,
  adminPlayerPageFixture,
} from '../../tests/fixtures/adminPlayerExplorer';
import {
  adminRunDetailFixture,
  adminRunFixture,
  runSnapshot,
} from '../../tests/helpers/adminRunExplorerFixtures';

/** Controlled API envelopes exercise the production navigation, parsers and UI. */
export async function adminNavigationBackend(page: Page) {
  const state = {
    playerRequests: [] as Record<string, unknown>[],
    runRequests: [] as Record<string, unknown>[],
    failPlayers: false,
    holdSearch: '',
    releaseSearch: () => {},
  };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const args = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    if (name === 'admin_search_players') {
      state.playerRequests.push(args);
      if (state.failPlayers) {
        await route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'Controlled outage' },
        });
        return;
      }
      const search = String(args.p_filters?.search ?? '');
      if (state.holdSearch && search === state.holdSearch)
        await new Promise<void>((resolve) => {
          state.releaseSearch = resolve;
        });
      const start = Number(args.p_cursor?.after ?? 0) + 1;
      const fixture = search
        ? {
            ...adminPlayerPageFixture(1, 1, 1),
            items: [{ ...adminPlayerFixture(1), displayName: search }],
          }
        : adminPlayerPageFixture(start, Number(args.p_page_size ?? 50));
      // A superseded request can be aborted before this delayed response is released.
      await route.fulfill({ json: fixture }).catch(() => {});
      return;
    }
    if (name === 'admin_get_player_detail') {
      const index = Number(String(args.p_player_id).split('-').at(-1));
      await route.fulfill({ json: adminPlayerDetailFixture(index) });
      return;
    }
    if (name === 'admin_search_runs') {
      state.runRequests.push(args);
      await route.fulfill({
        json: {
          items: [adminRunFixture()],
          total: 1,
          hasMore: false,
          nextCursor: null,
          snapshotAt: runSnapshot,
        },
      });
      return;
    }
    if (name === 'admin_get_run_detail') {
      await route.fulfill({ json: adminRunDetailFixture() });
      return;
    }
    if (name === 'admin_stats') {
      await route.fulfill({
        json: [{ stat_name: 'total_players', stat_value: '123' }],
      });
      return;
    }
    if (name?.startsWith('admin_search_')) {
      await route.fulfill({
        json: {
          items: [],
          total: 0,
          hasMore: false,
          nextCursor: null,
          snapshotAt: runSnapshot,
        },
      });
      return;
    }
    await route.fulfill({
      json: [],
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': '*/0',
      },
    });
  });
  return state;
}

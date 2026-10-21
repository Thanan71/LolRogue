// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { AdminPagination } from '@/features/administration/ui/explorer/AdminPagination';
import { parseAdminExplorerPage } from '@/features/administration/domain/explorer/adminExplorerClient';

const stamp = '2026-10-17T06:00:00Z';
const empty = {
  items: [],
  total: 0,
  hasMore: false,
  nextCursor: null,
  snapshotAt: stamp,
};

describe('admin explorer page boundary', () => {
  it('preserves exact zero and an opaque cursor without rounding or local filtering', () => {
    expect(parseAdminExplorerPage(empty, String)).toEqual(empty);
    const cursor = {
      id: 'public-id',
      filterKey: 'opaque',
      value: 0,
      snapshot: stamp,
    };
    const result = parseAdminExplorerPage(
      {
        ...empty,
        items: ['É_%'],
        total: 1001,
        hasMore: true,
        nextCursor: cursor,
      },
      String,
    );
    expect(result.items).toEqual(['É_%']);
    expect(result.total).toBe(1001);
    expect(result.nextCursor).toEqual(cursor);
  });

  it.each([
    { total: null },
    { total: -1 },
    { total: 0.5 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { items: ['row'], total: 0 },
    { items: Array(101).fill('row'), total: 101 },
    { snapshotAt: '2026-10-17' },
    { snapshotAt: 'invalid' },
    { hasMore: true },
    { nextCursor: {} },
    { nextCursor: { nested: { secret: 'payload' } } },
    { nextCursor: { values: ['x'] } },
    { nextCursor: { invalid: Infinity } },
    { nextCursor: { value: 'x'.repeat(4097) } },
    { items: ['row'], total: 1, hasMore: true, nextCursor: { id: 'last' } },
  ])('rejects malformed metadata rather than reporting an empty success: %j', (overrides) => {
    expect(() => parseAdminExplorerPage({ ...empty, ...overrides }, String)).toThrow();
  });

  it('propagates a row projection failure', () => {
    expect(() =>
      parseAdminExplorerPage({ ...empty, items: ['unsafe'], total: 1 }, () => {
        throw new Error('row projection failed');
      }),
    ).toThrow('row projection failed');
  });
});

describe('accessible server pagination', () => {
  it('reports unavailable totals, keeps zero meaningful, and blocks navigation during loading', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onPageSizeChange = vi.fn();
    const props = {
      pageIndex: 1,
      pageSize: 50,
      displayed: 0,
      total: null,
      hasMore: false,
      busy: true,
      onPrevious,
      onNext,
      onPageSizeChange,
    };
    const { rerender } = render(<AdminPagination {...props} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(fr.admin.unavailable);
    expect(screen.getByRole('button', { name: fr.admin.explorerPagination.next })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: fr.admin.explorerPagination.previous,
      }),
    ).toBeDisabled();
    rerender(<AdminPagination {...props} total={0} busy={false} />);
    expect(screen.getByRole('status')).not.toHaveTextContent(fr.admin.unavailable);
    rerender(
      <AdminPagination {...props} pageIndex={2} total={1001} displayed={50} busy={false} hasMore />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: fr.admin.explorerPagination.previous,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: fr.admin.explorerPagination.next }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '100' },
    });
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
    expect(screen.getByRole('status')).toHaveTextContent('1 001');
  });
});

import { fr } from '@/i18n/fr';
import { formatAdminNumber } from '../../domain/adminFormatting';

export interface AdminPaginationProps {
  pageIndex: number;
  pageSize: number;
  displayed: number;
  total: number | null;
  hasMore: boolean;
  busy: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange?: (size: number) => void;
}

export function AdminPagination({
  pageIndex,
  pageSize,
  displayed,
  total,
  hasMore,
  busy,
  onPrevious,
  onNext,
  onPageSizeChange,
}: AdminPaginationProps) {
  const copy = fr.admin.explorerPagination;
  return (
    <nav className="admin-explorer-pagination" aria-label={copy.label} aria-busy={busy}>
      <p role="status">
        {copy.page} {formatAdminNumber(pageIndex)} · {copy.displayed}{' '}
        {total === null ? fr.admin.unavailable : formatAdminNumber(displayed)} · {copy.total}{' '}
        {total === null ? fr.admin.unavailable : formatAdminNumber(total)}
      </p>
      <div className="admin-explorer-pagination-actions">
        <button type="button" onClick={onPrevious} disabled={busy || pageIndex <= 1}>
          {copy.previous}
        </button>
        <button type="button" onClick={onNext} disabled={busy || !hasMore}>
          {copy.next}
        </button>
        {onPageSizeChange && (
          <label>
            {copy.pageSize}
            <select
              value={pageSize}
              disabled={busy}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="admin-explorer-note">{copy.snapshotNote}</p>
    </nav>
  );
}

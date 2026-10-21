import { type ReactNode, useId, useState } from 'react';
import { getAdminAccessibilityCopy } from '@/i18n/adminAccessibility';
import { locale } from '@/i18n/fr';
import './administration.css';

/** Mobile keeps the identifying columns and the detail action; every column remains available. */
export function AdminResponsiveTable({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className: string;
}) {
  const id = useId();
  const [allColumns, setAllColumns] = useState(false);
  const copy = getAdminAccessibilityCopy(locale);
  return (
    <div className="admin-responsive-table" data-columns={allColumns ? 'all' : 'essential'}>
      <div className="admin-responsive-table__options">
        <label>
          <input
            type="checkbox"
            checked={allColumns}
            onChange={(event) => setAllColumns(event.target.checked)}
            aria-controls={id}
            aria-describedby={`${id}-hint`}
          />
          {copy.allColumns}
        </label>
        <p id={`${id}-hint`}>{copy.essentialColumns}</p>
      </div>
      <div id={id} className={className} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}

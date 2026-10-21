import type { KeyboardEvent } from 'react';
import { getAdministrationCopy } from '@/i18n/administration';
import { locale } from '@/i18n/fr';
import {
  ADMINISTRATION_GROUPS,
  ADMINISTRATION_VIEWS,
  type AdministrationGroup,
  type AdministrationView,
} from '../domain/administrationNavigation';

function moveTab(
  event: KeyboardEvent<HTMLDivElement>,
  ids: readonly string[],
  selected: string,
  select: (id: string) => void,
  prefix: string,
) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = ids.indexOf(selected);
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? ids.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
  const id = ids[index];
  if (!id) return;
  select(id);
  const target =
    prefix === 'admin-group-' && ADMINISTRATION_VIEWS[id as AdministrationGroup].length === 1
      ? `admin-tab-${id}`
      : prefix === 'admin-tab-' && id === 'reports'
        ? 'admin-tab-balance'
        : `${prefix}${id}`;
  window.requestAnimationFrame(() => document.getElementById(target)?.focus());
}
export function AdminTabList({
  group,
  onSelect,
}: {
  group: AdministrationGroup;
  onSelect: (group: AdministrationGroup) => void;
}) {
  const copy = getAdministrationCopy(locale);
  return (
    <div
      className="admin-nav"
      role="tablist"
      aria-label={copy.navigation}
      onKeyDown={(event) =>
        moveTab(
          event,
          ADMINISTRATION_GROUPS,
          group,
          (id) => onSelect(id as AdministrationGroup),
          'admin-group-',
        )
      }
    >
      {ADMINISTRATION_GROUPS.map((id) => (
        <button
          type="button"
          role="tab"
          key={id}
          id={ADMINISTRATION_VIEWS[id].length === 1 ? `admin-tab-${id}` : `admin-group-${id}`}
          aria-selected={group === id}
          aria-controls={
            ADMINISTRATION_VIEWS[id].length === 1 ? `admin-panel-${id}` : `admin-group-panel-${id}`
          }
          tabIndex={group === id ? 0 : -1}
          className={group === id ? 'active' : ''}
          onClick={() => onSelect(id)}
        >
          {copy.groups[id]}
        </button>
      ))}
    </div>
  );
}
export function AdministrationSubTabs({
  group,
  view,
  onSelect,
}: {
  group: AdministrationGroup;
  view: AdministrationView;
  onSelect: (view: AdministrationView) => void;
}) {
  const copy = getAdministrationCopy(locale);
  const views = ADMINISTRATION_VIEWS[group];
  if (views.length < 2) return null;
  return (
    <div
      className="admin-subnav"
      role="tablist"
      aria-label={`${copy.groups[group]} — ${copy.subsections}`}
      onKeyDown={(event) =>
        moveTab(event, views, view, (id) => onSelect(id as AdministrationView), 'admin-tab-')
      }
    >
      {views.map((id) => (
        <button
          type="button"
          role="tab"
          key={id}
          id={`admin-tab-${id === 'reports' ? 'balance' : id}`}
          aria-selected={view === id}
          aria-controls={`admin-panel-${id === 'reports' ? 'balance' : id}`}
          tabIndex={view === id ? 0 : -1}
          className={view === id ? 'active' : ''}
          onClick={() => onSelect(id)}
        >
          {copy.views[id]}
        </button>
      ))}
    </div>
  );
}

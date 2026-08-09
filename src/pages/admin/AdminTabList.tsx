import type { KeyboardEvent } from 'react';
import { fr } from '@/i18n/fr';
import type { AdminTab } from './useAdminData';

const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'dashboard', label: `📊 ${fr.admin.dashboard}` },
  { id: 'authority', label: '🛰️ Authority' },
  { id: 'logs', label: `📋 ${fr.admin.logs}` },
  { id: 'players', label: `👥 ${fr.admin.players}` },
  { id: 'runs', label: `🎮 ${fr.admin.runs}` },
  { id: 'moderation', label: '⚖️ Modération' },
];

export function AdminTabList({
  activeTab,
  onSelect,
}: {
  activeTab: AdminTab;
  onSelect: (tab: AdminTab) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = ADMIN_TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ADMIN_TABS.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + ADMIN_TABS.length) %
            ADMIN_TABS.length;
    const nextTab = ADMIN_TABS[nextIndex];
    if (!nextTab) return;
    onSelect(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`admin-tab-${nextTab.id}`)?.focus());
  };

  return (
    <div className="admin-nav" role="tablist" aria-label="Sections Admin" onKeyDown={handleKeyDown}>
      {ADMIN_TABS.map((tab) => (
        <button
          type="button"
          role="tab"
          id={`admin-tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`admin-panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => onSelect(tab.id)}
          key={tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

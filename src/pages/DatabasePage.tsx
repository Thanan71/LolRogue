import { useCallback, useEffect, useMemo, useState } from 'react';
import { EnhancementTree } from '@/components/EnhancementTree';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatChampionTag, plural } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEnhancements, useEnhancementStore } from '@/stores/enhancementStore';
import type { Champion } from '@/types/champion';
import '@/styles/database.css';
import { DatabaseChampionDetail } from './database/DatabaseChampionDetail';

export function DatabasePage() {
  const navigate = useAppNavigate();
  const [search, setSearch] = useState('');
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'enhancements'>('info');

  // Enhancement store
  const { player } = useAuthStore();
  const setAvailableCandies = useEnhancementStore((s) => s.setAvailableCandies);
  const {
    state: enhancementState,
    availableCandies,
    masteryLevel,
    isLoading: isEnhancementLoading,
    error: enhancementError,
    statusMessage: enhancementStatus,
    unlockNode,
  } = useChampionEnhancements(selectedChampion);

  // Sync candies from auth store
  useEffect(() => {
    if (player?.total_candies !== undefined) {
      setAvailableCandies(player.total_candies);
    }
  }, [player?.total_candies, setAvailableCandies]);

  const allChampions = useMemo(() => championDB.getAll(), []);

  const filteredChampions = useMemo(() => {
    if (!search.trim()) return allChampions;
    const q = search.toLowerCase();
    return allChampions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [allChampions, search]);

  const handleUnlockNode = useCallback(
    async (nodeId: string) => {
      const success = await unlockNode(nodeId);
      if (!success) {
        console.error('Failed to unlock node');
      }
    },
    [unlockNode],
  );

  return (
    <main className="database-page">
      <header className="database-header">
        <button className="database-back-btn" onClick={() => navigate(ROUTES.MENU)}>
          {fr.common.backToMenu}
        </button>
        <h1 className="database-title">{fr.database.title}</h1>
        <span className="database-count">{plural(allChampions.length, 'champion')}</span>
      </header>

      <div className="database-body">
        <aside className="database-sidebar">
          <label className="sr-only" htmlFor="champion-search">
            {fr.database.search}
          </label>
          <input
            id="champion-search"
            type="search"
            placeholder={fr.database.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="database-search"
          />
          <ul className="database-list">
            {filteredChampions.map((champ) => (
              <li key={champ.id}>
                <button
                  type="button"
                  aria-pressed={selectedChampion?.id === champ.id}
                  className={`database-list-item${selectedChampion?.id === champ.id ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedChampion(champ);
                    setActiveTab('info');
                  }}
                >
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="database-list-item-info">
                    <div className="database-list-item-name">{champ.name}</div>
                    <div className="database-list-item-tags">
                      {champ.tags.map(formatChampionTag).join(', ')}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="database-detail">
          {selectedChampion ? (
            <>
              <div
                className="database-tabs"
                role="tablist"
                aria-label={fr.database.title}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                  event.preventDefault();
                  const nextTab = activeTab === 'info' ? 'enhancements' : 'info';
                  setActiveTab(nextTab);
                  window.requestAnimationFrame(() =>
                    document.getElementById(`database-tab-${nextTab}`)?.focus(),
                  );
                }}
              >
                <button
                  type="button"
                  role="tab"
                  id="database-tab-info"
                  aria-selected={activeTab === 'info'}
                  aria-controls="database-panel-info"
                  className={`database-tab${activeTab === 'info' ? ' active' : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  📖 {fr.database.info}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="database-tab-enhancements"
                  aria-selected={activeTab === 'enhancements'}
                  aria-controls="database-panel-enhancements"
                  className={`database-tab${activeTab === 'enhancements' ? ' active' : ''}`}
                  onClick={() => setActiveTab('enhancements')}
                >
                  🌟 {fr.database.enhancements}
                </button>
              </div>

              {activeTab === 'info' ? (
                <div role="tabpanel" id="database-panel-info" aria-labelledby="database-tab-info">
                  <DatabaseChampionDetail champion={selectedChampion} />
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id="database-panel-enhancements"
                  aria-labelledby="database-tab-enhancements"
                >
                  {enhancementError && (
                    <p role="alert" className="database-mutation database-mutation--error">
                      {enhancementError}
                    </p>
                  )}
                  {enhancementStatus && (
                    <p role="status" className="database-mutation database-mutation--success">
                      {enhancementStatus}
                    </p>
                  )}
                  <EnhancementTree
                    champion={selectedChampion}
                    playerCandies={availableCandies}
                    masteryLevel={masteryLevel}
                    enhancementState={
                      enhancementState || { unlockedNodes: {}, totalCandiesSpent: 0 }
                    }
                    onUnlockNode={handleUnlockNode}
                    isLoading={isEnhancementLoading}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="database-placeholder">
              <p>{fr.database.select}</p>
              <p className="database-placeholder__help">{fr.database.selectHelp}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

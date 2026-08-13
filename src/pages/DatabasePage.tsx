import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EnhancementTree } from '@/components/EnhancementTree';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatChampionTag, plural } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEnhancements, useEnhancementStore } from '@/stores/enhancementStore';
import type { Champion } from '@/types/champion';
import { logger } from '@/utils/logger';
import '@/styles/database.css';
import { DatabaseChampionDetail } from './database/DatabaseChampionDetail';

export function DatabasePage() {
  const navigate = useAppNavigate();
  const [search, setSearch] = useState('');
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'enhancements'>('info');
  const sidebarRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const shouldRevealSelectionRef = useRef(false);

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
        logger.error('Failed to unlock node');
      }
    },
    [unlockNode],
  );

  const handleChampionSelect = useCallback((champion: Champion) => {
    shouldRevealSelectionRef.current = true;
    setSelectedChampion(champion);
    setActiveTab('info');
  }, []);

  useEffect(() => {
    if (!selectedChampion || !shouldRevealSelectionRef.current) return;
    shouldRevealSelectionRef.current = false;
    if (!window.matchMedia('(max-width: 48rem)').matches) return;

    const frame = window.requestAnimationFrame(() => {
      const detail = detailRef.current;
      if (!detail) return;
      detail.focus({ preventScroll: true });
      detail.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedChampion]);

  const handleReturnToChampionList = useCallback(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    sidebar.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    window.requestAnimationFrame(() => {
      const selectedButton = selectedChampion
        ? document.getElementById(`database-champion-${selectedChampion.id}`)
        : null;
      (selectedButton ?? document.getElementById('champion-search'))?.focus({
        preventScroll: true,
      });
    });
  }, [selectedChampion]);

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
        <aside ref={sidebarRef} className="database-sidebar">
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
                  id={`database-champion-${champ.id}`}
                  aria-controls="database-champion-detail"
                  aria-pressed={selectedChampion?.id === champ.id}
                  className={`database-list-item${selectedChampion?.id === champ.id ? ' selected' : ''}`}
                  onClick={() => handleChampionSelect(champ)}
                >
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    width={120}
                    height={120}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
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
            {filteredChampions.length === 0 && (
              <li className="database-empty" role="status">
                <strong>Aucun champion trouvé</strong>
                <span>Essaie un autre nom, titre ou rôle.</span>
                <button type="button" onClick={() => setSearch('')}>
                  Effacer la recherche
                </button>
              </li>
            )}
          </ul>
        </aside>

        <section
          ref={detailRef}
          id="database-champion-detail"
          className="database-detail"
          aria-label={selectedChampion ? `Fiche de ${selectedChampion.name}` : fr.database.select}
          tabIndex={selectedChampion ? -1 : undefined}
        >
          {selectedChampion ? (
            <>
              <div className="database-detail-mobile-nav">
                <button type="button" onClick={handleReturnToChampionList}>
                  <span aria-hidden="true">←</span> Retour à la liste
                </button>
                <strong>{selectedChampion.name}</strong>
              </div>
              <div
                className="database-tabs"
                role="tablist"
                aria-label={fr.database.title}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const nextTab =
                    event.key === 'Home'
                      ? 'info'
                      : event.key === 'End'
                        ? 'enhancements'
                        : activeTab === 'info'
                          ? 'enhancements'
                          : 'info';
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
                  tabIndex={activeTab === 'info' ? 0 : -1}
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
                  tabIndex={activeTab === 'enhancements' ? 0 : -1}
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
        </section>
      </div>
    </main>
  );
}

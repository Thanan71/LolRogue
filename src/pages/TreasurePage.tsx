import { useCallback, useEffect, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/treasure.css';

type TreasureItemDisposition = 'added' | 'left_full' | 'already_resolved' | 'none';

export function TreasurePage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const addGold = useRunStore((s) => s.addGold);
  const addItem = useRunStore((s) => s.addItem);
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );

  const [collected, setCollected] = useState(wasClaimed);
  const [itemDisposition, setItemDisposition] = useState<TreasureItemDisposition>(
    wasClaimed ? 'already_resolved' : 'none',
  );

  const encounter = useMemo(() => {
    return getNodeEncounter(getCurrentNode(), 'treasure');
  }, [getCurrentNode]);

  const handleCollect = useCallback(() => {
    if (!encounter || collected) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) return;

    // Award gold
    if (encounter.gold > 0) {
      addGold(encounter.gold, {
        source: 'treasure',
        nodeId: previous.currentNodeId,
        wave: previous.currentWave,
      });
    }

    // Award item if present
    let nextItemDisposition: TreasureItemDisposition = 'none';
    if (encounter.item) {
      const result = addItem(
        {
          id: encounter.item.itemId,
          name: encounter.item.name,
          description: encounter.item.description,
          iconUrl: encounter.item.iconUrl,
          stats: encounter.item.stats,
          passiveId: encounter.item.passiveId,
          goldValue: encounter.item.price,
        },
        {
          source: 'treasure',
          nodeId: previous.currentNodeId,
          wave: previous.currentWave,
        },
      );
      nextItemDisposition = result.success ? 'added' : 'left_full';
    }

    if (
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'treasure', nodeId: previous.currentNodeId },
          `treasure:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        gold: previous.gold,
        inventory: previous.inventory,
        ledger: previous.ledger,
        nextItemInstanceId: previous.nextItemInstanceId,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      return;
    }
    setItemDisposition(nextItemDisposition);
    setCollected(true);
  }, [encounter, collected, addGold, addItem]);

  const handleContinue = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  // Collection remains automatic: persistence and recovery tests rely on the
  // encounter being claimed exactly once as soon as its payload is available.
  useEffect(() => {
    if (encounter && !collected) {
      handleCollect();
    }
  }, [encounter, collected, handleCollect]);

  if (!isActive) return null;

  return (
    <EncounterLayout
      title={`💎 ${fr.encounter.treasure}`}
      gold={gold}
      contentClassName="encounter-layout__content--centered"
    >
      <div className="treasure-page">
        <div className="treasure-page__chest" aria-hidden="true">
          <span className="treasure-page__chest-symbol">{collected ? '✦' : '◇'}</span>
        </div>

        {!collected ? (
          <>
            <div className="treasure-page__title">
              {encounter?.name ?? fr.encounter.treasureFound}
            </div>
            <div className="treasure-page__description">
              {encounter?.description ?? fr.encounter.treasureAwaits}
            </div>
            <div className="treasure-page__preview">
              <div className="treasure-page__preview-item">
                <span className="treasure-page__preview-icon">💰</span>
                <span className="treasure-page__preview-gold">
                  +{encounter?.gold ?? 0} {fr.common.gold}
                </span>
              </div>
              {encounter?.item && (
                <div className="treasure-page__preview-item">
                  <span className="treasure-page__preview-icon">📦</span>
                  <span className="treasure-page__preview-loot">{encounter.item.name}</span>
                </div>
              )}
            </div>
            <button
              className="treasure-page__button treasure-page__button--collect"
              onClick={handleCollect}
            >
              {fr.encounter.collect}
            </button>
          </>
        ) : (
          <>
            <div className="treasure-page__title treasure-page__title--success">
              {fr.encounter.collected}
            </div>

            <div className="treasure-page__rewards">
              <div className="treasure-page__reward">
                <div className="treasure-page__reward-label">{fr.encounter.treasureGold}</div>
                <div className="treasure-page__reward-value">
                  <span className="treasure-page__reward-gold">+{encounter?.gold ?? 0}</span>
                  <span className="treasure-page__reward-total"> (Total : {gold})</span>
                </div>
              </div>

              {encounter?.item && itemDisposition === 'added' && (
                <div className="treasure-page__reward">
                  <div className="treasure-page__reward-label">{fr.encounter.itemReceived}</div>
                  <div className="treasure-page__item-detail">
                    <div className="treasure-page__item-name">{encounter.item.name}</div>
                    <div className="treasure-page__item-description">
                      {encounter.item.description}
                    </div>
                    {Object.keys(encounter.item.stats).length > 0 && (
                      <div className="treasure-page__item-stats">
                        {Object.entries(encounter.item.stats).map(([stat, value]) => (
                          <span key={stat} className="treasure-page__item-stat">
                            +{value} {stat.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {encounter?.item && itemDisposition === 'left_full' && (
                <div className="treasure-page__reward">
                  <div className="treasure-page__reward-label">{fr.encounter.itemLeft}</div>
                  <div className="treasure-page__inventory-warning">
                    {fr.encounter.inventoryFull} ({encounter.item.name})
                  </div>
                </div>
              )}
              {itemDisposition === 'already_resolved' && (
                <div className="treasure-page__already-resolved">
                  {fr.encounter.alreadyResolved}
                </div>
              )}
            </div>

            <button
              className="treasure-page__button treasure-page__button--continue"
              onClick={handleContinue}
            >
              {fr.common.continue}
            </button>
          </>
        )}
      </div>
    </EncounterLayout>
  );
}

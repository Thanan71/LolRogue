import { useCallback, useEffect, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { itemDescription, itemName } from '@/i18n/content';
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
          name: itemName(encounter.item.itemId, encounter.item.name),
          description: itemDescription(encounter.item.itemId, encounter.item.description),
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
      subtitle={fr.encounter.treasureSubtitle}
      contentClassName="encounter-layout__content--centered"
    >
      <div className="treasure-page">
        <div
          className={`treasure-page__chest${collected ? ' treasure-page__chest--opened' : ''}`}
          aria-hidden="true"
        >
          <span className="treasure-page__chest-glow" />
          <span className="treasure-page__chest-symbol">{collected ? '✦' : '◇'}</span>
        </div>

        {!collected ? (
          <div className="treasure-page__state">
            <h2 className="treasure-page__title">
              {encounter?.name ?? fr.encounter.treasureFound}
            </h2>
            <p className="treasure-page__description">
              {encounter?.description ?? fr.encounter.treasureAwaits}
            </p>
            <div className="treasure-page__preview">
              <div className="treasure-page__preview-item">
                <span className="treasure-page__preview-icon" aria-hidden="true">
                  <span className="treasure-page__coin" />
                </span>
                <span className="treasure-page__preview-gold">
                  +{encounter?.gold ?? 0} {fr.common.gold}
                </span>
              </div>
              {encounter?.item && (
                <div className="treasure-page__preview-item">
                  <span className="treasure-page__item-icon" aria-hidden="true">
                    {encounter.item.iconUrl ? (
                      <img
                        src={encounter.item.iconUrl}
                        alt=""
                        width={56}
                        height={56}
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                  </span>
                  <span className="treasure-page__preview-loot">
                    {itemName(encounter.item.itemId, encounter.item.name)}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="treasure-page__button treasure-page__button--collect"
              onClick={handleCollect}
            >
              {fr.encounter.collect}
            </button>
          </div>
        ) : (
          <div
            className="treasure-page__state treasure-page__state--revealed"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <h2 className="treasure-page__title treasure-page__title--success">
              {fr.encounter.collected}
            </h2>

            <div className="treasure-page__rewards">
              <article className="treasure-page__reward treasure-page__reward--gold">
                <h3 className="treasure-page__reward-label">{fr.encounter.treasureGold}</h3>
                <div className="treasure-page__reward-value">
                  <span className="treasure-page__coin" aria-hidden="true" />
                  <span className="treasure-page__reward-gold">+{encounter?.gold ?? 0}</span>
                  <span className="treasure-page__reward-total"> (Total : {gold})</span>
                </div>
              </article>

              {encounter?.item && itemDisposition === 'added' && (
                <article className="treasure-page__reward treasure-page__reward--item">
                  <h3 className="treasure-page__reward-label">{fr.encounter.itemReceived}</h3>
                  <div className="treasure-page__item-detail">
                    <span className="treasure-page__item-icon" aria-hidden="true">
                      {encounter.item.iconUrl ? (
                        <img
                          src={encounter.item.iconUrl}
                          alt=""
                          width={64}
                          height={64}
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      ) : null}
                    </span>
                    <div className="treasure-page__item-copy">
                      <strong className="treasure-page__item-name">
                        {itemName(encounter.item.itemId, encounter.item.name)}
                      </strong>
                      <p className="treasure-page__item-description">
                        {itemDescription(encounter.item.itemId, encounter.item.description)}
                      </p>
                      {Object.keys(encounter.item.stats).length > 0 && (
                        <ul className="treasure-page__item-stats" aria-label="Bonus de l’objet">
                          {Object.entries(encounter.item.stats).map(([stat, value]) => (
                            <li key={stat} className="treasure-page__item-stat">
                              +{value} {stat.toUpperCase()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </article>
              )}
              {encounter?.item && itemDisposition === 'left_full' && (
                <article className="treasure-page__reward treasure-page__reward--warning">
                  <h3 className="treasure-page__reward-label">{fr.encounter.itemLeft}</h3>
                  <p className="treasure-page__inventory-warning">
                    {fr.encounter.inventoryFull} (
                    {itemName(encounter.item.itemId, encounter.item.name)})
                  </p>
                </article>
              )}
              {itemDisposition === 'already_resolved' && (
                <p className="treasure-page__already-resolved">{fr.encounter.alreadyResolved}</p>
              )}
            </div>

            <button
              type="button"
              className="treasure-page__button treasure-page__button--continue"
              onClick={handleContinue}
            >
              {fr.common.continue}
            </button>
          </div>
        )}
      </div>
    </EncounterLayout>
  );
}

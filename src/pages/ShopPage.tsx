import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import type { ShopItem } from '@/game/map/types';
import { createRunAugmentManager } from '@/game/run/runCombatant';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import { MAX_INVENTORY_ITEMS } from '@/types/run';
import '@/styles/shop.css';

// ─── Helper Components ─────────────────────────────────────────────────────

function ShopItemCard({
  item,
  priceMultiplier,
  canAfford,
  disabledReason,
  onBuy,
}: {
  item: ShopItem;
  priceMultiplier: number;
  canAfford: boolean;
  disabledReason?: string;
  onBuy: () => void;
}) {
  const finalPrice = Math.round(item.price * priceMultiplier);
  const stats = Object.entries(item.stats).filter((entry): entry is [string, number] =>
    Boolean(entry[1]),
  );
  return (
    <article className="shop-card shop-card--item">
      <div className="shop-card__item-heading">
        <span className="shop-card__item-icon" aria-hidden="true">
          {item.iconUrl ? (
            <img
              src={item.iconUrl}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
        </span>
        <div>
          <h3 className="shop-card__name">{item.name}</h3>
          <span className="shop-card__price">
            {finalPrice} {fr.common.gold}
          </span>
        </div>
      </div>
      <p className="shop-card__description">{item.description}</p>
      {stats.length > 0 ? (
        <ul className="shop-card__stats" aria-label="Bonus de l’objet">
          {stats.map(([stat, value]) => (
            <li key={stat}>
              {stat.toUpperCase()} +{value}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="shop-card__buy" onClick={onBuy} disabled={!canAfford}>
        {canAfford ? `${fr.encounter.buy} — ${finalPrice} ${fr.common.gold}` : disabledReason}
      </button>
    </article>
  );
}

function ChampionCard({
  champId,
  cost,
  canAfford,
  teamFull,
  alreadyOnTeam,
  onRecruit,
}: {
  champId: string;
  cost: number;
  canAfford: boolean;
  teamFull: boolean;
  alreadyOnTeam: boolean;
  onRecruit: () => void;
}) {
  const champ = championDB.getById(champId);
  const disabled = !canAfford || teamFull || alreadyOnTeam;
  let label = `${fr.encounter.recruitAction} — ${cost} ${fr.common.gold}`;
  if (alreadyOnTeam) label = fr.encounter.alreadyOnTeam;
  else if (teamFull) label = fr.encounter.teamFull;
  else if (!canAfford) label = fr.encounter.notEnoughGold;
  return (
    <article className="shop-card shop-card--champion">
      <div className="shop-card__champion-summary">
        <span className="shop-card__portrait-frame" aria-hidden="true">
          <img
            src={champ?.iconUrl ?? ''}
            alt=""
            width={64}
            height={64}
            decoding="async"
            className="shop-card__portrait"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        </span>
        <div>
          <h3 className="shop-card__name">{champ?.name ?? champId}</h3>
          <p className="shop-card__subtitle">{champ?.title ?? 'Champion'}</p>
        </div>
      </div>
      <button
        type="button"
        className="shop-card__buy shop-card__buy--recruit"
        onClick={onRecruit}
        disabled={disabled}
      >
        {label}
      </button>
    </article>
  );
}

// ─── Shop Page ─────────────────────────────────────────────────────────────

export function ShopPage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const team = useRunStore((s) => s.team);
  const inventorySize = useRunStore((s) => s.inventory.length);
  const augmentIds = useRunStore((s) => s.augmentIds);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const purchaseCurrentShopItem = useRunStore((s) => s.purchaseCurrentShopItem);
  const purchaseCurrentShopChampion = useRunStore((s) => s.purchaseCurrentShopChampion);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const shopNodeState = useRunStore((s) =>
    currentNodeId ? s.shopNodeStates[currentNodeId] : undefined,
  );

  const purchased = useMemo(
    () => new Set(shopNodeState?.purchasedItemIds ?? []),
    [shopNodeState?.purchasedItemIds],
  );
  const recruited = useMemo(
    () => new Set(shopNodeState?.recruitedChampionIds ?? []),
    [shopNodeState?.recruitedChampionIds],
  );

  const encounter = useMemo(() => {
    return getNodeEncounter(getCurrentNode(), 'shop');
  }, [getCurrentNode]);

  const priceMultiplier = useMemo(() => {
    const manager = createRunAugmentManager(augmentIds, currentBiomeIndex);
    return (encounter?.priceMultiplier ?? 1) * (1 - manager.getShopDiscountPercent());
  }, [augmentIds, currentBiomeIndex, encounter?.priceMultiplier]);
  const items = encounter?.items ?? [];
  const recruitable = encounter?.recruitableChampions ?? [];

  const handleBuyItem = useCallback(
    (item: ShopItem) => {
      const result = purchaseCurrentShopItem(item.itemId);
      if (result.success) {
        setCommandError(null);
        setCommandStatus(`${item.name} a été ajouté à l’inventaire.`);
        playUIClick();
      } else {
        setCommandStatus(null);
        setCommandError(result.error || fr.encounter.commandFailed);
      }
    },
    [purchaseCurrentShopItem],
  );

  const handleRecruit = useCallback(
    (champId: string) => {
      const result = purchaseCurrentShopChampion(champId);
      if (result.success) {
        setCommandError(null);
        setCommandStatus(`${championDB.getById(champId)?.name ?? champId} a rejoint votre équipe.`);
        playUIClick();
      } else {
        setCommandStatus(null);
        setCommandError(result.error || fr.encounter.commandFailed);
      }
    },
    [purchaseCurrentShopChampion],
  );

  const handleLeave = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  if (!isActive) return null;

  return (
    <EncounterLayout
      title={`${fr.encounter.shop} — ${encounter?.name ?? fr.encounter.shop}`}
      gold={gold}
      subtitle="Équipez votre escouade avant de reprendre la route. Les achats sont définitifs."
    >
      <div className="shop-content">
        {commandError && (
          <div role="alert" className="shop-banner shop-banner--error">
            {commandError}
            <button
              type="button"
              className="shop-banner__close"
              onClick={() => setCommandError(null)}
            >
              {fr.common.close}
            </button>
          </div>
        )}
        {commandStatus ? (
          <p role="status" aria-live="polite" className="shop-banner shop-banner--success">
            <span aria-hidden="true">✓</span> {commandStatus}
          </p>
        ) : null}
        {encounter && priceMultiplier < 1 && (
          <div className="shop-banner">{fr.encounter.discount}</div>
        )}
        <div className="shop-overview" aria-label="État de la boutique">
          <span>
            <strong>{items.length - purchased.size}</strong> objets disponibles
          </span>
          <span>
            Inventaire <strong>{inventorySize}</strong>/{MAX_INVENTORY_ITEMS}
          </span>
          <span>
            Équipe <strong>{team.length}</strong>/5
          </span>
        </div>
        <section className="shop-section" aria-labelledby="shop-items-title">
          <h2 id="shop-items-title" className="shop-section__title">
            {fr.encounter.items}
          </h2>
          <div className="shop-grid">
            {items.map((item) => {
              const finalPrice = Math.round(item.price * priceMultiplier);
              const disabledReason = purchased.has(item.itemId)
                ? fr.encounter.alreadyPurchased
                : inventorySize >= MAX_INVENTORY_ITEMS
                  ? fr.encounter.shopInventoryFull
                  : gold < finalPrice
                    ? fr.encounter.notEnoughGold
                    : undefined;
              return (
                <ShopItemCard
                  key={item.itemId}
                  item={item}
                  priceMultiplier={priceMultiplier}
                  canAfford={!disabledReason}
                  disabledReason={disabledReason}
                  onBuy={() => handleBuyItem(item)}
                />
              );
            })}
            {items.length === 0 && <div className="shop-empty">{fr.encounter.noItems}</div>}
          </div>
        </section>
        {recruitable.length > 0 && (
          <section className="shop-section" aria-labelledby="shop-recruits-title">
            <h2 id="shop-recruits-title" className="shop-section__title">
              {fr.encounter.recruits}
            </h2>
            <div className="shop-grid">
              {recruitable.map((rc) => (
                <ChampionCard
                  key={rc.championId}
                  champId={rc.championId}
                  cost={Math.round(rc.cost * priceMultiplier)}
                  canAfford={gold >= Math.round(rc.cost * priceMultiplier)}
                  teamFull={team.length >= 5}
                  alreadyOnTeam={
                    team.some((m) => m.championId === rc.championId) || recruited.has(rc.championId)
                  }
                  onRecruit={() => handleRecruit(rc.championId)}
                />
              ))}
            </div>
          </section>
        )}
        <div className="shop-actions">
          <button type="button" className="shop-actions__leave" onClick={handleLeave}>
            {fr.encounter.leaveShop}
          </button>
        </div>
      </div>
    </EncounterLayout>
  );
}

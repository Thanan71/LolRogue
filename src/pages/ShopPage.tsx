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
  const statsText = Object.entries(item.stats)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.toUpperCase()} +${v}`)
    .join(', ');
  return (
    <div className="shop-card shop-card--item">
      <div className="shop-card__name">{item.name}</div>
      <div className="shop-card__description">{item.description}</div>
      {statsText && <div className="shop-card__stats">{statsText}</div>}
      <button className="shop-card__buy" onClick={onBuy} disabled={!canAfford}>
        {canAfford ? `${fr.encounter.buy} — ${finalPrice} ${fr.common.gold}` : disabledReason}
      </button>
    </div>
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
    <div className="shop-card shop-card--champion">
      <div className="shop-card__champion-summary">
        <img
          src={champ?.iconUrl ?? ''}
          alt={champ?.name ?? champId}
          width={36}
          height={36}
          decoding="async"
          className="shop-card__portrait"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
        <div>
          <div className="shop-card__name">{champ?.name ?? champId}</div>
          <div className="shop-card__subtitle">{champ?.title ?? 'Champion'}</div>
        </div>
      </div>
      <button
        className="shop-card__buy shop-card__buy--recruit"
        onClick={onRecruit}
        disabled={disabled}
      >
        {label}
      </button>
    </div>
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
        playUIClick();
      } else setCommandError(result.error || fr.encounter.commandFailed);
    },
    [purchaseCurrentShopItem],
  );

  const handleRecruit = useCallback(
    (champId: string) => {
      const result = purchaseCurrentShopChampion(champId);
      if (result.success) {
        setCommandError(null);
        playUIClick();
      } else setCommandError(result.error || fr.encounter.commandFailed);
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
        {encounter && priceMultiplier < 1 && (
          <div className="shop-banner">{fr.encounter.discount}</div>
        )}
        <div className="shop-section">
          <div className="shop-section__title">{fr.encounter.items}</div>
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
        </div>
        {recruitable.length > 0 && (
          <div className="shop-section">
            <div className="shop-section__title">{fr.encounter.recruits}</div>
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
          </div>
        )}
        <div className="shop-actions">
          <button className="shop-actions__leave" onClick={handleLeave}>
            {fr.encounter.leaveShop}
          </button>
        </div>
      </div>
    </EncounterLayout>
  );
}

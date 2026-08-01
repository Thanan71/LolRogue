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
    <div style={itemCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6, lineHeight: 1.3 }}>
        {item.description}
      </div>
      {statsText && (
        <div style={{ fontSize: 11, color: '#7dd3fc', marginBottom: 8 }}>{statsText}</div>
      )}
      <button
        style={{
          ...buyBtnStyle,
          opacity: canAfford ? 1 : 0.4,
          cursor: canAfford ? 'pointer' : 'not-allowed',
        }}
        onClick={onBuy}
        disabled={!canAfford}
      >
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
    <div style={champCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <img
          src={champ?.iconUrl ?? ''}
          alt={champ?.name ?? champId}
          width={36}
          height={36}
          decoding="async"
          style={{ width: 36, height: 36, borderRadius: 4, background: '#1e2a3a' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>
            {champ?.name ?? champId}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>{champ?.title ?? 'Champion'}</div>
        </div>
      </div>
      <button
        style={{
          ...buyBtnStyle,
          background: '#06b6d4',
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
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
      <div style={scrollAreaStyle}>
        {commandError && (
          <div role="alert" style={{ ...discountBanner, color: '#fca5a5' }}>
            {commandError}
            <button type="button" onClick={() => setCommandError(null)}>
              {fr.common.close}
            </button>
          </div>
        )}
        {encounter && priceMultiplier < 1 && (
          <div style={discountBanner}>{fr.encounter.discount}</div>
        )}
        <div style={sectionStyle}>
          <div style={sectionTitle}>{fr.encounter.items}</div>
          <div style={gridStyle}>
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
            {items.length === 0 && <div style={emptyStyle}>{fr.encounter.noItems}</div>}
          </div>
        </div>
        {recruitable.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitle}>{fr.encounter.recruits}</div>
            <div style={gridStyle}>
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
        <div style={{ textAlign: 'center', marginTop: 20, paddingBottom: 24 }}>
          <button style={leaveBtnStyle} onClick={handleLeave}>
            {fr.encounter.leaveShop}
          </button>
        </div>
      </div>
    </EncounterLayout>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const scrollAreaStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 24 };
const discountBanner: React.CSSProperties = {
  textAlign: 'center',
  padding: '8px 16px',
  marginBottom: 16,
  background: '#422006',
  border: '1px solid #facc15',
  borderRadius: 8,
  color: '#facc15',
  fontWeight: 700,
  fontSize: 14,
};
const sectionStyle: React.CSSProperties = { marginBottom: 24 };
const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#c8aa6e',
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: '1px solid #1e2a3a',
};
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
};
const itemCardStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #2d333b',
  borderRadius: 10,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
};
const champCardStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #2d333b',
  borderRadius: 10,
  padding: 16,
};
const buyBtnStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: '8px 16px',
  background: '#facc15',
  color: '#0d1117',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};
const leaveBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#21262d',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const emptyStyle: React.CSSProperties = {
  color: '#484f58',
  fontSize: 14,
  padding: 16,
  textAlign: 'center',
  gridColumn: '1 / -1',
};

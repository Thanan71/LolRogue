import { useId, useMemo, useRef, useState } from 'react';
import { championDB } from '@/data/championDatabase';
import { validateItemEquipment } from '@/game/inventory/inventoryRules';
import { getItemSaleGold } from '@/game/run/runEncounterRules';
import {
  type CanonicalStatKey,
  formatStatValue,
  normalizeStatKey,
  STAT_LABELS,
} from '@/game/stats/statContract';
import { fr } from '@/i18n/fr';
import { itemDescription, itemName, localizeChampion } from '@/i18n/content';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { InventoryEntry, TeamMember } from '@/types/run';
import { MAX_INVENTORY_ITEMS, MAX_ITEMS_PER_CHAMPION } from '@/types/run';
import type { RunEnhancementSnapshot, RunMasterySnapshot } from '@/types/runAttempt';
import { calculateFullStats } from '@/utils/statCalculator';
import '@/styles/run-inventory.css';

type InventoryFilter = 'all' | 'bag' | 'equipped';

interface RunInventoryPanelProps {
  inventory: InventoryEntry[];
  team: TeamMember[];
}

interface StatPreview {
  stat: CanonicalStatKey;
  before: number;
  after: number;
}

interface InventoryFeedback {
  kind: 'success' | 'error' | 'neutral';
  message: string;
}

const FILTERS: readonly { id: InventoryFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'bag', label: 'Sac' },
  { id: 'equipped', label: 'Équipés' },
];

const EMPTY_UNLOCKED_NODES: Record<string, number> = {};

function matchesFilter(entry: InventoryEntry, filter: InventoryFilter): boolean {
  if (filter === 'bag') return entry.equippedToChampionId === null;
  if (filter === 'equipped') return entry.equippedToChampionId !== null;
  return true;
}

function getChampionName(championId: string): string {
  const champion = championDB.getById(championId);
  return champion ? localizeChampion(champion).name : championId;
}

function getEquipmentFailureLabel(code: string): string {
  switch (code) {
    case 'equipment_full':
      return 'Équipement complet';
    case 'unique_item':
      return 'Objet unique déjà équipé';
    case 'item_already_equipped':
      return 'Porte déjà cet objet';
    default:
      return 'Indisponible';
  }
}

function getAffectedStats(entry: InventoryEntry): CanonicalStatKey[] {
  return [
    ...new Set(
      Object.keys(entry.item.stats)
        .map(normalizeStatKey)
        .filter((stat): stat is CanonicalStatKey => stat !== null),
    ),
  ];
}

function getItemStatValue(entry: InventoryEntry, stat: CanonicalStatKey): number {
  return Object.entries(entry.item.stats).reduce(
    (total, [key, value]) => (normalizeStatKey(key) === stat ? total + value : total),
    0,
  );
}

function getEquipPreview(
  entry: InventoryEntry,
  member: TeamMember,
  inventory: InventoryEntry[],
  authorityEnhancementSnapshot: RunEnhancementSnapshot | null,
  authorityMasterySnapshot: RunMasterySnapshot | null,
  localUnlockedNodes: Record<string, number>,
  localMasteryLevel: number,
): StatPreview[] {
  const champion = championDB.getById(member.championId);
  if (!champion) return [];

  const unlockedNodes = authorityEnhancementSnapshot
    ? (authorityEnhancementSnapshot[member.championId] ??
      authorityEnhancementSnapshot[member.championId.toLowerCase()] ??
      {})
    : localUnlockedNodes;
  const enhancementBonuses = enhancementService.calculateStatBonuses(
    enhancementTreeProvider.getTreeForChampion(champion),
    unlockedNodes,
  );
  const masteryLevel = authorityEnhancementSnapshot
    ? (authorityMasterySnapshot?.[member.championId] ??
      authorityMasterySnapshot?.[member.championId.toLowerCase()] ??
      0)
    : localMasteryLevel;
  const commonArguments = [champion, member.level, enhancementBonuses] as const;
  const before = calculateFullStats(
    ...commonArguments,
    inventory,
    member.championId,
    masteryLevel,
    member.statBoosts,
    member.statMultiplier,
  );
  const previewInventory = inventory.map((candidate) =>
    candidate.instanceId === entry.instanceId
      ? { ...candidate, equippedToChampionId: member.championId }
      : candidate,
  );
  const after = calculateFullStats(
    ...commonArguments,
    previewInventory,
    member.championId,
    masteryLevel,
    member.statBoosts,
    member.statMultiplier,
  );

  return getAffectedStats(entry).map((stat) => ({
    stat,
    before: before[stat],
    after: after[stat],
  }));
}

function InventoryImage({
  src,
  name,
  kind,
}: {
  src: string;
  name: string;
  kind: 'item' | 'champion';
}) {
  const fallback = name.trim().charAt(0).toLocaleUpperCase('fr-FR') || '?';
  return (
    <span className={`run-inventory-image run-inventory-image--${kind}`} aria-hidden="true">
      <span className="run-inventory-image__fallback">{fallback}</span>
      {src ? (
        <img
          src={src}
          alt=""
          width={kind === 'item' ? 48 : 44}
          height={kind === 'item' ? 48 : 44}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}

export function RunInventoryPanel({ inventory, team }: RunInventoryPanelProps) {
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InventoryFeedback | null>(null);
  const titleId = useId();
  const detailsId = useId();
  const selectedItemButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterButtonRefs = useRef<Partial<Record<InventoryFilter, HTMLButtonElement | null>>>({});
  const selectedEntry = inventory.find((entry) => entry.instanceId === selectedInstanceId) ?? null;
  const selectedMember = team.find((member) => member.championId === selectedChampionId) ?? null;
  const equipItem = useRunStore((state) => state.equipItem);
  const unequipItem = useRunStore((state) => state.unequipItem);
  const sellItem = useRunStore((state) => state.sellItem);
  const sortInventory = useRunStore((state) => state.sortInventory);
  const authorityEnhancementSnapshot = useRunStore(
    (state) => state.authorityAttempt?.enhancementSnapshot ?? null,
  );
  const authorityMasterySnapshot = useRunStore(
    (state) => state.authorityAttempt?.masterySnapshot ?? null,
  );
  const hasAuthoritySnapshot = authorityEnhancementSnapshot !== null;
  const localUnlockedNodes = useEnhancementStore((state) => {
    if (hasAuthoritySnapshot || !selectedChampionId) return EMPTY_UNLOCKED_NODES;
    return (
      state.enhancements[selectedChampionId]?.unlockedNodes ??
      state.enhancements[selectedChampionId.toLowerCase()]?.unlockedNodes ??
      EMPTY_UNLOCKED_NODES
    );
  });
  const localMasteryLevel = useMasteryStore((state) => {
    if (hasAuthoritySnapshot || !selectedChampionId) return 0;
    return (
      state.champions[selectedChampionId]?.level ??
      state.champions[selectedChampionId.toLowerCase()]?.level ??
      0
    );
  });

  const visibleEntries = useMemo(
    () => inventory.filter((entry) => matchesFilter(entry, filter)),
    [filter, inventory],
  );
  const teamChampionIds = useMemo(() => team.map((member) => member.championId), [team]);
  const affectedStats = useMemo(
    () => (selectedEntry ? getAffectedStats(selectedEntry) : []),
    [selectedEntry],
  );
  const equippedCountByChampion = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of inventory) {
      if (!entry.equippedToChampionId) continue;
      counts.set(entry.equippedToChampionId, (counts.get(entry.equippedToChampionId) ?? 0) + 1);
    }
    return counts;
  }, [inventory]);
  const targetValidation =
    selectedEntry && selectedMember
      ? validateItemEquipment(
          inventory,
          teamChampionIds,
          selectedEntry.instanceId,
          selectedMember.championId,
        )
      : null;
  const preview = useMemo(
    () =>
      selectedEntry && selectedMember && targetValidation?.valid
        ? getEquipPreview(
            selectedEntry,
            selectedMember,
            inventory,
            authorityEnhancementSnapshot,
            authorityMasterySnapshot,
            localUnlockedNodes,
            localMasteryLevel,
          )
        : [],
    [
      authorityEnhancementSnapshot,
      authorityMasterySnapshot,
      inventory,
      localMasteryLevel,
      localUnlockedNodes,
      selectedEntry,
      selectedMember,
      targetValidation?.valid,
    ],
  );

  const closeSelection = (restoreFocus = true) => {
    const returnFocusTarget = selectedItemButtonRef.current;
    setSelectedInstanceId(null);
    setSelectedChampionId(null);
    if (restoreFocus) returnFocusTarget?.focus();
  };

  const reconcileSelectionAfterEquipmentChange = (nextOwnerId: string | null) => {
    if (!selectedEntry) return;
    setSelectedChampionId(null);
    if (matchesFilter({ ...selectedEntry, equippedToChampionId: nextOwnerId }, filter)) return;
    setSelectedInstanceId(null);
    filterButtonRefs.current[filter]?.focus();
  };

  const selectItem = (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setSelectedChampionId(null);
    setFeedback(null);
  };

  const changeFilter = (nextFilter: InventoryFilter) => {
    setFilter(nextFilter);
    if (selectedEntry && !matchesFilter(selectedEntry, nextFilter)) {
      setSelectedInstanceId(null);
      setSelectedChampionId(null);
    }
  };

  const handleEquip = () => {
    if (!selectedEntry || !selectedMember || !targetValidation?.valid) return;
    const previousOwnerId = selectedEntry.equippedToChampionId;
    const succeeded = equipItem(selectedEntry.instanceId, selectedMember.championId);
    if (!succeeded) {
      setFeedback({
        kind: 'error',
        message: `Impossible de déplacer ${selectedEntry.item.name}. Réessaie.`,
      });
      return;
    }
    const targetName = getChampionName(selectedMember.championId);
    setFeedback({
      kind: 'success',
      message: previousOwnerId
        ? `Transfert effectué : ${selectedEntry.item.name}, de ${getChampionName(previousOwnerId)} à ${targetName}.`
        : `Objet équipé : ${selectedEntry.item.name} sur ${targetName}.`,
    });
    reconcileSelectionAfterEquipmentChange(selectedMember.championId);
  };

  const handleUnequip = () => {
    if (!selectedEntry?.equippedToChampionId) return;
    const itemName = selectedEntry.item.name;
    if (!unequipItem(selectedEntry.instanceId)) {
      setFeedback({
        kind: 'error',
        message: `Impossible de déséquiper ${itemName}. Réessaie.`,
      });
      return;
    }
    setFeedback({
      kind: 'success',
      message: `Objet replacé dans le sac : ${itemName}.`,
    });
    reconcileSelectionAfterEquipmentChange(null);
  };

  const handleSell = () => {
    if (!selectedEntry) return;
    const itemName = selectedEntry.item.name;
    const saleGold = getItemSaleGold(selectedEntry.item.goldValue);
    if (!sellItem(selectedEntry.instanceId)) {
      setFeedback({
        kind: 'error',
        message: `Impossible de vendre ${itemName}. Réessaie.`,
      });
      return;
    }
    setFeedback({
      kind: 'success',
      message: `Vente confirmée : ${itemName}, +${saleGold} ${fr.common.gold}.`,
    });
    closeSelection(false);
    filterButtonRefs.current[filter]?.focus();
  };

  const bagCount = inventory.filter((entry) => entry.equippedToChampionId === null).length;
  const equippedCount = inventory.length - bagCount;
  const filterCounts: Record<InventoryFilter, number> = {
    all: inventory.length,
    bag: bagCount,
    equipped: equippedCount,
  };

  return (
    <section
      className="run-map-panel run-inventory"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || (!selectedChampionId && !selectedInstanceId)) return;
        event.stopPropagation();
        if (selectedChampionId) setSelectedChampionId(null);
        else closeSelection();
      }}
    >
      <header className="run-inventory__header">
        <div>
          <span className="run-inventory__eyebrow">Équipement du run</span>
          <h2 id={titleId}>Inventaire</h2>
        </div>
        <span
          className={`run-inventory__capacity${
            inventory.length >= MAX_INVENTORY_ITEMS ? ' run-inventory__capacity--full' : ''
          }`}
        >
          {inventory.length}/{MAX_INVENTORY_ITEMS}
          <span className="sr-only"> objets</span>
          {inventory.length >= MAX_INVENTORY_ITEMS ? (
            <span className="sr-only"> · Inventaire plein</span>
          ) : null}
        </span>
      </header>

      <div className="run-inventory__toolbar">
        <div className="run-inventory__filters" role="group" aria-label="Filtrer l’inventaire">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              ref={(element) => {
                filterButtonRefs.current[id] = element;
              }}
              className="run-inventory__filter"
              aria-pressed={filter === id}
              onClick={() => changeFilter(id)}
            >
              {label} <span aria-hidden="true">{filterCounts[id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="run-inventory__sort"
          disabled={inventory.length < 2}
          onClick={() => {
            sortInventory();
            setFeedback({ kind: 'neutral', message: 'Inventaire trié.' });
          }}
        >
          Trier
        </button>
      </div>

      {visibleEntries.length > 0 ? (
        <ul className="run-inventory__list" aria-label="Objets disponibles">
          {visibleEntries.map((entry) => {
            const ownerName = entry.equippedToChampionId
              ? getChampionName(entry.equippedToChampionId)
              : null;
            const isSelected = entry.instanceId === selectedEntry?.instanceId;
            return (
              <li key={entry.instanceId}>
                <button
                  type="button"
                  ref={isSelected ? selectedItemButtonRef : undefined}
                  className="run-inventory-item"
                  aria-pressed={isSelected}
                  aria-controls={isSelected ? detailsId : undefined}
                  onClick={() => selectItem(entry.instanceId)}
                >
                  <InventoryImage src={entry.item.iconUrl} name={entry.item.name} kind="item" />
                  <span className="run-inventory-item__copy">
                    <strong>{entry.item.name}</strong>
                    <small>{ownerName ? `Équipé · ${ownerName}` : 'Dans le sac'}</small>
                  </span>
                  <span className="run-inventory-item__value">
                    Vente · {getItemSaleGold(entry.item.goldValue)} {fr.common.gold}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="run-inventory__empty">
          {inventory.length === 0
            ? `Inventaire : ${fr.common.empty.toLocaleLowerCase('fr-FR')}.`
            : 'Aucun objet dans cette catégorie.'}
        </p>
      )}

      {selectedEntry ? (
        <section
          className="run-inventory-detail"
          id={detailsId}
          aria-labelledby={`${detailsId}-title`}
        >
          <header className="run-inventory-detail__header">
            <InventoryImage
              src={selectedEntry.item.iconUrl}
              name={itemName(selectedEntry.item.id, selectedEntry.item.name)}
              kind="item"
            />
            <div>
              <span className="run-inventory__eyebrow">Objet sélectionné</span>
              <h3 id={`${detailsId}-title`}>
                {itemName(selectedEntry.item.id, selectedEntry.item.name)}
              </h3>
              <p>{itemDescription(selectedEntry.item.id, selectedEntry.item.description)}</p>
            </div>
            <button
              type="button"
              className="run-inventory-detail__close"
              aria-label={`${fr.common.close} : ${selectedEntry.item.name}`}
              onClick={() => closeSelection()}
            >
              {fr.common.close}
            </button>
          </header>

          {affectedStats.length > 0 ? (
            <dl className="run-inventory-detail__stats" aria-label={fr.database.stats}>
              {affectedStats.map((stat) => {
                const value = getItemStatValue(selectedEntry, stat);
                return (
                  <div key={stat}>
                    <dt>{STAT_LABELS[stat]}</dt>
                    <dd>
                      {value > 0 ? '+' : ''}
                      {formatStatValue(stat, value)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}

          <div className="run-inventory-detail__ownership">
            <span>
              {selectedEntry.equippedToChampionId
                ? `Porté par ${getChampionName(selectedEntry.equippedToChampionId)}`
                : 'Disponible dans le sac'}
            </span>
            <strong>
              Vente : {getItemSaleGold(selectedEntry.item.goldValue)} {fr.common.gold}
            </strong>
          </div>

          {team.length > 0 ? (
            <fieldset className="run-inventory-targets">
              <legend>
                {selectedEntry.equippedToChampionId
                  ? 'Choisir un champion pour transférer'
                  : 'Choisir un champion à équiper'}
              </legend>
              <div className="run-inventory-targets__list">
                {team.map((member) => {
                  const champion = championDB.getById(member.championId);
                  const championName = champion?.name ?? member.championId;
                  const equippedItems = equippedCountByChampion.get(member.championId) ?? 0;
                  const validation = validateItemEquipment(
                    inventory,
                    teamChampionIds,
                    selectedEntry.instanceId,
                    member.championId,
                  );
                  const isCurrentOwner = selectedEntry.equippedToChampionId === member.championId;
                  const stateLabel = isCurrentOwner
                    ? 'Actuel'
                    : validation.valid
                      ? `${equippedItems} sur ${MAX_ITEMS_PER_CHAMPION}`
                      : getEquipmentFailureLabel(validation.code);
                  const unavailableMessage = `Impossible d’équiper ${selectedEntry.item.name} sur ${championName} : ${stateLabel.toLocaleLowerCase('fr-FR')}.`;
                  return (
                    <button
                      key={member.championId}
                      type="button"
                      className="run-inventory-target"
                      aria-pressed={selectedChampionId === member.championId}
                      aria-disabled={!validation.valid}
                      onClick={() => {
                        if (!validation.valid) {
                          setSelectedChampionId(null);
                          setFeedback({ kind: 'neutral', message: unavailableMessage });
                          return;
                        }
                        setFeedback(null);
                        setSelectedChampionId(member.championId);
                      }}
                    >
                      <InventoryImage
                        src={champion?.iconUrl ?? ''}
                        name={championName}
                        kind="champion"
                      />
                      <span>
                        <strong>{championName}</strong>
                        <small>
                          {equippedItems}/{MAX_ITEMS_PER_CHAMPION} objets · {stateLabel}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p className="run-inventory__empty">{fr.run.noChampions} disponible pour cet objet.</p>
          )}

          {selectedMember && targetValidation?.valid ? (
            <div className="run-inventory-preview" aria-live="polite">
              <span className="run-inventory__eyebrow">
                Aperçu sur {getChampionName(selectedMember.championId)}
              </span>
              {preview.length > 0 ? (
                <dl>
                  {preview.map(({ stat, before, after }) => (
                    <div key={stat}>
                      <dt>{STAT_LABELS[stat]}</dt>
                      <dd>
                        {formatStatValue(stat, before)} <span aria-hidden="true">→</span>{' '}
                        <span className="sr-only">devient</span>{' '}
                        <strong>{formatStatValue(stat, after)}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Cet objet n’ajoute pas de caractéristique directe.</p>
              )}
            </div>
          ) : null}

          <div className="run-inventory-detail__actions">
            {selectedMember && targetValidation?.valid ? (
              <button
                type="button"
                className="run-inventory-action run-inventory-action--primary"
                onClick={handleEquip}
              >
                {selectedEntry.equippedToChampionId
                  ? `Transférer vers ${getChampionName(selectedMember.championId)}`
                  : `Équiper sur ${getChampionName(selectedMember.championId)}`}
              </button>
            ) : null}
            {selectedEntry.equippedToChampionId ? (
              <button type="button" className="run-inventory-action" onClick={handleUnequip}>
                Déséquiper
              </button>
            ) : null}
            <button
              type="button"
              className="run-inventory-action run-inventory-action--sell"
              onClick={handleSell}
            >
              Vendre pour {getItemSaleGold(selectedEntry.item.goldValue)} {fr.common.gold}
            </button>
          </div>
        </section>
      ) : (
        <p className="run-inventory__selection-hint">Sélectionne un objet pour le gérer.</p>
      )}

      <output
        className={`run-inventory__feedback${feedback ? ` run-inventory__feedback--${feedback.kind}` : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback?.message ?? ''}
      </output>
    </section>
  );
}

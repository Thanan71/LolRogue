import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { aggregateEnhancementBonuses } from '@/game/enhancements/bonuses';
import { getEnhancementTreeForChampion } from '@/game/enhancements/catalog';
import { adaptLegacyEnhancementTree } from '@/game/enhancements/contract';
import {
  getActiveEnhancementRanks,
  planEnhancementPurchase,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import { getEnhancementSecondaryStats } from '@/game/rules/enhancementStats';
import {
  formatStatValue,
  normalizeGameplayStatKey,
  normalizeStatKey,
} from '@/game/stats/statContract';
import { enhancementContent } from '@/i18n/enhancementContent';
import type { EnhancementResetPreview } from '@/services/interfaces/IEnhancementRepository';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Champion } from '@/types/champion';
import type { EnhancementNode, PlayerEnhancementState } from '@/types/enhancementTree';
import { BRANCH_THEME_ICONS } from '@/types/enhancementTree';
import { calculateFullStats } from '@/utils/statCalculator';
import { enhancementUiCopy } from './copy';
import { EnhancementDialog } from './EnhancementDialog';
import { EnhancementNodeCard, type EnhancementStatPreview } from './EnhancementNodeCard';
import { EnhancementReset } from './EnhancementReset';
import { branchContent, nodeContent } from './presentation';
import './enhancements.css';

export interface EnhancementTreeProps {
  champion: Champion;
  playerCandies: number;
  masteryLevel: number;
  enhancementState: PlayerEnhancementState;
  onUnlockNode: (nodeId: string) => Promise<void>;
  isLoading?: boolean;
  readOnly?: boolean;
  accountKey?: string | null;
  enabledGates?: { champion_specializations: boolean };
  onRetry?: () => Promise<void>;
  loadError?: boolean;
  onPreviewReset?: () => Promise<EnhancementResetPreview | null>;
  onResetTree?: (revision: number) => Promise<boolean>;
  getResetRetryPreview?: () => EnhancementResetPreview | null;
}

export function EnhancementTree({
  champion,
  playerCandies,
  masteryLevel,
  enhancementState,
  onUnlockNode,
  isLoading = false,
  readOnly = false,
  accountKey,
  enabledGates,
  onRetry,
  loadError = false,
  onPreviewReset,
  onResetTree,
  getResetRetryPreview,
}: EnhancementTreeProps) {
  const locale = useSettingsStore((state) => state.language);
  const copy = enhancementUiCopy[locale];
  const original = enhancementContent[locale];
  const tree = useMemo(() => getEnhancementTreeForChampion(champion), [champion]);
  const contract = useMemo(() => adaptLegacyEnhancementTree(tree), [tree]);
  const [activeBranch, setActiveBranch] = useState(tree.branches[0]?.id ?? '');
  const [exploring, setExploring] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<EnhancementNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [recommendation, setRecommendation] = useState(false);
  const pending = useRef<number | null>(null);
  const confirmationOwner = useRef(accountKey);
  const generation = useRef(0);
  const id = useId();
  useEffect(() => {
    generation.current++;
    pending.current = null;
    setActiveBranch(tree.branches[0]?.id ?? '');
    setExploring(null);
    setConfirming(null);
    setSaving(false);
    setError(false);
    setRecommendation(false);
  }, [champion.id, tree, accountKey]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const context = {
    unlockedNodes: enhancementState.unlockedNodes,
    masteryLevel,
    availableCandies: playerCandies,
    totalCandiesSpent: enhancementState.totalCandiesSpent,
    contract,
    enabledGates: enabledGates?.champion_specializations ? ['champion_specializations'] : [],
  };
  // Publication gates apply to new purchases; an attested owned specialization remains active.
  const active = getActiveEnhancementRanks(contract, enhancementState, {
    masteryLevel,
    enabledGates: ['champion_specializations'],
  });
  const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
  const beforeBonuses = aggregateEnhancementBonuses(nodes, active);
  const beforeStats = calculateFullStats(
    champion,
    1,
    beforeBonuses,
    undefined,
    undefined,
    masteryLevel,
  );
  const beforeSecondary = getEnhancementSecondaryStats(beforeBonuses);
  const busy = isLoading || saving;
  const format = (value: number) => (Number.isFinite(value) ? value.toLocaleString(locale) : '—');

  function statPreview(node: EnhancementNode): EnhancementStatPreview[] {
    const rank = enhancementState.unlockedNodes[node.id] ?? 0;
    if (rank >= (node.maxRanks ?? 1)) return [];
    // The arithmetic is a hypothetical next-rank example, never a mutation or eligibility grant.
    const afterBonuses = aggregateEnhancementBonuses(nodes, { ...active, [node.id]: rank + 1 });
    const afterStats = calculateFullStats(
      champion,
      1,
      afterBonuses,
      undefined,
      undefined,
      masteryLevel,
    );
    const afterSecondary = getEnhancementSecondaryStats(afterBonuses);
    const affected = new Set(
      [...Object.keys(node.statBonuses ?? {}), ...Object.keys(node.percentBonuses ?? {})]
        .map(normalizeGameplayStatKey)
        .filter((key) => key !== null),
    );
    return [...affected].map((stat) => {
      const canonical = normalizeStatKey(stat);
      return {
        label: original.statLabels[stat],
        secondary: canonical === null,
        before: canonical
          ? formatStatValue(canonical, beforeStats[canonical], locale)
          : format(beforeSecondary[stat as keyof typeof beforeSecondary]),
        after: canonical
          ? formatStatValue(canonical, afterStats[canonical], locale)
          : format(afterSecondary[stat as keyof typeof afterSecondary]),
      };
    });
  }
  function renderNode(node: EnhancementNode) {
    return (
      <EnhancementNodeCard
        key={node.id}
        node={node}
        rank={enhancementState.unlockedNodes[node.id] ?? 0}
        activeRank={active[node.id] ?? 0}
        preview={statPreview(node)}
        purchase={previewEnhancementPurchase(node, context)}
        plan={exploring === node.id ? planEnhancementPurchase(contract, node.id, context) : null}
        open={exploring === node.id}
        onExplore={(open) => setExploring(open ? node.id : null)}
        onPurchase={() => {
          setError(false);
          confirmationOwner.current = accountKey;
          setConfirming(node);
        }}
        readOnly={readOnly || loadError}
        busy={busy}
        locale={locale}
        copy={copy}
      />
    );
  }
  function recommend() {
    const branch = tree.branches.find((entry) => entry.id === activeBranch);
    const next = [...tree.coreNodes, ...(branch?.nodes ?? [])].find(
      (node) => previewEnhancementPurchase(node, context).eligible,
    );
    setRecommendation(!next);
    if (!next) return;
    setExploring(next.id);
    queueMicrotask(() => {
      const element = document.getElementById(`enhancement-${next.id}`);
      element?.focus();
      element?.scrollIntoView?.({ block: 'nearest' });
    });
  }
  async function confirmPurchase() {
    if (
      !confirming ||
      confirmationOwner.current !== accountKey ||
      pending.current !== null ||
      readOnly ||
      busy ||
      loadError ||
      !previewEnhancementPurchase(confirming, context).eligible
    )
      return;
    const stamp = generation.current;
    pending.current = stamp;
    setSaving(true);
    setError(false);
    try {
      await onUnlockNode(confirming.id);
      if (generation.current === stamp) setConfirming(null);
    } catch {
      if (generation.current === stamp) setError(true);
    } finally {
      if (pending.current === stamp) pending.current = null;
      if (generation.current === stamp) setSaving(false);
    }
  }
  const confirmation = confirming ? nodeContent(locale, confirming.id) : null;
  return (
    <section className="enhancement-tree" aria-labelledby={`${id}-title`} aria-busy={busy}>
      <header className="enhancement-tree-header">
        <h3 id={`${id}-title`} className="enhancement-tree-title">
          {original.ui.treeTitle(champion.name)}
        </h3>
      </header>
      <dl className="enhancement-facts">
        <dt>{copy.accountBalance}</dt>
        <dd>{readOnly ? '—' : format(playerCandies)}</dd>
        <dt>{copy.spent}</dt>
        <dd>{format(enhancementState.totalCandiesSpent)}</dd>
        <dt>{copy.mastery}</dt>
        <dd>{original.ui.masteryLevel(masteryLevel)}</dd>
      </dl>
      {readOnly && <p className="enhancement-notice">{copy.guest}</p>}
      {loadError && (
        <div role="alert">
          <p>{copy.failed}</p>
          {onRetry && (
            <button type="button" disabled={busy} onClick={() => void onRetry()}>
              {copy.retry}
            </button>
          )}
        </div>
      )}
      <section className="enhancement-section" aria-labelledby={`${id}-core`}>
        <h4 id={`${id}-core`} className="enhancement-section-title">
          {original.ui.coreNodesTitle}
        </h4>
        <div className="core-nodes-row">{tree.coreNodes.map(renderNode)}</div>
      </section>
      <div
        className="branch-tabs"
        role="tablist"
        aria-label={copy.branches}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const target =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (current + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
          event.preventDefault();
          tabs[target]?.click();
          tabs[target]?.focus();
        }}
      >
        {tree.branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            className={`branch-tab branch-tab--${branch.theme}${activeBranch === branch.id ? ' active' : ''}`}
            role="tab"
            id={`${id}-tab-${branch.id}`}
            aria-controls={`${id}-panel-${branch.id}`}
            aria-selected={activeBranch === branch.id}
            tabIndex={activeBranch === branch.id ? 0 : -1}
            onClick={() => {
              setActiveBranch(branch.id);
              setExploring(null);
              setRecommendation(false);
            }}
          >
            <span aria-hidden="true">{BRANCH_THEME_ICONS[branch.theme]}</span>{' '}
            {branchContent(locale, branch.id).name}
          </button>
        ))}
      </div>
      {tree.branches.map((branch) => {
        if (branch.id !== activeBranch) return null;
        const localized = branchContent(locale, branch.id);
        const total = branch.nodes.reduce((sum, node) => sum + (node.maxRanks ?? 1), 0);
        const owned = branch.nodes.reduce(
          (sum, node) => sum + (enhancementState.unlockedNodes[node.id] ?? 0),
          0,
        );
        return (
          <section
            key={branch.id}
            className="branch-content"
            role="tabpanel"
            id={`${id}-panel-${branch.id}`}
            aria-labelledby={`${id}-tab-${branch.id}`}
            tabIndex={0}
          >
            <div className="branch-header">
              <h4>{localized.name}</h4>
              <p className="branch-description">{localized.description}</p>
            </div>
            <label className="enhancement-progress">
              {copy.progress}: {owned}/{total}
              <progress
                aria-label={`${localized.name} — ${copy.progress}`}
                value={owned}
                max={total}
              />
            </label>
            <button
              type="button"
              className="enhancement-recommend"
              disabled={busy}
              onClick={recommend}
            >
              {copy.recommend}
            </button>
            <p>{copy.previewOnly}</p>
            {recommendation && <p role="status">{copy.noRecommendation}</p>}
            <div className="branch-nodes">
              {branch.nodes.map((node, index) => (
                <div className="enhancement-node-position" key={node.id}>
                  {index > 0 && (
                    <div className="node-connector" aria-hidden="true">
                      ↓
                    </div>
                  )}
                  {renderNode(node)}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {onPreviewReset && onResetTree && (
        <EnhancementReset
          key={`${accountKey ?? 'local'}:${champion.id}`}
          previewReset={onPreviewReset}
          resetTree={onResetTree}
          getRetryPreview={getResetRetryPreview}
          disabled={readOnly || busy || loadError}
          copy={copy}
          locale={locale}
        />
      )}
      {confirming && confirmation && (
        <EnhancementDialog
          title={copy.confirmTitle}
          busy={saving}
          confirmLabel={copy.confirm}
          cancelLabel={copy.cancel}
          canConfirm={
            !readOnly &&
            !busy &&
            !loadError &&
            previewEnhancementPurchase(confirming, context).eligible
          }
          onConfirm={() => void confirmPurchase()}
          onCancel={() => {
            setConfirming(null);
            setError(false);
          }}
        >
          <p>
            <strong>{confirmation.name}</strong> · {original.ui.candyBalance(confirming.candyCost)}
          </p>
          <p>{confirmation.description}</p>
          <p>
            {copy.balanceAfter}: {format(playerCandies - confirming.candyCost)}
          </p>
          <p>{copy.irreversible}</p>
          {saving && <p role="status">{copy.saving}</p>}
          {(error || loadError) && <p role="alert">{copy.failed}</p>}
        </EnhancementDialog>
      )}
    </section>
  );
}

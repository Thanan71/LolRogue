import { useId } from 'react';
import type {
  EnhancementPurchasePlan,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import { normalizeGameplayStatKey } from '@/game/stats/statContract';
import { type EnhancementContentLocale, enhancementContent } from '@/i18n/enhancementContent';
import type { EnhancementNode } from '@/types/enhancementTree';
import type { EnhancementUiCopy } from './copy';
import { nodeContent, reasonLabel } from './presentation';

type EnhancementPurchasePreview = ReturnType<typeof previewEnhancementPurchase>;

export interface EnhancementStatPreview {
  label: string;
  before: string;
  after: string;
  secondary: boolean;
}
export function EnhancementNodeCard({
  node,
  rank,
  activeRank,
  preview,
  purchase,
  plan,
  open,
  onExplore,
  onPurchase,
  readOnly,
  busy,
  locale,
  copy,
}: {
  node: EnhancementNode;
  rank: number;
  activeRank: number;
  preview: EnhancementStatPreview[];
  purchase: EnhancementPurchasePreview;
  plan: EnhancementPurchasePlan | null;
  open: boolean;
  onExplore: (open: boolean) => void;
  onPurchase: () => void;
  readOnly: boolean;
  busy: boolean;
  locale: EnhancementContentLocale;
  copy: EnhancementUiCopy;
}) {
  const id = useId();
  const content = nodeContent(locale, node.id);
  const original = enhancementContent[locale];
  const maximum = node.maxRanks ?? 1;
  const maxed = rank >= maximum;
  const label =
    rank > 0
      ? purchase.eligible
        ? copy.purchasedNext
        : copy.owned
      : reasonLabel(purchase.reason, locale, copy);
  return (
    <article
      id={`enhancement-${node.id}`}
      tabIndex={-1}
      className={`node-card node-card--${maxed ? 'maxed' : purchase.eligible ? 'available' : 'locked'}${rank > 0 ? ' node-card--owned' : ''}`}
      aria-labelledby={`${id}-name`}
    >
      <div className="node-header">
        <h5 id={`${id}-name`} className="node-name">
          {content.name}
        </h5>
        <span className="enhancement-rank">{copy.rank(rank, maximum)}</span>
      </div>
      <p className="enhancement-node-state">
        <span aria-hidden="true">{rank ? '✓' : purchase.eligible ? '＋' : '◇'}</span> {label}
      </p>
      <p className="node-description">{content.description}</p>
      {node.statBonuses && (
        <div className="node-stat-bonuses">
          {Object.entries(node.statBonuses).map(([stat, value]) => {
            const normalized = normalizeGameplayStatKey(stat);
            return (
              <span key={stat} className="node-stat-bonus">
                +{value.toLocaleString(locale)}{' '}
                {normalized ? original.statLabels[normalized] : stat}
              </span>
            );
          })}
        </div>
      )}
      <p className="enhancement-active-rank">
        {copy.active}: {activeRank ? copy.rank(activeRank, maximum) : copy.inactive}
      </p>
      <div className="node-preview" aria-label={original.ui.preview}>
        {preview.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>: {row.before} → <strong>{row.after}</strong>
          </div>
        ))}
      </div>
      <details
        className="enhancement-details"
        open={open}
        onToggle={(event) => {
          const next = event.currentTarget.open;
          if (next !== open) onExplore(next);
        }}
      >
        <summary>{copy.details}</summary>
        <p>{copy.projection}</p>
        {preview.some((row) => row.secondary) && <p>{copy.secondary}</p>}
        <p>{copy.source}</p>
        <p>
          <strong>{copy.formula}</strong>: {content.description}
        </p>
        <p>
          <strong>{copy.requirement}</strong>:{' '}
          {node.prerequisites.length
            ? node.prerequisites.map((parent) => nodeContent(locale, parent).name).join(' · ')
            : copy.none}
        </p>
        {purchase.reason && (
          <p className="node-lock-reason">
            {reasonLabel(purchase.reason, locale, copy)}
            {purchase.reason.nodeIds.length
              ? ` · ${purchase.reason.nodeIds.map((parent) => nodeContent(locale, parent).name).join(' · ')}`
              : ''}
            {purchase.reason.required !== undefined
              ? ` (${purchase.reason.actual?.toLocaleString(locale) ?? '0'} / ${purchase.reason.required.toLocaleString(locale)})`
              : ''}
          </p>
        )}
        {plan && (
          <p>
            <strong>{copy.path}</strong>:{' '}
            {plan.reachable && plan.requiredCandies !== null
              ? original.ui.candyBalance(plan.requiredCandies)
              : copy.pathUnavailable}
          </p>
        )}
        <p>{copy.previewOnly}</p>
      </details>
      <div className="node-footer">
        <span className="node-cost">{original.ui.candyBalance(node.candyCost)}</span>
        {maxed ? (
          <span className="node-maxed">{original.ui.maximum}</span>
        ) : (
          <button
            type="button"
            className="node-unlock-btn"
            disabled={!purchase.eligible || readOnly || busy}
            onClick={onPurchase}
            aria-describedby={`${id}-name`}
          >
            {busy
              ? original.ui.saving
              : rank > 0
                ? original.ui.nextRank(rank + 1, maximum)
                : original.ui.unlock}
          </button>
        )}
      </div>
    </article>
  );
}

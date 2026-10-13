import { COMBAT_STATUS_ICONS, combatantConditions } from '@/game/presentation/combatStatuses';
import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import type { CombatantInfo } from '@/stores/battleStore';

export function combatantStatusDescription(combatant: CombatantInfo): string {
  if (combatant.isDefeated) return combatCopy.statuses.defeated;
  const conditions = combatantConditions(combatant);
  return [
    conditions.lowHealth ? combatCopy.statuses.lowHealth : '',
    ...conditions.statuses.map(
      (status) =>
        `${combatCopy.statuses.labels[status.kind]}${status.amount !== undefined ? ` ${formatNumber(Math.round(status.amount))}` : ''} · ${combatCopy.statuses.turns(status.turnsRemaining)}`,
    ),
  ]
    .filter(Boolean)
    .join(', ');
}

export function CombatStatusBadges({ combatant }: { combatant: CombatantInfo }) {
  const { statuses, lowHealth } = combatantConditions(combatant);
  if (!combatant.isDefeated && !lowHealth && statuses.length === 0) return null;
  return (
    <ul className="combat-statuses" aria-label={combatCopy.statuses.forChampion(combatant.name)}>
      {combatant.isDefeated && (
        <li className="combat-status combat-status--defeated">
          <span aria-hidden="true">{COMBAT_STATUS_ICONS.defeated}</span>{' '}
          {combatCopy.statuses.defeated}
        </li>
      )}
      {lowHealth && (
        <li className="combat-status combat-status--lowHealth">
          <span aria-hidden="true">{COMBAT_STATUS_ICONS.lowHealth}</span>{' '}
          {combatCopy.statuses.lowHealth}
        </li>
      )}
      {statuses.map((status) => (
        <li key={status.id} className={`combat-status combat-status--${status.kind}`}>
          <span aria-hidden="true">{COMBAT_STATUS_ICONS[status.kind]}</span>
          <span>
            {combatCopy.statuses.labels[status.kind]}
            {status.amount !== undefined ? ` ${formatNumber(Math.round(status.amount))}` : ''}
            {(status.stacks ?? 0) > 1 ? ` ×${formatNumber(status.stacks!)}` : ''}{' '}
            <span className="combat-status__duration">
              · {combatCopy.statuses.turns(status.turnsRemaining)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

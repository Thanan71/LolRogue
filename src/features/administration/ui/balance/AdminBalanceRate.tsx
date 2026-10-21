import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminNumber, formatAdminPercent } from '../../domain/adminFormatting';
import { describeAdminBalanceWinRate } from '../../domain/balance/adminBalanceStatistics';

export function AdminBalanceRate({
  wins,
  runs,
  players,
}: {
  wins: number;
  runs: number;
  players: number;
}) {
  const copy = getAdminBalanceCopy(locale);
  const rate = describeAdminBalanceWinRate(wins, runs, players);
  return (
    <div className="admin-balance__rate">
      <strong>{rate.rate === null ? copy.unavailable : formatAdminPercent(rate.rate)}</strong>
      <span>
        {formatAdminNumber(wins)} / {formatAdminNumber(runs)} · {copy.players}:{' '}
        {formatAdminNumber(players)}
      </span>
      {rate.interval95 && (
        <span>
          {copy.wilson}: [{formatAdminPercent(rate.interval95.lower)} ;{' '}
          {formatAdminPercent(rate.interval95.upper)}]
        </span>
      )}
      {players > 0 && players < 30 && <span>{copy.insufficient}</span>}
      {rate.status === 'repeated_players' && <span>{copy.repeated}</span>}
      {rate.status === 'descriptive' && <span>{copy.descriptive}</span>}
    </div>
  );
}

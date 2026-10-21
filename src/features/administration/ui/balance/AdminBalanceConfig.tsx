import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminDate, formatAdminNumber } from '../../domain/adminFormatting';
import type { BalanceConfig } from '../../domain/balance/balanceTypes';

export function AdminBalanceConfig({ config }: { config: BalanceConfig }) {
  const copy = getAdminBalanceCopy(locale);
  const economy = config.championEconomy;
  return (
    <>
      <p className="admin-balance__metadata">
        {copy.readAt}: {formatAdminDate(config.snapshotAt)}
      </p>
      <details className="admin-details" open>
        <summary>{copy.gameplay}</summary>
        {!config.gameplayRulesets.some((ruleset) => ruleset.active) && <p>{copy.activeMissing}</p>}
        <div
          className="admin-balance__scroll"
          role="region"
          aria-label={copy.gameplay}
          tabIndex={0}
        >
          <table className="admin-balance__table">
            <caption>{copy.gameplay}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.gameplay}</th>
                <th scope="col">{copy.engine}</th>
                <th scope="col">{copy.command}</th>
                <th scope="col">{copy.active}</th>
                <th scope="col">{copy.contentHash}</th>
              </tr>
            </thead>
            <tbody>
              {config.gameplayRulesets.map((ruleset) => (
                <tr key={ruleset.version}>
                  <th scope="row">
                    <code>{ruleset.code}</code>
                    <small>{formatAdminNumber(ruleset.version)}</small>
                  </th>
                  <td>
                    <code>{ruleset.engineVersion}</code>
                  </td>
                  <td>{formatAdminNumber(ruleset.commandVersion)}</td>
                  <td>{ruleset.active ? copy.active : copy.archived}</td>
                  <td>
                    <code>{ruleset.contentHash}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="admin-details">
        <summary>{copy.progression}</summary>
        {!config.progressionRulesets.some((ruleset) => ruleset.active) && (
          <p>{copy.activeMissing}</p>
        )}
        <ul>
          {config.progressionRulesets.map((ruleset) => (
            <li key={ruleset.version}>
              <code>{ruleset.code}</code> · {formatAdminNumber(ruleset.version)} ·{' '}
              {ruleset.active ? copy.active : copy.archived}
            </li>
          ))}
        </ul>
      </details>
      <h4>{copy.economy}</h4>
      {economy ? (
        <dl className="admin-profile-facts admin-balance__facts">
          <div>
            <dt>{copy.economy}</dt>
            <dd>{economy.enabled ? copy.enabled : copy.disabled}</dd>
          </div>
          <div>
            <dt>{copy.economyVersion}</dt>
            <dd>{formatAdminNumber(economy.economyVersion)}</dd>
          </div>
          <div>
            <dt>{copy.catalogVersion}</dt>
            <dd>{formatAdminNumber(economy.catalogVersion)}</dd>
          </div>
          <div>
            <dt>{copy.gameplay}</dt>
            <dd>{formatAdminNumber(economy.gameplayVersion)}</dd>
          </div>
        </dl>
      ) : (
        <p>{copy.flagMissing}</p>
      )}
      <p className="admin-balance__note">{copy.policyHelp}</p>
    </>
  );
}

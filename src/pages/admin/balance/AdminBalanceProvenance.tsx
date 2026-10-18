import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { BALANCE_CALIBRATION_DECISION } from '@/product/balanceCalibrationDecision';
import baseline from '../../../../config/authority-field-calibration-baseline-v1.json';
import { formatAdminNumber } from '../../adminPageUtils';

const SOURCE = 'https://github.com/Thanan71/LolRogue/blob/4f765799a67b97104aa0a37b52dd4f058334f126';

export function AdminBalanceProvenance() {
  const copy = getAdminBalanceCopy(locale);
  return (
    <details className="admin-details">
      <summary>{copy.provenance}</summary>
      <p>{copy.policyHelp}</p>
      <p>
        <a href={`${SOURCE}/docs/field-calibration.md`}>{copy.humanReview}</a>
      </p>
      <p className="admin-balance__note">{copy.fixtureDate}</p>
      {BALANCE_CALIBRATION_DECISION.authority.baselineKeys.map((key) => {
        const entry = baseline.entries[key as keyof typeof baseline.entries];
        if (!entry) return null;
        return (
          <article className="admin-balance__provenance" key={key}>
            <h4>
              {copy.baseline} ·{' '}
              {formatAdminNumber(BALANCE_CALIBRATION_DECISION.authority.baselineVersion)}
            </h4>
            <dl className="admin-profile-facts admin-balance__facts">
              <div>
                <dt>{copy.engine}</dt>
                <dd>
                  <code>{entry.identity.engineVersion}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.contentHash}</dt>
                <dd>
                  <code>{entry.identity.contentHash}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.policy}</dt>
                <dd>
                  <code>
                    {entry.identity.policy.id}@{entry.identity.policy.version}
                  </code>
                </dd>
              </div>
              <div>
                <dt>{copy.runs}</dt>
                <dd>
                  {entry.reports.map((report) => (
                    <p key={report.scenarioId}>
                      <code>{report.scenarioId}</code> · {formatAdminNumber(report.sampleSize)}
                    </p>
                  ))}
                </dd>
              </div>
            </dl>
            <details>
              <summary>
                {copy.seeds} · {formatAdminNumber(entry.source.seeds.length)}
              </summary>
              <p>
                <code>{entry.source.seeds.join(', ')}</code>
              </p>
            </details>
            <a href={`${SOURCE}/config/authority-field-calibration-baseline-v1.json`}>
              {copy.source}
            </a>
          </article>
        );
      })}
    </details>
  );
}

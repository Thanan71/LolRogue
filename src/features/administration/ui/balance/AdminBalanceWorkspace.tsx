import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminFieldCalibrationPanel } from '../AdminFieldCalibrationPanel';
import { AdminBalanceBuilds } from './AdminBalanceBuilds';
import { AdminBalanceChampions } from './AdminBalanceChampions';
import { AdminBalanceConfig } from './AdminBalanceConfig';
import { AdminBalanceFilters } from './AdminBalanceFilters';
import { AdminBalanceProvenance } from './AdminBalanceProvenance';
import { AdminBalanceSection } from './AdminBalanceSection';
import { useAdminBalance } from '../../hooks/balance/useAdminBalance';
import '@/styles/admin-balance.css';

export default function AdminBalanceWorkspace({ active = true }: { active?: boolean }) {
  const balance = useAdminBalance(active);
  const copy = getAdminBalanceCopy(locale);
  const loading =
    balance.champions.loading ||
    balance.builds.loading ||
    balance.config.loading ||
    balance.field.loading;
  return (
    <section
      role="tabpanel"
      id="admin-panel-balance"
      aria-labelledby="admin-tab-balance"
      className="admin-balance"
    >
      <div className="admin-balance__heading">
        <h2>{copy.title}</h2>
        <Button onClick={balance.refresh} disabled={!balance.enabled || loading}>
          {copy.refresh}
        </Button>
      </div>
      <p>{copy.intro}</p>
      {balance.permissionDenied && <p role="alert">{copy.denied}</p>}
      <AdminBalanceFilters balance={balance} />
      <p className="admin-balance__metadata">
        {copy.applied}:{' '}
        <time dateTime={balance.appliedDraft.from}>{balance.appliedDraft.from}</time> –{' '}
        <time dateTime={balance.appliedDraft.to}>{balance.appliedDraft.to}</time> ({copy.utc})
      </p>
      <details className="admin-details">
        <summary>{copy.appliedDetails}</summary>
        <dl className="admin-profile-facts admin-balance__facts">
          <div>
            <dt>{copy.mode}</dt>
            <dd>{copy[balance.appliedDraft.mode]}</dd>
          </div>
          <div>
            <dt>{copy.difficulty}</dt>
            <dd>
              {balance.appliedDraft.difficulty === 'normal'
                ? copy.standard
                : copy[balance.appliedDraft.difficulty]}
            </dd>
          </div>
          {(
            [
              ['engineVersion', 'engine'],
              ['gameplayVersion', 'gameplay'],
              ['progressionVersion', 'progression'],
              ['commandVersion', 'command'],
              ['contentHash', 'contentHash'],
              ['championId', 'champion'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <dt>{copy[label]}</dt>
              <dd>
                <code>{balance.appliedDraft[field] || copy.all}</code>
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <AdminBalanceSection
        id="admin-balance-champions"
        title={copy.champions}
        help={copy.championHelp}
        state={balance.champions}
        disabled={!balance.enabled}
      >
        {balance.champions.data && (
          <AdminBalanceChampions
            report={balance.champions.data}
            contextSelection={{
              value: balance.selection.championContextId,
              onChange: (value) => balance.changeSelection('championContextId', value),
            }}
            pickSelection={{
              value: balance.selection.pickSegmentId,
              onChange: (value) => balance.changeSelection('pickSegmentId', value),
            }}
          />
        )}
      </AdminBalanceSection>
      <AdminBalanceSection
        id="admin-balance-builds"
        title={copy.builds}
        help={copy.buildHelp}
        state={balance.builds}
        disabled={!balance.enabled}
      >
        {balance.builds.data && (
          <AdminBalanceBuilds
            report={balance.builds.data}
            selection={{
              value: balance.selection.buildContextId,
              onChange: (value) => balance.changeSelection('buildContextId', value),
            }}
          />
        )}
      </AdminBalanceSection>
      <AdminBalanceSection
        id="admin-balance-config"
        title={copy.configuration}
        help={copy.configurationHelp}
        state={balance.config}
        disabled={!balance.enabled}
      >
        {balance.config.data && <AdminBalanceConfig config={balance.config.data} />}
      </AdminBalanceSection>
      <section className="admin-balance__panel" aria-labelledby="admin-balance-trees-heading">
        <h3 id="admin-balance-trees-heading">{copy.treeTitle}</h3>
        <p>{copy.treeDependency}</p>
      </section>
      <AdminBalanceSection
        id="admin-balance-field"
        title={copy.field}
        help={copy.fieldHelp}
        state={balance.field}
        disabled={!balance.enabled}
      >
        {balance.field.data &&
          (balance.field.data.supported ? (
            <AdminFieldCalibrationPanel
              fieldCohorts={balance.field.data.cohorts}
              championCohorts={balance.field.data.champions}
              augmentCohorts={balance.field.data.augments}
            />
          ) : (
            <p role="status">{copy.fieldScope}</p>
          ))}
      </AdminBalanceSection>
      <AdminBalanceProvenance />
    </section>
  );
}

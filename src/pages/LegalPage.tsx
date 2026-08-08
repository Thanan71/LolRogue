import { Link } from 'react-router-dom';
import { PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import { legalFr } from '@/i18n/legal.fr';
import {
  LEGAL_POLICY_VERSION,
  LOCAL_STORAGE_PURPOSES,
  PRIVACY_RETENTION,
  RIOT_FAN_PROJECT_NOTICE,
} from '@/legal/legalContract';

function Paragraphs({ values }: { values: readonly string[] }) {
  return values.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

export function LegalPage() {
  return (
    <PageShell width="content">
      <PageHeader title={legalFr.title} subtitle={`${legalFr.version} ${LEGAL_POLICY_VERSION}`} />
      <Stack>
        <Panel>
          <h2>{legalFr.legalNotice.title}</h2>
          <Paragraphs values={legalFr.legalNotice.paragraphs} />
          <p>
            <a href="https://github.com/Thanan71/LolRogue">{legalFr.legalNotice.repository}</a>
          </p>
        </Panel>

        <Panel>
          <h2>{legalFr.terms.title}</h2>
          <Paragraphs values={legalFr.terms.paragraphs} />
        </Panel>

        <Panel>
          <h2>{legalFr.privacy.title}</h2>
          <Paragraphs values={legalFr.privacy.paragraphs} />
          <ul>
            <li>{`${legalFr.privacy.dailyPublic} : ${PRIVACY_RETENTION.publicDailyLeaderboardMonths} mois ${legalFr.privacy.maximum}.`}</li>
            <li>{`${legalFr.privacy.diagnosticLogs} : ${PRIVACY_RETENTION.diagnosticLogDays} jours ${legalFr.privacy.maximum}.`}</li>
            <li>{`${legalFr.privacy.reviewedReports} : ${PRIVACY_RETENTION.reviewedModerationReportMonths} mois.`}</li>
            <li>{`${legalFr.privacy.accountData} : ${PRIVACY_RETENTION.accountData}.`}</li>
            <li>{`${legalFr.privacy.guestData} : ${PRIVACY_RETENTION.guestData}.`}</li>
          </ul>
        </Panel>

        <Panel>
          <h2>{legalFr.storage.title}</h2>
          <p>{legalFr.storage.intro}</p>
          <ul>
            {LOCAL_STORAGE_PURPOSES.map((purpose) => (
              <li key={purpose}>{purpose}</li>
            ))}
          </ul>
          <p>{legalFr.storage.telemetry}</p>
        </Panel>

        <Panel>
          <h2>{legalFr.rights.title}</h2>
          <Paragraphs values={legalFr.rights.paragraphs} />
        </Panel>

        <Panel>
          <h2>{legalFr.riot.title}</h2>
          <p>{RIOT_FAN_PROJECT_NOTICE}</p>
          <p>{legalFr.riot.detail}</p>
          <p>
            <a href="https://www.riotgames.com/en/legal">{legalFr.riot.officialPolicy}</a>
          </p>
        </Panel>

        <p>
          <Link to={ROUTES.AUTH}>{legalFr.backToAuth}</Link> ·{' '}
          <Link to={ROUTES.MENU}>{fr.common.backToMenu}</Link>
        </p>
      </Stack>
    </PageShell>
  );
}

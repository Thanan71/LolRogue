import { Link } from 'react-router-dom';
import { PageFooter, PageHeader, PageShell, Panel } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { formatDate } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import { legalEn } from '@/i18n/legal.en';
import { legalFr } from '@/i18n/legal.fr';
import { LEGAL_POLICY_VERSION, PRIVACY_RETENTION } from '@/legal/legalContract';
import '@/styles/legal-credits.css';

const legal = locale === 'en-US' ? legalEn : legalFr;

const LEGAL_SECTIONS = [
  { id: 'mentions-legales', label: legal.legalNotice.title },
  { id: 'conditions-utilisation', label: legal.terms.title },
  { id: 'confidentialite', label: legal.privacy.title },
  { id: 'stockage-local', label: legal.storage.title },
  { id: 'droits-utilisateur', label: legal.rights.title },
  { id: 'riot-games', label: legal.riot.title },
] as const;

const POLICY_DATE_LABEL = formatDate(`${LEGAL_POLICY_VERSION}T00:00:00Z`, {
  dateStyle: 'long',
  timeZone: 'UTC',
});

function Paragraphs({ values }: { values: readonly string[] }) {
  return values.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

function SectionHeading({ index, title, id }: { index: number; title: string; id: string }) {
  return (
    <header className="document-page__section-heading">
      <span aria-hidden="true">{String(index).padStart(2, '0')}</span>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

export function LegalPage() {
  return (
    <PageShell width="content" className="document-page legal-page">
      <PageHeader
        title={legal.title}
        subtitle={legal.subtitle}
        leading={
          <Link className="ui-button ui-button--ghost" to={ROUTES.AUTH}>
            {legal.backToAuth}
          </Link>
        }
      />

      <dl className="document-page__metadata" aria-label={legal.metadata.onThisPage}>
        <div>
          <dt>{legal.metadata.lastUpdated}</dt>
          <dd>
            <time dateTime={LEGAL_POLICY_VERSION}>{POLICY_DATE_LABEL}</time>
          </dd>
        </div>
        <div>
          <dt>{legal.metadata.region}</dt>
          <dd>{legal.targetRegion}</dd>
        </div>
        <div>
          <dt>{legal.metadata.service}</dt>
          <dd>{legal.metadata.serviceValue}</dd>
        </div>
      </dl>

      <div className="document-page__layout">
        <aside className="document-page__aside">
          <nav className="document-page__toc" aria-labelledby="legal-toc-title">
            <p className="document-page__eyebrow">{legal.metadata.navigation}</p>
            <h2 id="legal-toc-title">{legal.metadata.onThisPage}</h2>
            <ol>
              {LEGAL_SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    {section.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="document-page__content">
          <Panel
            id="mentions-legales"
            className="document-page__section"
            aria-labelledby="mentions-legales-title"
          >
            <SectionHeading index={1} title={legal.legalNotice.title} id="mentions-legales-title" />
            <Paragraphs values={legal.legalNotice.paragraphs} />
            <p className="document-page__resource-link">
              <a href="https://github.com/Thanan71/LolRogue">
                {legal.legalNotice.repository}
                <span aria-hidden="true">↗</span>
              </a>
            </p>
          </Panel>

          <Panel
            id="conditions-utilisation"
            className="document-page__section"
            aria-labelledby="conditions-utilisation-title"
          >
            <SectionHeading index={2} title={legal.terms.title} id="conditions-utilisation-title" />
            <Paragraphs values={legal.terms.paragraphs} />
          </Panel>

          <Panel
            id="confidentialite"
            className="document-page__section"
            aria-labelledby="confidentialite-title"
          >
            <SectionHeading index={3} title={legal.privacy.title} id="confidentialite-title" />
            <Paragraphs values={legal.privacy.paragraphs} />
            <h3>{legal.metadata.retention}</h3>
            <dl className="legal-page__retention-list">
              <div>
                <dt>{legal.privacy.dailyPublic}</dt>
                <dd>{`${PRIVACY_RETENTION.publicDailyLeaderboardMonths} ${locale === 'en-US' ? 'months' : 'mois'} ${legal.privacy.maximum}`}</dd>
              </div>
              <div>
                <dt>{legal.privacy.diagnosticLogs}</dt>
                <dd>{`${PRIVACY_RETENTION.diagnosticLogDays} ${locale === 'en-US' ? 'days' : 'jours'} ${legal.privacy.maximum}`}</dd>
              </div>
              <div>
                <dt>{legal.privacy.reviewedReports}</dt>
                <dd>{`${PRIVACY_RETENTION.reviewedModerationReportMonths} ${locale === 'en-US' ? 'months' : 'mois'}`}</dd>
              </div>
              <div>
                <dt>{legal.privacy.accountData}</dt>
                <dd>{legal.accountRetention}</dd>
              </div>
              <div>
                <dt>{legal.privacy.guestData}</dt>
                <dd>{legal.guestRetention}</dd>
              </div>
            </dl>
          </Panel>

          <Panel
            id="stockage-local"
            className="document-page__section"
            aria-labelledby="stockage-local-title"
          >
            <SectionHeading index={4} title={legal.storage.title} id="stockage-local-title" />
            <p>{legal.storage.intro}</p>
            <ul className="legal-page__purpose-list">
              {legal.storagePurposes.map((purpose) => (
                <li key={purpose}>{purpose}</li>
              ))}
            </ul>
            <p>{legal.storage.telemetry}</p>
          </Panel>

          <Panel
            id="droits-utilisateur"
            className="document-page__section"
            aria-labelledby="droits-utilisateur-title"
          >
            <SectionHeading index={5} title={legal.rights.title} id="droits-utilisateur-title" />
            <Paragraphs values={legal.rights.paragraphs} />
          </Panel>

          <Panel
            id="riot-games"
            className="document-page__section document-page__section--notice"
            aria-labelledby="riot-games-title"
          >
            <SectionHeading index={6} title={legal.riot.title} id="riot-games-title" />
            <p className="legal-page__riot-notice">{legal.riotNotice}</p>
            <p>{legal.riot.detail}</p>
            <p className="document-page__resource-link">
              <a href="https://www.riotgames.com/en/legal">
                {legal.riot.officialPolicy}
                <span aria-hidden="true">↗</span>
              </a>
            </p>
          </Panel>
        </div>
      </div>

      <PageFooter>
        <Link className="ui-button ui-button--ghost" to={ROUTES.AUTH}>
          {legal.backToAuth}
        </Link>
        <Link className="ui-button ui-button--primary" to={ROUTES.MENU}>
          {fr.common.backToMenu}
        </Link>
      </PageFooter>
    </PageShell>
  );
}

import { Link } from 'react-router-dom';
import { PageFooter, PageHeader, PageShell, Panel } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import { legalFr } from '@/i18n/legal.fr';
import {
  LEGAL_POLICY_VERSION,
  LOCAL_STORAGE_PURPOSES,
  PRIVACY_RETENTION,
  PRODUCTION_LEGAL_GATE,
  RIOT_FAN_PROJECT_NOTICE,
} from '@/legal/legalContract';
import '@/styles/legal-credits.css';

const LEGAL_SECTIONS = [
  { id: 'mentions-legales', label: legalFr.legalNotice.title },
  { id: 'conditions-utilisation', label: legalFr.terms.title },
  { id: 'confidentialite', label: legalFr.privacy.title },
  { id: 'stockage-local', label: legalFr.storage.title },
  { id: 'droits-utilisateur', label: legalFr.rights.title },
  { id: 'riot-games', label: legalFr.riot.title },
] as const;

const POLICY_DATE_LABEL = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'UTC',
}).format(new Date(`${LEGAL_POLICY_VERSION}T00:00:00Z`));

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
        title={legalFr.title}
        subtitle="Conditions d’utilisation, traitement des données et propriété intellectuelle."
        leading={
          <Link className="ui-button ui-button--ghost" to={ROUTES.AUTH}>
            {legalFr.backToAuth}
          </Link>
        }
      />

      <dl className="document-page__metadata" aria-label="Informations sur cette politique">
        <div>
          <dt>Dernière mise à jour</dt>
          <dd>
            <time dateTime={LEGAL_POLICY_VERSION}>{POLICY_DATE_LABEL}</time>
          </dd>
        </div>
        <div>
          <dt>Zone concernée</dt>
          <dd>{PRODUCTION_LEGAL_GATE.targetRegion}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>Prototype gratuit et non commercial</dd>
        </div>
      </dl>

      <div className="document-page__layout">
        <aside className="document-page__aside">
          <nav className="document-page__toc" aria-labelledby="legal-toc-title">
            <p className="document-page__eyebrow">Navigation</p>
            <h2 id="legal-toc-title">Sur cette page</h2>
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
            <SectionHeading
              index={1}
              title={legalFr.legalNotice.title}
              id="mentions-legales-title"
            />
            <Paragraphs values={legalFr.legalNotice.paragraphs} />
            <p className="document-page__resource-link">
              <a href="https://github.com/Thanan71/LolRogue">
                {legalFr.legalNotice.repository}
                <span aria-hidden="true">↗</span>
              </a>
            </p>
          </Panel>

          <Panel
            id="conditions-utilisation"
            className="document-page__section"
            aria-labelledby="conditions-utilisation-title"
          >
            <SectionHeading
              index={2}
              title={legalFr.terms.title}
              id="conditions-utilisation-title"
            />
            <Paragraphs values={legalFr.terms.paragraphs} />
          </Panel>

          <Panel
            id="confidentialite"
            className="document-page__section"
            aria-labelledby="confidentialite-title"
          >
            <SectionHeading index={3} title={legalFr.privacy.title} id="confidentialite-title" />
            <Paragraphs values={legalFr.privacy.paragraphs} />
            <h3>Durées de conservation</h3>
            <dl className="legal-page__retention-list">
              <div>
                <dt>{legalFr.privacy.dailyPublic}</dt>
                <dd>{`${PRIVACY_RETENTION.publicDailyLeaderboardMonths} mois ${legalFr.privacy.maximum}`}</dd>
              </div>
              <div>
                <dt>{legalFr.privacy.diagnosticLogs}</dt>
                <dd>{`${PRIVACY_RETENTION.diagnosticLogDays} jours ${legalFr.privacy.maximum}`}</dd>
              </div>
              <div>
                <dt>{legalFr.privacy.reviewedReports}</dt>
                <dd>{`${PRIVACY_RETENTION.reviewedModerationReportMonths} mois`}</dd>
              </div>
              <div>
                <dt>{legalFr.privacy.accountData}</dt>
                <dd>{PRIVACY_RETENTION.accountData}</dd>
              </div>
              <div>
                <dt>{legalFr.privacy.guestData}</dt>
                <dd>{PRIVACY_RETENTION.guestData}</dd>
              </div>
            </dl>
          </Panel>

          <Panel
            id="stockage-local"
            className="document-page__section"
            aria-labelledby="stockage-local-title"
          >
            <SectionHeading index={4} title={legalFr.storage.title} id="stockage-local-title" />
            <p>{legalFr.storage.intro}</p>
            <ul className="legal-page__purpose-list">
              {LOCAL_STORAGE_PURPOSES.map((purpose) => (
                <li key={purpose}>{purpose}</li>
              ))}
            </ul>
            <p>{legalFr.storage.telemetry}</p>
          </Panel>

          <Panel
            id="droits-utilisateur"
            className="document-page__section"
            aria-labelledby="droits-utilisateur-title"
          >
            <SectionHeading index={5} title={legalFr.rights.title} id="droits-utilisateur-title" />
            <Paragraphs values={legalFr.rights.paragraphs} />
          </Panel>

          <Panel
            id="riot-games"
            className="document-page__section document-page__section--notice"
            aria-labelledby="riot-games-title"
          >
            <SectionHeading index={6} title={legalFr.riot.title} id="riot-games-title" />
            <p className="legal-page__riot-notice">{RIOT_FAN_PROJECT_NOTICE}</p>
            <p>{legalFr.riot.detail}</p>
            <p className="document-page__resource-link">
              <a href="https://www.riotgames.com/en/legal">
                {legalFr.riot.officialPolicy}
                <span aria-hidden="true">↗</span>
              </a>
            </p>
          </Panel>
        </div>
      </div>

      <PageFooter>
        <Link className="ui-button ui-button--ghost" to={ROUTES.AUTH}>
          {legalFr.backToAuth}
        </Link>
        <Link className="ui-button ui-button--primary" to={ROUTES.MENU}>
          {fr.common.backToMenu}
        </Link>
      </PageFooter>
    </PageShell>
  );
}

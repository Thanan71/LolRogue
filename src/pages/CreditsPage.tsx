import { Link } from 'react-router-dom';
import { PageFooter, PageHeader, PageShell, Panel } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { fr, locale } from '@/i18n/fr';
import '@/styles/legal-credits.css';

const CREDIT_GROUPS = [
  {
    id: 'credit-conception',
    eyebrow: fr.credits.creationEyebrow,
    section: fr.credits.design,
    entries: fr.credits.designEntries,
  },
  {
    id: 'credit-technologies',
    eyebrow: fr.credits.technologyEyebrow,
    section: fr.credits.technologies,
    entries: fr.credits.technologyEntries,
  },
  {
    id: 'credit-inspirations',
    eyebrow: fr.credits.universeEyebrow,
    section: fr.credits.inspiration,
    entries: fr.credits.inspirationEntries,
  },
  {
    id: 'credit-ressources',
    eyebrow: fr.credits.attributionEyebrow,
    section: fr.credits.assets,
    entries: fr.credits.assetEntries,
  },
] as const;

const creditNumberFormatter = new Intl.NumberFormat(locale, {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

export function CreditsPage() {
  return (
    <PageShell width="content" className="document-page credits-page">
      <PageHeader
        title={fr.credits.title}
        subtitle={fr.credits.pageSubtitle}
        leading={
          <Link className="ui-button ui-button--ghost" to={ROUTES.MENU}>
            {fr.common.backToMenu}
          </Link>
        }
      />

      <dl className="document-page__metadata" aria-label={fr.credits.projectInfoLabel}>
        <div>
          <dt>{fr.credits.nature}</dt>
          <dd>{fr.credits.communityProject}</dd>
        </div>
        <div>
          <dt>{fr.credits.model}</dt>
          <dd>{fr.credits.freeNonCommercial}</dd>
        </div>
        <div>
          <dt>{fr.credits.riotRelationship}</dt>
          <dd>{fr.credits.noAffiliation}</dd>
        </div>
      </dl>

      <div className="document-page__layout">
        <aside className="document-page__aside">
          <nav className="document-page__toc" aria-labelledby="credits-toc-title">
            <p className="document-page__eyebrow">{fr.credits.navigation}</p>
            <h2 id="credits-toc-title">{fr.credits.browse}</h2>
            <ol>
              {CREDIT_GROUPS.map((group, index) => (
                <li key={group.id}>
                  <a href={`#${group.id}`}>
                    <span aria-hidden="true">{creditNumberFormatter.format(index + 1)}</span>
                    {group.section}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="document-page__content">
          {CREDIT_GROUPS.map((group, index) => {
            const headingId = `${group.id}-title`;
            return (
              <Panel
                key={group.id}
                id={group.id}
                className="document-page__section credits-page__group"
                aria-labelledby={headingId}
              >
                <header className="document-page__section-heading credits-page__heading">
                  <span aria-hidden="true">{creditNumberFormatter.format(index + 1)}</span>
                  <div>
                    <p className="document-page__eyebrow">{group.eyebrow}</p>
                    <h2 id={headingId}>{group.section}</h2>
                  </div>
                </header>
                <ul className="credits-page__entries">
                  {group.entries.map((entry) => (
                    <li key={entry.name}>
                      <strong>{entry.name}</strong>
                      <span>{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}

          <aside className="credits-page__legal-note" aria-labelledby="credits-legal-title">
            <p className="document-page__eyebrow">{fr.credits.brandsEyebrow}</p>
            <h2 id="credits-legal-title">{fr.credits.independentProject}</h2>
            <p>{fr.credits.legal}</p>
            <Link to={ROUTES.LEGAL}>{fr.credits.legalLink}</Link>
          </aside>
        </div>
      </div>

      <PageFooter>
        <Link className="ui-button ui-button--primary" to={ROUTES.MENU}>
          {fr.common.backToMenu}
        </Link>
      </PageFooter>
    </PageShell>
  );
}

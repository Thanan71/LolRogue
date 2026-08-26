import { Link } from 'react-router-dom';
import { PageFooter, PageHeader, PageShell, Panel } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import '@/styles/legal-credits.css';

const CREDIT_GROUPS = [
  {
    id: 'credit-conception',
    eyebrow: 'Création',
    section: fr.credits.design,
    entries: [
      {
        name: 'Équipe LolRogue',
        detail: 'Conception du jeu, direction artistique, développement et équilibrage.',
      },
    ],
  },
  {
    id: 'credit-technologies',
    eyebrow: 'Socle technique',
    section: fr.credits.technologies,
    entries: [
      { name: 'React 19', detail: 'Interface et composants interactifs.' },
      { name: 'TypeScript', detail: 'Modèle de données et logique typée.' },
      { name: 'Vite', detail: 'Développement et production du client.' },
      { name: 'Zustand', detail: 'État local et orchestration des écrans.' },
      { name: 'Supabase', detail: 'Authentification, données et autorité serveur.' },
      { name: 'Vercel', detail: 'Hébergement de l’application.' },
    ],
  },
  {
    id: 'credit-inspirations',
    eyebrow: 'Univers',
    section: fr.credits.inspiration,
    entries: [
      { name: 'League of Legends', detail: 'Univers et personnages créés par Riot Games.' },
      {
        name: 'Lol Rogue',
        detail: 'Inspiration pour l’approche roguelike et la rejouabilité.',
      },
    ],
  },
  {
    id: 'credit-ressources',
    eyebrow: 'Attribution',
    section: fr.credits.assets,
    entries: [
      {
        name: 'Riot Games — Data Dragon',
        detail: 'Portraits de champions, icônes de compétences et données de référence.',
      },
    ],
  },
] as const;

export function CreditsPage() {
  return (
    <PageShell width="content" className="document-page credits-page">
      <PageHeader
        title={fr.credits.title}
        subtitle="Les personnes, technologies et univers qui ont rendu cette aventure possible."
        leading={
          <Link className="ui-button ui-button--ghost" to={ROUTES.MENU}>
            {fr.common.backToMenu}
          </Link>
        }
      />

      <dl className="document-page__metadata" aria-label="Informations sur le projet">
        <div>
          <dt>Nature</dt>
          <dd>Projet communautaire</dd>
        </div>
        <div>
          <dt>Modèle</dt>
          <dd>Gratuit et non commercial</dd>
        </div>
        <div>
          <dt>Relation avec Riot Games</dt>
          <dd>Sans affiliation ni approbation</dd>
        </div>
      </dl>

      <div className="document-page__layout">
        <aside className="document-page__aside">
          <nav className="document-page__toc" aria-labelledby="credits-toc-title">
            <p className="document-page__eyebrow">Navigation</p>
            <h2 id="credits-toc-title">Parcourir les crédits</h2>
            <ol>
              {CREDIT_GROUPS.map((group, index) => (
                <li key={group.id}>
                  <a href={`#${group.id}`}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
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
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
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
            <p className="document-page__eyebrow">À propos des marques</p>
            <h2 id="credits-legal-title">Un projet de fans indépendant</h2>
            <p>{fr.credits.legal}</p>
            <Link to={ROUTES.LEGAL}>Consulter les informations légales et de confidentialité</Link>
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

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, PageHeader, PageShell, Panel, StateView, TextInput } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';

const RULES = [
  {
    category: 'Boucle',
    title: '1. Choisir',
    body: 'Compose une équipe et sélectionne jusqu’à trois runes. Chaque description annonce son déclencheur et sa valeur avant validation.',
  },
  {
    category: 'Boucle',
    title: '2. Avancer',
    body: 'Sur la carte, seuls les nœuds marqués accessibles peuvent être choisis. Un choix ferme les branches sœurs.',
  },
  {
    category: 'Boucle',
    title: '3. Résoudre',
    body: 'Termine le combat ou la rencontre ouverte. Les récompenses sont appliquées une seule fois avant le retour à la carte.',
  },
  {
    category: 'Boucle',
    title: '4. Améliorer',
    body: 'Dépense l’or dans les boutiques et choisis objets, recrues, sorts ou augments après avoir lu leur effet chiffré.',
  },
  {
    category: 'Boucle',
    title: '5. Terminer et sauvegarder',
    body: 'Traverse les sorties des six biomes puis bats le boss final. Une run connectée n’accorde sa progression qu’après vérification serveur.',
  },
  {
    category: 'Combat',
    title: 'Cible',
    body: 'Choisis une action, puis une cible autorisée. Les portraits sélectionnables sont annoncés comme boutons ; une cible invalide bloque l’action.',
  },
  {
    category: 'Combat',
    title: 'Coût et recharge',
    body: 'Le coût en PM et la recharge sont visibles sur chaque sort. Un sort sans assez de PM ou encore en recharge est désactivé.',
  },
  {
    category: 'Combat',
    title: 'Ordre des tours',
    body: 'La vitesse détermine l’ordre. Pendant ton tour, choisis une action et valide-la ; les ennemis jouent automatiquement.',
  },
  {
    category: 'Combat',
    title: 'Statuts',
    body: 'Les buffs, affaiblissements, contrôles et dégâts persistants apparaissent sur les combattants et dans le journal.',
  },
  {
    category: 'Combat',
    title: 'Autoplay',
    body: 'Désactivé par défaut, il choisit les actions à ta place. Tu peux l’activer ou le couper depuis l’en-tête du combat.',
  },
  {
    category: 'Progression',
    title: 'Runes',
    body: 'Bonus choisis au départ et actifs pendant la run selon leur condition : dégâts, sort lancé, élimination ou seuil de PV.',
  },
  {
    category: 'Progression',
    title: 'Objets',
    body: 'Équipement d’un champion. La fiche affiche les statistiques et effets exacts avant achat ou attribution.',
  },
  {
    category: 'Progression',
    title: 'Augments',
    body: 'Règles d’équipe proposées entre les biomes. Leur description chiffrée est affichée avant le choix définitif.',
  },
  {
    category: 'Modes',
    title: 'Run normale',
    body: 'Utilise ta difficulté et tes choix. En invité, la run et les réglages restent uniquement sur cet appareil et ne donnent pas de progression authentifiée.',
  },
  {
    category: 'Modes',
    title: 'Défi quotidien',
    body: 'Même graine, carte, difficulté et score pour tous pendant la journée UTC. Un compte connecté est requis pour le classement en ligne vérifié.',
  },
] as const;

export function RulesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(fr.rules.all);
  const categories = [fr.rules.all, ...new Set(RULES.map((rule) => rule.category))];
  const visibleRules = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    return RULES.filter(
      (rule) =>
        (category === fr.rules.all || rule.category === category) &&
        (!needle || `${rule.title} ${rule.body}`.toLocaleLowerCase('fr').includes(needle)),
    );
  }, [category, query]);

  return (
    <PageShell width="wide" className="rules-page">
      <PageHeader
        title={fr.rules.title}
        subtitle={fr.rules.subtitle}
        leading={
          <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
            {fr.rules.back}
          </Button>
        }
      />

      <Panel className="rules-page__modes" aria-labelledby="rules-loop-title">
        <h2 id="rules-loop-title">{fr.rules.loopTitle}</h2>
        <p>{fr.rules.loopSummary}</p>
      </Panel>

      <Panel className="rules-page__filters-panel" aria-label={fr.rules.filters}>
        <div className="rules-page__filters">
          <Field label={<label htmlFor="rules-search">{fr.rules.search}</label>}>
            <TextInput
              id="rules-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <Field label={<label htmlFor="rules-category">{fr.rules.category}</label>}>
            <select
              id="rules-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>

      <p className="rules-page__count" role="status" aria-live="polite">
        {fr.rules.count(visibleRules.length)}
      </p>
      {visibleRules.length > 0 ? (
        <div className="rules-page__grid">
          {visibleRules.map((rule) => (
            <article key={rule.title} className="ui-panel rules-page__rule">
              <span>{rule.category}</span>
              <h2>{rule.title}</h2>
              <p>{rule.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <StateView
          kind="empty"
          title={fr.rules.emptyTitle}
          actionLabel={fr.rules.resetFilters}
          onAction={() => {
            setQuery('');
            setCategory(fr.rules.all);
          }}
        >
          {fr.rules.emptyDetail}
        </StateView>
      )}
    </PageShell>
  );
}

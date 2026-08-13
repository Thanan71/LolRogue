const repository = process.env.GITHUB_REPOSITORY?.trim();
const token = process.env.GITHUB_TOKEN?.trim();

if (!repository || !token) {
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.');
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);

const issue = ({ code, title, priority, size, sprint, problem, actions, acceptance, note }) => ({
  title: `${code} — ${title}`,
  body: [
    '## Métadonnées',
    `- **Priorité :** ${priority}`,
    `- **Taille :** ${size}`,
    ...(sprint ? [`- **Sprint recommandé :** ${sprint}`] : []),
    '- **Source :** `TODO.md` (réaudit du 13 août 2026)',
    ...(note ? ['', `> ${note}`] : []),
    ...(problem ? ['', '## Problème / objectif', problem] : []),
    '',
    '## Actions',
    ...actions.map((action) => `- [ ] ${action}`),
    ...(acceptance?.length
      ? ['', '## Acceptation', ...acceptance.map((item) => `- ${item}`)]
      : []),
    '',
    '---',
    '_Issue synchronisée depuis le backlog courant de `TODO.md`._',
  ].join('\n'),
});

const issues = [
  issue({
    code: 'P0-BAL-01',
    title: 'Corriger les incohérences fondamentales du moteur de combat',
    priority: 'P0 — bloquant',
    size: 'L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      'Le tuning numérique n’est pas fiable tant que les cooldowns, la persistance du mana, le ciblage des sorts composites, Electrocute et l’ordre de certains effets ne respectent pas un contrat déterministe commun entre UI et authority.',
    actions: [
      'Considérer un sort prêt lorsque `cooldown <= 0` et clamper chaque tick avec `Math.max(0, cooldown - 1)`.',
      'Remplacer les cooldowns en secondes par des `cooldownTurns` entiers ; point de départ à mesurer : Q/W/E entre 2 et 5 tours, R entre 6 et 10 tours.',
      'Ajouter `initialMpOverrides` au même niveau que `initialHpOverrides`, côté UI et moteur autoritaire, avec clamp `0..maxMp`.',
      'Formaliser l’attrition mana ; point de départ à tester : récupération de 20–30 % des MP max après victoire et 100 % au repos.',
      'Ajouter une validation catalogue cible/effet et corriger les cinq sorts composites `Self` ayant une partie hostile.',
      'Faire respecter le seuil `threshold: 3` d’Electrocute.',
      'Tester explicitement l’ordre execute/dégâts et retenir une seule règle documentée pour Garen/Jinx.',
      'Empêcher la double évaluation des runes `damage_dealt` sur critique et exclure les dégâts bruts des multiplicateurs de pénétration.',
      'Ajouter les régressions équivalentes dans les parcours UI et authority.',
    ],
    acceptance: [
      'Zéro sort bloqué définitivement par un cooldown négatif.',
      'Les MP de fin du combat N deviennent les MP initiaux du combat N+1, plus la récupération documentée.',
      'Zéro effet hostile accepté sans cible hostile résoluble.',
      'Electrocute, execute et critique sont couverts par des tests déterministes.',
      'Parité source/bundle authority validée sur ces scénarios.',
    ],
  }),
  issue({
    code: 'P0-BAL-02',
    title: 'Remplacer la fausse simulation de balance par de vraies runs',
    priority: 'P0 — bloquant',
    size: 'L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      '`simulateContentBalance()` ne joue pas réellement une run : pas de choix de route, de `BattleManager`, de persistance PV/MP, d’achats, de recrutements ni de taux de victoire. La gate `balance:check` donne donc une assurance excessive.',
    actions: [
      'Créer une `BalancePolicy` versionnée qui renvoie une seule commande légale depuis le snapshot public de la run.',
      'Construire `simulateAuthorityCohort()` autour de `replayAuthorityRun()` sur le bundle Edge courant, puis vérifier terminalement avec `verifyAuthorityRun()`.',
      'Ajouter limites de commandes/temps, détection de deadlock et reproduction de la seed pour chaque échec.',
      'Stratifier les cohortes par difficulté × taille/composition d’équipe × maîtrise/runes/enhancements × politique.',
      'Produire victoire + intervalle Wilson, vagues/biomes p10-p50-p90, mort, rounds, PV/MP, dégâts/soins/CC, économie, achats, recrues, drops et augments.',
      'Indexer les baselines par moteur, `contentHash`, version du modèle et version de politique ; archiver seulement les traces extrêmes utiles.',
      'Exécuter 30–50 seeds par cellule en PR et 500–1 000 en nightly/release.',
      'Lire versions gameplay/hash et score Daily depuis des sources machine uniques.',
      'Corriger `docs/content-balance.md` et renommer les métriques qui ne sont pas réellement des simulations de runs.',
      'Ajouter les gates statistiques initiales définies dans le TODO sans figer les taux de victoire complets avant playtests humains.',
    ],
    acceptance: [
      'Zéro crash, deadlock, non-déterminisme ou divergence source/bundle.',
      'Easy ≥ Normal ≥ Hard avec tolérance statistique et cohortes stratifiées.',
      'Les régressions significatives exigent un diff et une baseline explicitement approuvée.',
    ],
  }),
  issue({
    code: 'P0-BAL-03',
    title: 'Garantir l’égalité des règles Daily et des départs comparables',
    priority: 'P0 — bloquant',
    size: 'M/L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      'Le Daily neutralise partiellement la progression mais la mastery, les slots de starters et la multiplication implicite des keystones rendent encore des comptes de progression différente non comparables.',
    actions: [
      'Forcer `mastery_snapshot = {}` et `enhancement_snapshot = {}` dans le Daily côté DB et moteur.',
      'Ajouter un contrat « compte neuf = compte maxé » à seed et commandes identiques jusqu’au score terminal.',
      'Donner le même nombre de starters à toutes les runs comparables ; point de départ : deux en Normal, un starter normalisé en Daily.',
      'Transformer la maîtrise en largeur de roster, reroll ou cosmétique plutôt qu’en avantage de taille d’équipe pour les modes classés.',
      'Si 1/2/3 starters sont conservés, séparer cohortes/classements et tester un budget ennemi autour de ×1 / ×1,55 / ×2.',
      'Affecter les runes par champion avec budget partagé, ou rendre leur effet unique au niveau équipe.',
      'Réduire Grasp ou le réinitialiser par combat ; point de départ : +2 DEF/+15 PV, cinq déclenchements maximum.',
    ],
    acceptance: [
      'Deux comptes de progression opposée produisent exactement le même Daily officiel.',
      'Aucun classement n’agrège des runs à budgets de départ différents sans stratification.',
    ],
  }),
  issue({
    code: 'P0-BAL-04',
    title: 'Rétablir la hiérarchie augments/drops et couper le snowball économique',
    priority: 'P0 — bloquant',
    size: 'M/L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      'Les bonus plats Silver peuvent dépasser les Gold en valeur réelle, les augments économiques dominent la puissance et le score Daily, et les drops donnent trop de légendaires/tier 2.',
    actions: [
      'Recalibrer les Silver autour de +7 ATK, +5 DEF, +7 AP, +90 PV et +12–15 MS.',
      'Recalibrer Gold autour de +12–15 % et Prism autour de +22–25 %.',
      'Ramener l’or/combat Silver/Gold/Prism autour de 15–20 / 35–45 / 60–75 et plafonner la remise Prism à 10 %.',
      'Utiliser une table de rareté explicite : common 55 %, uncommon 25 %, epic 15 %, legendary 5 %.',
      'Gater le tier 2 par biome : Top 0 %, Jungle/Mid 10 %, Bot 20 %, River 30 %, boss final garanti ou table dédiée.',
      'Retirer le bonus de drop Hard ou le remplacer par une récompense ne renforçant pas la run en cours.',
      'Ajouter des tests statistiques de rendement, rareté, valeur et domination de choix.',
    ],
    acceptance: [
      'Chaque rang d’augment a une valeur attendue supérieure au rang précédent sans rendre l’économie dominante.',
      'La distribution observée sur 10 000 drops respecte la table et les gates biome.',
    ],
  }),
  issue({
    code: 'P1-SEC-01',
    title: 'Activer la protection contre les mots de passe compromis',
    priority: 'P1 — important',
    size: 'S',
    sprint: 'C — sécurité et exploitation',
    note: 'Le TODO indique que cette tâche est différée explicitement tant que l’option payante n’est pas souhaitée.',
    actions: [
      'Activer Leaked Password Protection dans Supabase Auth.',
      'Vérifier la politique minimale de longueur/complexité et les messages UI.',
      'Tester inscription et changement de mot de passe avec un mot de passe refusé.',
      'Documenter le réglage dans les runbooks d’environnement.',
      'Ajouter ce paramètre à la checklist de création/restauration d’un projet Supabase.',
    ],
    acceptance: ['L’advisor `auth_leaked_password_protection` ne doit plus apparaître.'],
  }),
  issue({
    code: 'P1-SEC-03',
    title: 'Clarifier les tables server-only dans `public`',
    priority: 'P1 — important',
    size: 'M/L',
    sprint: 'F — fiabilité produit et exploitation',
    problem:
      'Plusieurs tables RLS sans policy sont actuellement protégées par absence de grants clients, mais leur frontière “Data API vs interne” reste implicite.',
    actions: [
      'Documenter pour chaque table si elle est exposée Data API ou interne.',
      'Pour les tables purement internes, évaluer un déplacement vers un schéma `private` non exposé.',
      'À défaut, conserver `RLS + aucun grant` et ajouter un test de privilèges.',
      'Configurer une allowlist des advisors INFO volontairement acceptés avec raison.',
      'Ne jamais ignorer globalement `rls_enabled_no_policy`.',
    ],
  }),
  issue({
    code: 'P1-RUN-02',
    title: 'Améliorer l’UX d’une progression rejetée',
    priority: 'P1 — important',
    size: 'M',
    sprint: 'F — fiabilité produit et exploitation',
    actions: [
      'Mapper les `rejection_code` serveur vers des messages français actionnables.',
      'Distinguer tentative expirée, trace invalide, conflit de version, choix manquant, séquence incorrecte et erreur serveur retryable.',
      'Ne pas afficher un message technique brut comme seul feedback.',
      'Conserver un détail technique dépliable/copiable pour support.',
      'Pour une erreur terminale, expliquer qu’aucune récompense n’est créditée et pourquoi le retry ne change rien.',
      'Pour une erreur retryable, proposer le retry sans reconstruire la commande.',
      'Tester Game Over + refresh + retour menu après rejet.',
    ],
  }),
  issue({
    code: 'P1-RUN-03',
    title: 'Définir le traitement des attempts affectées par un bug client',
    priority: 'P1 — important',
    size: 'M',
    sprint: 'F — fiabilité produit et exploitation',
    problem: 'Décision produit + sécurité à formaliser pour les runs rejetées lors d’un incident client confirmé.',
    actions: [
      'Formaliser la règle : aucune récompense rétroactive sans preuve serveur suffisante.',
      'Décider si une compensation non liée au résultat de la run est possible pour les utilisateurs affectés.',
      'Garder une liste d’incidents par version moteur et fenêtre temporelle.',
      'Ne jamais “réparer” une trace rejetée en insérant manuellement un résultat supposé.',
      'Documenter la procédure support et l’audit des compensations éventuelles.',
    ],
  }),
  issue({
    code: 'P1-BAL-01',
    title: 'Recalibrer AoE, CC, difficulté et IA avant les champions',
    priority: 'P1 — important',
    size: 'L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      'Les règles génériques amplifient trop l’AoE/CC, rendent les ultimes disponibles trop tôt, utilisent une IA non contextuelle et appliquent la difficulté à des statistiques qui ne devraient pas toutes scaler.',
    actions: [
      'Limiter l’AoE standard à trois cibles, ou 100 % cible principale + 50 % secondaires avec plafond de 300 % total.',
      'Limiter le hard CC à un tour et empêcher plus de deux actions perdues sur quatre rounds.',
      'Rendre les ultimes indisponibles avant le round 3.',
      'Ajouter une IA contextuelle pour soins, boucliers, execute, AoE et choix de cibles.',
      'Multiplier les PV par le facteur de difficulté et les dégâts par sa racine ; laisser les autres stats inchangées sauf décision explicite.',
      'Décider le rôle de la vitesse d’attaque et de la portée, ou retirer/renommer les bonus sans effet.',
      'Plafonner les slows cumulés en dessous de 99 %.',
      'Après les règles système : recalibrer Darius, Malphite, Soraka, Garen/Jinx, l’AP naturel et les rangs de sorts selon les points du TODO.',
      'Ne pas buff Warwick avant correction de son E et de l’IA.',
    ],
    acceptance: [
      'Aucun champion ne reste à 0 ou 100 % sur une matrice large uniquement à cause d’une règle générique.',
      'Les rapports exposent DPR, soins effectifs, shield absorbé, mana consommée et actions supprimées par CC.',
      'Tout tuning champion est justifié par un diff de cohorte après correctifs système.',
    ],
  }),
  issue({
    code: 'P1-BAL-02',
    title: 'Recalibrer carte, shop, repos, trésors et recrutement',
    priority: 'P1 — important',
    size: 'L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    problem:
      'Les routes ont des écarts importants de combats/élites/shops/recrues, le shop est souvent peu abordable, le repos scale trop bien avec l’équipe, les trésors sont trop rentables et le recrutement tardif est pénalisant.',
    actions: [
      'Contraindre les chemins à un écart maximal de trois combats et une élite ; équilibrer la valeur attendue par colonne/risque.',
      'Garantir un shop avant la fin Jungle et une recrue avant la fin Mid.',
      'Tester une courbe biome monotone Top 1, Jungle 1,1, Mid 1,2, Bot 1,25, River 1,4, Base 1,6 puis valider par TTK/perte de PV.',
      'Donner aux élites un budget constant d’environ +35–45 % et une récompense +50 %.',
      'Recaler composants 100–250 gold, BF Sword 500–650 et recrues 150–300 ; implémenter de vraies recettes ou retirer le faux signal de craft.',
      'Faire varier le repos selon l’effectif avec les formules de départ du TODO.',
      'Réduire la valeur des trésors ou proposer un choix exclusif or/item avec contrepartie.',
      'Éviter de repondérer automatiquement un événement négatif inabordable vers une issue positive.',
      'Recruter au niveau `max(runLevel + 1, médianeEquipe - 1)`.',
      'Remplacer la division des candies par taille finale par un budget de compte fixe et une part liée à la participation.',
      'Clarifier la terminologie boss/fin de biome.',
    ],
    acceptance: [
      'Une route ne décide plus à elle seule de plusieurs niveaux ou achats d’écart.',
      'Le joueur médian peut prendre au moins une décision d’achat utile avant la première sortie concernée.',
      'Recruter tard n’est ni un piège combat immédiat ni une pénalité de maîtrise.',
      'Le repos reste au plus 2–3× plus efficace qu’une potion par gold.',
    ],
  }),
  issue({
    code: 'P2-TEST-02',
    title: 'Ajouter des seeds de test variables en complément de la seed fixe',
    priority: 'P2 — qualité',
    size: 'S/M',
    sprint: 'E — robustesse locale',
    actions: [
      'Garder une seed fixe dans la CI principale pour reproductibilité.',
      'Ajouter une job planifiée avec plusieurs seeds aléatoires conservées dans les logs.',
      'En cas d’échec, imprimer la seed exacte pour reproduction locale.',
    ],
  }),
  issue({
    code: 'P2-TEST-03',
    title: 'Tester avec `skipLibCheck=false` dans une gate dédiée',
    priority: 'P2 — qualité',
    size: 'S/M',
    sprint: 'E — robustesse locale',
    actions: [
      'Garder éventuellement `skipLibCheck=true` pour le cycle rapide.',
      'Ajouter périodiquement/CI une compilation avec `skipLibCheck=false` pour détecter les incompatibilités React 19 / TS7 / Node / Supabase.',
      'Documenter toute exception impossible à corriger côté projet.',
    ],
  }),
  issue({
    code: 'P2-BAL-01',
    title: 'Confronter les cohortes autoritaires aux playtests et au terrain',
    priority: 'P2 — qualité',
    size: 'M/L',
    sprint: 'B — rendre l’équilibrage mesurable et comparable',
    actions: [
      'Définir au moins deux politiques automatisées distinctes — sûre et économique.',
      'Organiser des playtests humains par difficulté, taille d’équipe et expérience ; fixer ensuite les bandes Easy/Normal/Hard.',
      'Construire une vue admin agrégée depuis runs vérifiées/attempts, groupée par date, ruleset, difficulté, mode, composition et niveau méta.',
      'Ne jamais mélanger plusieurs rulesets dans une même moyenne et contrôler composition/taille avant d’attribuer un écart à un champion.',
      'Appliquer `n >= 30`, intervalles d’incertitude et aucune exposition de user ID, seed ou journal de commandes.',
      'Ajouter seulement en opt-in les mesures non nécessaires au service et définir leur rétention avant collecte.',
      'Comparer simulation et terrain sur victoire, biome de mort, économie, pick rate et performance conditionnelle.',
      'Exiger une décision produit et une baseline versionnée pour toute dérive volontaire importante.',
    ],
    acceptance: [
      'Toute décision de tuning cite une cohorte autoritaire reproductible et un signal humain/terrain compatible avec taille d’échantillon et intervalle.',
    ],
  }),
  issue({
    code: 'P2-CI-01',
    title: 'Ajouter protection de branche et required checks vérifiables',
    priority: 'P2 — qualité',
    size: 'S/M',
    actions: [
      'Vérifier que `main` exige réellement `validate`, `e2e`, `database`, `clean-room` avant merge.',
      'Interdire le merge avec check annulé/neutralisé.',
      'Exiger branche à jour ou merge queue selon le workflow choisi.',
      'Garder les actions épinglées par SHA et automatiser leur mise à jour contrôlée.',
      'Ajouter `concurrency` pour annuler les anciens runs d’une PR sans annuler une release en cours.',
    ],
  }),
  issue({
    code: 'P2-CI-02',
    title: 'Séparer les gates par responsabilité',
    priority: 'P2 — qualité',
    size: 'M',
    sprint: 'G — architecture et produit',
    problem:
      '`npm run check` est robuste mais regroupe format, lint, types, audit, couverture, assets, build et production-build ; la CI est donc peu diagnostique et répète du travail.',
    actions: [
      'Garder une commande locale tout-en-un.',
      'En CI, produire des checks nommés : static, unit, security, build/assets, DB, browser.',
      'Éviter de reconstruire les mêmes artefacts quand un artefact signé du même SHA peut être réutilisé sans réduire l’isolation.',
      'Conserver `clean-room` comme validation indépendante sans cache applicatif.',
    ],
  }),
  issue({
    code: 'P2-WEB-02',
    title: 'Fuzz de réhydratation et stockage navigateur',
    priority: 'P2 — qualité',
    size: 'M',
    sprint: 'E — robustesse locale',
    actions: [
      'Générer des payloads localStorage tronqués, anciens, surdimensionnés et mal typés.',
      'Vérifier qu’aucun payload ne peut restaurer un état authority impossible.',
      'Tester quotas, `SecurityError` et stockage indisponible sur toutes les clés persistées.',
      'Ajouter une version et une stratégie de purge pour les caches de tutoriel et autres clés annexes.',
    ],
  }),
  issue({
    code: 'P2-OBS-01',
    title: 'Définir des SLI/SLO techniques',
    priority: 'P2 — qualité',
    size: 'M',
    sprint: 'F — fiabilité produit et exploitation',
    problem:
      'Formaliser les seuils et la rétention pour start/seal/verification, délai de vérification, retries, erreurs Auth/PostgREST, assets cassés et réhydratation.',
    actions: [
      'Définir les seuils d’alerte.',
      'Ne collecter que des métriques techniques minimisées.',
      'Ajouter `engineVersion`, ruleset et code sans journal de gameplay complet.',
      'Documenter la rétention et l’accès opérateur.',
    ],
  }),
  issue({
    code: 'P2-OPS-01',
    title: 'Tester les runbooks sur une vraie restauration isolée',
    priority: 'P2 — qualité',
    size: 'L',
    sprint: 'D — performance / dette',
    note: 'La répétition locale est déjà réussie ; la preuve distante hébergée reste le seul point ouvert du bloc.',
    actions: [
      'Restaurer un backup sur un projet Supabase isolé distant et conserver la preuve de l’exercice.',
    ],
    acceptance: [
      'La restauration hébergée confirme migrations, Auth, RLS, cron, functions et configuration nécessaire, avec RPO/RTO documentés.',
    ],
  }),
  issue({
    code: 'P2-DOC-01',
    title: 'Recalculer tous les statuts après le réaudit',
    priority: 'P2 — qualité',
    size: 'M',
    sprint: 'F — fiabilité produit et exploitation',
    actions: [
      '`docs/beta-readiness.md` : repasser les gates ouvertes en bloqué.',
      '`docs/feature-status.md` : ajouter “risque réouvert” / “validation live requise”.',
      '`docs/dependency-audit.md` : aligner les claims avec le runtime/types réellement déployés.',
      '`docs/legal-and-privacy.md` : aligner la rétention sociale avec l’état réel du cron.',
      '`docs/operations.md` : ajouter la vérification advisors/grants/cron au runbook.',
      '`docs/data-and-persistence.md` : documenter les tests de contrat réels des repositories.',
      'Relier chaque claim critique à une commande ou un test exécutable.',
    ],
  }),
  issue({
    code: 'P3-PROD-01',
    title: 'Historique de runs plus exploitable',
    priority: 'P3 — évolution',
    size: 'M',
    sprint: 'G — architecture et produit',
    actions: [
      'Ajouter filtres victoire/défaite, difficulté, mode et moteur/ruleset.',
      'Afficher clairement “legacy / non comparable”.',
      'Ajouter le détail de rejet technique uniquement pour propriétaire/admin.',
      'Ajouter pagination par curseur si le volume devient significatif.',
      'Éviter de charger toutes les relations lourdes pour une simple liste.',
    ],
  }),
  issue({
    code: 'P3-PROD-02',
    title: 'Internationalisation anglaise complète',
    priority: 'P3 — évolution',
    size: 'L',
    sprint: 'G — architecture et produit',
    actions: [
      'Transformer le dictionnaire français actuel en vraie sélection de locale.',
      'Ajouter `en` avec couverture de toutes les pages et contenus.',
      'Tester nombres, dates, pluriels, aria-labels et textes de domaine.',
      'Conserver le français comme fallback explicite.',
    ],
  }),
  issue({
    code: 'P3-PROD-03',
    title: 'PWA/offline : décider au lieu de laisser un entre-deux',
    priority: 'P3 — évolution',
    size: 'M/L',
    sprint: 'G — architecture et produit',
    problem: 'Le contrat actuel garantit seulement l’invité déjà chargé hors ligne.',
    actions: [
      'Décider officiellement : pas de PWA, ou PWA invitée.',
      'Si PWA : cache versionné, invalidation assets, offline shell et mises à jour sûres.',
      'Ne jamais permettre de démarrer une run authentifiée hors ligne.',
      'Tester l’upgrade du service worker sans casser une run active.',
    ],
  }),
  issue({
    code: 'P3-PROD-04',
    title: 'Enrichissement de contenu avec gate de support moteur',
    priority: 'P3 — évolution',
    size: 'continue',
    sprint: 'G — architecture et produit',
    actions: [
      'Aucun champion/rune/augment/item/encounter ajouté sans handler supporté.',
      'Ajouter un test de catalogue qui bloque toute mécanique non implémentée.',
      'Versionner chaque changement affectant le replay / Daily.',
      'Mesurer les courbes de difficulté après chaque lot de contenu.',
      'Conserver les anciens bundles nécessaires aux attempts ouvertes.',
    ],
  }),
  issue({
    code: 'P3-A11Y-01',
    title: 'Validation humaine avant bêta',
    priority: 'P3 — évolution',
    size: 'M',
    actions: [
      'NVDA + Firefox : parcours Auth → Starter → Map → Combat → Game Over.',
      'VoiceOver + Safari macOS.',
      'VoiceOver + Safari iOS sur petit écran.',
      'Zoom 200/400 % et navigation clavier réelle.',
      'Consigner les défauts dans des issues dédiées et bloquer la release sur tout défaut empêchant le parcours.',
    ],
  }),
  issue({
    code: 'P3-LEGAL-01',
    title: 'Fermer les blockers externes de diffusion',
    priority: 'P3 — évolution / externe',
    size: 'externe / non estimable',
    actions: [
      'Compléter identité/adresse éditeur et directeur de publication.',
      'Publier/tester un canal privé pour les demandes de droits.',
      'Vérifier région Supabase, DPA, transferts et sous-traitants.',
      'Obtenir une revue RGPD/ePrivacy professionnelle.',
      'Obtenir une analyse écrite de compatibilité avec la propriété intellectuelle Riot.',
      'Interdire monétisation/publicité/sponsoring tant que ces points ne sont pas clos.',
    ],
  }),
];

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }
  return payload;
}

async function listRepositoryIssues() {
  const result = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`);
    result.push(...batch.filter((item) => !item.pull_request));
    if (batch.length < 100) break;
  }
  return result;
}

const existingIssues = await listRepositoryIssues();
let created = 0;
let refreshed = 0;
let unchanged = 0;

for (const definition of issues) {
  const existing = existingIssues.find((item) => item.title === definition.title);
  if (!existing) {
    const createdIssue = await github(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: definition.title, body: definition.body }),
    });
    existingIssues.push(createdIssue);
    created += 1;
    console.log(`created #${createdIssue.number}: ${definition.title}`);
    continue;
  }

  if (existing.state === 'open' && existing.body === definition.body) {
    unchanged += 1;
    console.log(`unchanged #${existing.number}: ${definition.title}`);
    continue;
  }

  const updatedIssue = await github(`/repos/${owner}/${repo}/issues/${existing.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: definition.title, body: definition.body, state: 'open' }),
  });
  refreshed += 1;
  console.log(`refreshed #${updatedIssue.number}: ${definition.title}`);
}

console.log(`TODO issue sync complete: ${created} created, ${refreshed} refreshed, ${unchanged} unchanged.`);

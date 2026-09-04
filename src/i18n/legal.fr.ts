export const legalFr = {
  title: 'Informations légales et confidentialité',
  subtitle: 'Conditions d’utilisation, traitement des données et propriété intellectuelle.',
  version: 'Version du',
  legalNotice: {
    title: 'Mentions légales',
    paragraphs: [
      'LolRogue est un prototype communautaire gratuit et non commercial, publié depuis la France. Le responsable éditorial est le mainteneur du dépôt LolRogue. Le canal de contact public actuel est le dépôt GitHub ; aucune donnée personnelle ne doit être publiée dans une issue.',
      'Hébergement applicatif : Vercel. Authentification et base de données : Supabase. Ces prestataires peuvent traiter les données techniques nécessaires à la fourniture du service selon la région configurée par l’exploitant.',
    ],
    repository: 'Dépôt et contact technique',
  },
  terms: {
    title: 'Conditions d’utilisation',
    paragraphs: [
      'Le service est fourni gratuitement, sans garantie de disponibilité ni de conservation d’une progression de test. Toute tentative de falsification de score, contournement de sécurité, harcèlement ou usage automatisé abusif peut entraîner l’invalidation d’un score ou la suspension de l’accès.',
      'Le projet ne vend aucun contenu et n’autorise aucune exploitation commerciale. Un audit juridique externe et une analyse d’autorisation Riot restent obligatoires avant toute diffusion commerciale ou lancement public présenté comme juridiquement validé.',
    ],
  },
  privacy: {
    title: 'Confidentialité',
    paragraphs: [
      'Pour un compte connecté, le service traite l’adresse e-mail d’authentification, le profil, les préférences de classement, la progression, les parties, leurs commandes et les métriques de combat. Ces données servent à authentifier, reprendre et vérifier les parties, attribuer la progression, sécuriser le classement et diagnostiquer les erreurs.',
      'Le classement ne publie jamais l’e-mail, le nom de compte ou l’identifiant joueur. Il affiche un alias choisi ou un pseudonyme anonyme, les statistiques classées et, pour le classement global, l’avatar facultatif du profil. L’utilisateur peut retirer tous ses scores publics depuis les réglages.',
    ],
    dailyPublic: 'Daily public',
    diagnosticLogs: 'Logs techniques',
    reviewedReports: 'Signalements traités',
    accountData: 'Données de compte',
    guestData: 'Données invitées',
    maximum: 'maximum',
  },
  storage: {
    title: 'Stockage local, cookies et télémétrie',
    intro:
      'LolRogue n’intègre actuellement ni publicité, ni outil d’analyse comportementale, ni cookie marketing. Le navigateur conserve uniquement les données fonctionnelles suivantes :',
    telemetry:
      'La journalisation distante est désactivée par défaut. Elle ne peut être activée en production sans finalité documentée, information des utilisateurs et mécanisme de consentement lorsque la loi l’exige.',
  },
  rights: {
    title: 'Accès, export et suppression',
    paragraphs: [
      'Un utilisateur peut masquer ses scores dans les réglages. Pour demander un export, une rectification ou une suppression complète, il doit contacter l’exploitant sans publier d’e-mail, de jeton ou d’identifiant privé dans un canal public. L’exploitant vérifie l’identité hors bande, propose l’export, puis supprime Auth, profil, progression, runs et participations Daily selon la procédure d’exploitation.',
      'Tant qu’un canal privé d’exercice des droits n’est pas configuré, la bêta publique est bloquée. Les données purement locales peuvent être supprimées immédiatement en effaçant les données du site dans le navigateur.',
    ],
  },
  riot: {
    title: 'Riot Games et propriété intellectuelle',
    detail:
      'League of Legends, ses personnages, marques et ressources appartiennent à Riot Games. La politique Riot est révocable et peut évoluer. Son respect doit être réévalué avant chaque lancement public.',
    officialPolicy: 'Politique officielle Riot Games',
  },
  metadata: {
    lastUpdated: 'Dernière mise à jour',
    region: 'Zone concernée',
    service: 'Service',
    serviceValue: 'Prototype gratuit et non commercial',
    navigation: 'Navigation',
    onThisPage: 'Sur cette page',
    retention: 'Durées de conservation',
  },
  backToAuth: 'Retour à la connexion',
  targetRegion: 'France et Union européenne',
  accountRetention: 'Jusqu’à la suppression du compte',
  guestRetention: 'Jusqu’à l’effacement des données du navigateur',
  storagePurposes: [
    'Session Supabase et reprise de connexion',
    'Préférences audio, lisibilité et commandes',
    'Progression invitée et reprise locale de partie',
    'État vu/non vu des tutoriels',
  ],
  riotNotice:
    'LolRogue a été créé conformément à la politique « Legal Jibber Jabber » de Riot Games en utilisant des ressources appartenant à Riot Games. Riot Games ne soutient ni ne sponsorise ce projet.',
} as const;

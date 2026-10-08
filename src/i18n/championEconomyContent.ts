import { type Locale, locale } from './fr';

const catalogs = {
  'fr-FR': {
    wallet: 'Éclats de champion',
    balance: (amount: string) => `${amount} Éclats`,
    currencies:
      'Les Éclats débloquent les champions. Les Candies améliorent leur maîtrise ; l’Or appartient à la run.',
    earning:
      'Gagne des Éclats avec les runs vérifiées. Un abandon avant la première vague terminée ne donne aucun Éclat.',
    guest:
      'En invité, les champions gratuits et en rotation sont jouables. Connecte-toi pour gagner des Éclats et acheter des champions.',
    loading: 'Actualisation du catalogue…',
    unavailable:
      'Le catalogue ne peut pas être actualisé. Réessaie avant de lancer une nouvelle run.',
    retry: 'Réessayer',
    nextRotation: (date: string) => `Prochaine rotation : ${date} (UTC).`,
    rotationExpired: 'Rotation terminée ; actualisation nécessaire.',
    remainingDays: (days: string, hours: string) => `${days} j ${hours} h restantes`,
    remainingHours: (hours: string) => `${hours} h restantes`,
    access: {
      permanent_free: 'Gratuit permanent',
      owned: 'Possédé',
      weekly_rotation: 'Rotation hebdomadaire',
      locked: 'Verrouillé',
    },
    consultation: 'Consultation uniquement — champion indisponible en combat',
    bonusAvailable: 'Bonus de première victoire de cette rotation disponible.',
    bonusClaimed: 'Bonus de première victoire déjà obtenu pour cette rotation.',
    filter: 'Filtrer les champions par accès',
    filters: {
      all: 'Tous',
      available: 'Disponibles',
      owned: 'Possédés',
      rotation: 'En rotation',
      locked: 'Verrouillés',
    },
    sort: 'Trier les champions',
    sorts: { name: 'Nom', access: 'Accès' },
    noResults: 'Aucun champion ne correspond à ce filtre.',
    dailyExemption:
      'Le défi quotidien garde son offre de six champions, accessibles pour ce défi quelle que soit leur possession.',
    details: (name: string) => `Voir les statistiques et sorts de ${name}`,
    buy: (name: string, price: string) => `Acheter ${name} · ${price} Éclats`,
    login: (name: string) => `Se connecter pour acheter ${name}`,
    confirmTitle: (name: string) => `Débloquer ${name} définitivement ?`,
    permanentPurchase:
      'Ce champion restera jouable après la rotation. L’achat ne modifie ni sa maîtrise ni ses Candies.',
    price: 'Prix',
    before: 'Solde avant achat',
    after: 'Solde après achat',
    missing: (amount: string) => `Il te manque ${amount} Éclats.`,
    confirm: 'Confirmer l’achat',
    pending: 'Achat en cours…',
    cancel: 'Annuler',
    close: 'Fermer',
    reviewPrice: 'Revoir le prix actualisé',
    purchased: (name: string, balance: string) =>
      `${name} est débloqué. Solde : ${balance} Éclats.`,
    errors: {
      authentication_required: 'Connecte-toi pour acheter ce champion.',
      champion_economy_disabled: 'Les achats de champions sont désactivés.',
      invalid_champion: 'Ce champion ne fait pas partie du catalogue jouable.',
      champion_not_purchasable: 'Ce champion ne peut pas être acheté.',
      champion_already_owned: 'Ce champion est déjà possédé.',
      insufficient_shards: 'Ton solde est insuffisant. Actualise-le avant de réessayer.',
      champion_price_changed:
        'Le prix ou le catalogue a changé. Vérifie le nouveau devis avant de confirmer à nouveau.',
      idempotency_key_reused:
        'Cette commande ne correspond plus au devis. Actualise le catalogue avant de réessayer.',
      unknown:
        'L’achat n’a pas pu être confirmé. Réessaie pour vérifier la même commande sans double débit.',
    },
  },
  'en-US': {
    wallet: 'Champion Shards',
    balance: (amount: string) => `${amount} Shards`,
    currencies: 'Shards unlock champions. Candies improve their mastery; Gold belongs to the run.',
    earning:
      'Earn Shards from verified runs. Abandoning before completing the first wave awards no Shards.',
    guest:
      'As a guest, free and rotating champions are playable. Sign in to earn Shards and buy champions.',
    loading: 'Refreshing the catalog…',
    unavailable: 'The catalog could not be refreshed. Try again before starting a new run.',
    retry: 'Retry',
    nextRotation: (date: string) => `Next rotation: ${date} (UTC).`,
    rotationExpired: 'Rotation ended; a refresh is required.',
    remainingDays: (days: string, hours: string) => `${days} d ${hours} h remaining`,
    remainingHours: (hours: string) => `${hours} h remaining`,
    access: {
      permanent_free: 'Permanently free',
      owned: 'Owned',
      weekly_rotation: 'Weekly rotation',
      locked: 'Locked',
    },
    consultation: 'Reference only — champion unavailable in combat',
    bonusAvailable: 'First-win bonus for this rotation available.',
    bonusClaimed: 'First-win bonus already earned for this rotation.',
    filter: 'Filter champions by access',
    filters: {
      all: 'All',
      available: 'Available',
      owned: 'Owned',
      rotation: 'In rotation',
      locked: 'Locked',
    },
    sort: 'Sort champions',
    sorts: { name: 'Name', access: 'Access' },
    noResults: 'No champions match this filter.',
    dailyExemption:
      'The daily challenge keeps its six-champion offer, available for that challenge regardless of ownership.',
    details: (name: string) => `View ${name}’s stats and abilities`,
    buy: (name: string, price: string) => `Buy ${name} · ${price} Shards`,
    login: (name: string) => `Sign in to buy ${name}`,
    confirmTitle: (name: string) => `Unlock ${name} permanently?`,
    permanentPurchase:
      'This champion stays playable after the rotation. Buying does not change their mastery or Candies.',
    price: 'Price',
    before: 'Balance before purchase',
    after: 'Balance after purchase',
    missing: (amount: string) => `You need ${amount} more Shards.`,
    confirm: 'Confirm purchase',
    pending: 'Purchasing…',
    cancel: 'Cancel',
    close: 'Close',
    reviewPrice: 'Review the updated price',
    purchased: (name: string, balance: string) =>
      `${name} is unlocked. Balance: ${balance} Shards.`,
    errors: {
      authentication_required: 'Sign in to buy this champion.',
      champion_economy_disabled: 'Champion purchases are disabled.',
      invalid_champion: 'This champion is outside the playable catalog.',
      champion_not_purchasable: 'This champion cannot be purchased.',
      champion_already_owned: 'This champion is already owned.',
      insufficient_shards: 'Your balance is too low. Refresh it before trying again.',
      champion_price_changed:
        'The price or catalog changed. Review the new quote before confirming again.',
      idempotency_key_reused:
        'This order no longer matches the quote. Refresh the catalog before trying again.',
      unknown:
        'The purchase could not be confirmed. Retry to check the same order without a second charge.',
    },
  },
} as const;

export function getChampionEconomyContent(contentLocale: Locale = locale) {
  return catalogs[contentLocale];
}

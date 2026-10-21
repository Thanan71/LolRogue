const french = {
  allColumns: 'Afficher toutes les colonnes',
  essentialColumns:
    'Colonnes essentielles. Ouvrez le détail ou affichez toutes les colonnes pour les autres valeurs.',
};

const english: typeof french = {
  allColumns: 'Show all columns',
  essentialColumns: 'Essential columns. Open the detail or show all columns for the other values.',
};

export function getAdminAccessibilityCopy(language: string) {
  return language === 'en-US' ? english : french;
}

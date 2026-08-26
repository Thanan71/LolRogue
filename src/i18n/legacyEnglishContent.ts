import { locale } from './fr';

const CONTENT_TRANSLATIONS: Readonly<Record<string, string>> = {
  // Items
  'Épée longue': 'Long Sword',
  "Une lame simple qui augmente les dégâts d'attaque.": 'A simple blade that increases attack damage.',
  "Tome d'amplification": 'Amplifying Tome',
  'Un tome magique qui augmente la puissance.': 'A magic tome that increases ability power.',
  'Armure de tissu': 'Cloth Armor',
  'Une protection légère qui augmente la défense.': 'Light protection that increases defense.',
  'Cristal de rubis': 'Ruby Crystal',
  'Un cristal rayonnant qui augmente la vitalité.': 'A radiant crystal that increases health.',
  Bottes: 'Boots',
  'Des chaussures qui augmentent la vitesse.': 'Shoes that increase speed.',
  Dague: 'Dagger',
  'Une lame légère qui augmente les chances de coup critique.':
    'A light blade that increases critical strike chance.',
  'Glaive B. F.': 'B. F. Sword',
  "Une lame massive qui augmente fortement les dégâts d'attaque.":
    'A massive blade that greatly increases attack damage.',
  "Lame d'infini": 'Infinity Edge',
  'Augmente fortement les dégâts des coups critiques.': 'Greatly increases critical strike damage.',
  'Coiffe de Rabadon': "Rabadon's Deathcap",
  'Augmente fortement la puissance.': 'Greatly increases ability power.',
  'Égide solaire': 'Sunfire Aegis',
  'Brûle les ennemis proches et renforce les défenses.':
    'Burns nearby enemies and strengthens defenses.',
  'Ange gardien': 'Guardian Angel',
  'Réanime son porteur avec 30 % de ses PV.': 'Revives its wielder with 30% of their HP.',
  'Soif-de-sang': 'Bloodthirster',
  'Confère du vol de vie aux attaques.': 'Grants lifesteal on attacks.',
  'Visage spirituel': 'Spirit Visage',
  'Augmente tous les soins reçus.': 'Increases all healing received.',
  'Potion de soin': 'Health Potion',
  'Restaure 150 PV en 3 tours.': 'Restores 150 HP over 3 turns.',
  'Élixir de colère': 'Elixir of Wrath',
  "Augmente temporairement les dégâts d'attaque.": 'Temporarily increases attack damage.',

  // Item passives that can be surfaced by detailed views/tooltips.
  Perfection: 'Perfection',
  'Les coups critiques infligent 35 % de dégâts supplémentaires.':
    'Critical strikes deal 35% additional damage.',
  'Œuvre magique': 'Magical Masterwork',
  'Augmente la puissance totale de 35 %.': 'Increases total ability power by 35%.',
  Immolations: 'Immolate',
  'Inflige 15 dégâts magiques à tous les ennemis à chaque tour.':
    'Deals 15 magic damage to all enemies each turn.',
  Renaissance: 'Resurrection',
  'Après des dégâts mortels, revient avec 30 % de ses PV.':
    'After taking lethal damage, returns with 30% HP.',
  'Drain de sang': 'Blood Drain',
  'Récupère 18 % des dégâts infligés sous forme de PV.':
    'Restores HP equal to 18% of damage dealt.',
  'Vitalité absolue': 'Absolute Vitality',
  'Augmente de 25 % tous les soins et boucliers reçus.':
    'Increases all healing and shielding received by 25%.',
  Gorgée: 'Sip',
  'Restaure 50 PV par tour pendant 3 tours.': 'Restores 50 HP per turn for 3 turns.',
  Colère: 'Wrath',
  "Confère +30 dégâts d'attaque pendant le combat.": 'Grants +30 attack damage during combat.',

  // Event authored copy (EventPage historically translated English source text to French unconditionally).
  'Coffre mystérieux': 'Mysterious Chest',
  'Esprit errant': 'Wandering Spirit',
  'Autel runique': 'Runic Altar',
  'Gobelin au butin': 'Loot Goblin',
  'Un coffre lumineux bloque votre chemin. Oserez-vous l’ouvrir ?':
    'A glowing chest sits in your path. Do you open it?',
  'Un esprit bienveillant propose son aide à votre équipe.':
    'A friendly spirit offers to help your team.',
  'Un autel ancien palpite d’une puissance oubliée.': 'An ancient altar pulses with power.',
  'Une petite créature détale devant vous avec un sac rempli d’or !':
    'A small creature scurries past with a bag of gold!',
  'Vous découvrez de l’or à l’intérieur.': 'You find gold inside!',
  'Un objet scintille à l’intérieur.': 'An item glows inside!',
  'Un piège ! Le coffre explose.': 'A trap! The chest explodes!',
  'Le coffre est vide…': 'The chest is empty...',
  'L’esprit soigne votre équipe.': 'The spirit heals your team!',
  'L’esprit renforce votre équipe.': 'The spirit empowers your team!',
  'L’esprit dépose quelques pièces d’or.': 'The spirit drops gold.',
  'L’autel vous confère une force nouvelle.': 'The altar grants you strength!',
  'L’autel exige une offrande.': 'The altar demands an offering.',
  'Un champion émerge de l’autel !': 'A champion appears from the altar!',
  'Vous rattrapez le gobelin !': 'You catch the goblin!',
  'Le gobelin abandonne son sac !': 'The goblin drops its bag!',
  'Le gobelin s’échappe avant que vous ne puissiez l’atteindre…':
    'The goblin escapes too fast...',
  'Vous repartez avec de l’or.': 'You leave with gold.',
  'L’offrande est acceptée.': 'The offering is accepted.',
  'Votre découverte rejoint votre inventaire.': 'Your discovery is added to your inventory.',
  'Une énergie apaisante parcourt votre équipe.': 'A soothing energy flows through your team.',
  'Le piège blesse toute votre équipe.': 'The trap damages your entire team.',
  'Votre groupe accueille un nouveau champion.': 'Your group welcomes a new champion.',
  'Votre équipe ressort renforcée de cette rencontre.': 'Your team emerges stronger from this encounter.',
  'Le calme revient sans laisser de trace.': 'Calm returns without leaving a trace.',

  // Other authored encounter fallbacks.
  'Un champion sauvage se présente à ton équipe.': 'A wild champion approaches your team.',
  'le champion peut fuir': 'the champion may flee',
  'Le champion': 'The champion',
  'Comparez les PV actuels et projetés avant d’utiliser cette halte.':
    'Compare current and projected HP before using this rest stop.',
  'Les événements modifient immédiatement votre expédition. Leur résultat est enregistré une seule fois.':
    'Events immediately affect your expedition. Their outcome is recorded only once.',
};

const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'placeholder'] as const;

function translateText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const translated = CONTENT_TRANSLATIONS[trimmed];
  if (!translated) return value;
  const leading = value.match(/^\s*/u)?.[0] ?? '';
  const trailing = value.match(/\s*$/u)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function translateElement(element: Element): void {
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const translated = translateText(current);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function translateNode(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const current = root.nodeValue;
    if (!current) return;
    const translated = translateText(current);
    if (translated !== current) root.nodeValue = translated;
    return;
  }

  if (root instanceof Element) translateElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = current.nodeValue;
      if (value) {
        const translated = translateText(value);
        if (translated !== value) current.nodeValue = translated;
      }
    } else if (current instanceof Element) {
      translateElement(current);
    }
    current = walker.nextNode();
  }
}

export function installLegacyEnglishContentTranslation(): () => void {
  if (locale !== 'en-US' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  translateNode(document.documentElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateNode(mutation.target);
      } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        translateElement(mutation.target);
      } else {
        for (const node of mutation.addedNodes) translateNode(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });
  return () => observer.disconnect();
}

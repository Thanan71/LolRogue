import type { Locale } from './fr';

export type DocumentContentCatalog = Readonly<{
  htmlLanguage: 'fr' | 'en';
  openGraphLocale: 'fr_FR' | 'en_US';
  description: string;
  socialDescription: string;
  imageAlt: string;
}>;

export const documentContent = {
  'fr-FR': {
    htmlLanguage: 'fr',
    openGraphLocale: 'fr_FR',
    description:
      'Compose ton équipe, choisis ta route et survis à six biomes dans un roguelike tactique inspiré de League of Legends.',
    socialDescription: 'Un roguelike League of Legends tactique et rejouable.',
    imageAlt: 'LoL Rogue — une carte nocturne vers six biomes',
  },
  'en-US': {
    htmlLanguage: 'en',
    openGraphLocale: 'en_US',
    description:
      'Build your team, choose your path, and survive six biomes in a tactical roguelike inspired by League of Legends.',
    socialDescription: 'A tactical, replayable League of Legends roguelike.',
    imageAlt: 'LoL Rogue — a night map leading through six biomes',
  },
} as const satisfies Record<Locale, DocumentContentCatalog>;

function setMetaContent(selector: string, content: string): void {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content);
}

export function applyDocumentContent(contentLocale: Locale, routeTitle: string): void {
  const copy = documentContent[contentLocale];
  const pageTitle = `${routeTitle} — LoL Rogue`;

  document.documentElement.lang = copy.htmlLanguage;
  document.title = pageTitle;
  setMetaContent('meta[name="description"]', copy.description);
  setMetaContent('meta[property="og:locale"]', copy.openGraphLocale);
  setMetaContent('meta[property="og:title"]', pageTitle);
  setMetaContent('meta[property="og:description"]', copy.socialDescription);
  setMetaContent('meta[property="og:image:alt"]', copy.imageAlt);
  setMetaContent('meta[name="twitter:title"]', pageTitle);
  setMetaContent('meta[name="twitter:description"]', copy.socialDescription);
  setMetaContent('meta[name="twitter:image:alt"]', copy.imageAlt);
}

import { locale } from './fr';
import { runeDescriptionEn, runeNameEn } from './runes.en';

const RUNE_NAMES_FR: Readonly<Record<string, string>> = {
  press_the_attack: 'Attaque soutenue',
  triumph: 'Triomphe',
  legend_alacrity: 'Légende : alacrité',
  last_stand: "Baroud d'honneur",
  electrocute: 'Électrocution',
  sudden_impact: 'Ruée offensive',
  eyeball_collection: "Arracheur d'œil",
  ravenous_hunter: 'Chasseur vorace',
  summon_aery: "Invocation d'Aery",
  manaflow_band: 'Ruban de mana',
  transcendence: 'Transcendance',
  scorch: 'Brûlure',
  grasp_of_the_undying: "Poigne de l'immortel",
  conditioning: 'Conditionnement',
  overgrowth: 'Surcroissance',
  revitalize: 'Revitalisation',
  glacial_augment: 'Optimisation glaciale',
  hextech_flash: 'Canaliportation Hextech',
  cosmic_insight: 'Savoir cosmique',
  time_warp_tonic: 'Philtre de chronodistorsion',
  e2e_assured_victory: 'E2E — Victoire assurée',
};

export function runeNameFr(runeId: string, fallback = runeId): string {
  return locale === 'en-US' ? runeNameEn(runeId, fallback) : (RUNE_NAMES_FR[runeId] ?? fallback);
}

export function runeDescription(runeId: string, fallback: string): string {
  return locale === 'en-US' ? runeDescriptionEn(runeId, fallback) : fallback;
}

/**
 * Maintained, combat-ready champion kits.
 */

export { annie } from './Annie';
export { ashe } from './Ashe';
export { darius } from './Darius';
export { garen } from './Garen';
export { jinx } from './Jinx';
export { leona } from './Leona';
export { lux } from './Lux';
export { malphite } from './Malphite';
export { soraka } from './Soraka';
export { veigar } from './Veigar';
export { warwick } from './Warwick';

import type { Champion } from '@/types/champion';
import { annie } from './Annie';
import { ashe } from './Ashe';
import { darius } from './Darius';
import { garen } from './Garen';
import { jinx } from './Jinx';
import { leona } from './Leona';
import { lux } from './Lux';
import { malphite } from './Malphite';
import { soraka } from './Soraka';
import { veigar } from './Veigar';
import { warwick } from './Warwick';

/** Maintained kits override the presentation-only Data Dragon catalogue. */
export const implementedChampions: Champion[] = [
  garen,
  annie,
  ashe,
  darius,
  lux,
  soraka,
  jinx,
  leona,
  malphite,
  warwick,
  veigar,
];

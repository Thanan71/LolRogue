/**
 * Champion data exports — Phase 2: 10 simple champions.
 */
export { garen } from './Garen';
export { annie } from './Annie';
export { ashe } from './Ashe';
export { darius } from './Darius';
export { lux } from './Lux';
export { soraka } from './Soraka';
export { jinx } from './Jinx';
export { leona } from './Leona';
export { malphite } from './Malphite';
export { warwick } from './Warwick';

import type { Champion } from '@/types/champion';
import { garen } from './Garen';
import { annie } from './Annie';
import { ashe } from './Ashe';
import { darius } from './Darius';
import { lux } from './Lux';
import { soraka } from './Soraka';
import { jinx } from './Jinx';
import { leona } from './Leona';
import { malphite } from './Malphite';
import { warwick } from './Warwick';

/** All 10 implemented champions. */
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
];

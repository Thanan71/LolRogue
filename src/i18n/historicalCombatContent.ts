import type { CombatContentLocale } from './combatContent';

const french = {
  title: 'Reprendre cette run',
  compatibility: 'Cette run conserve les règles et améliorations de sa version d’origine.',
  automatic:
    'Ce combat sera repris automatiquement depuis son début avec ces mêmes règles. Les prochaines rencontres restent accessibles sur la carte.',
  resume: 'Reprendre le combat en automatique',
  loading: 'Reprise du combat avec les règles d’origine…',
  error: 'La reprise a échoué. Ta run est conservée : tu peux réessayer.',
  retry: 'Réessayer la reprise',
  map: 'Continuer sur la carte',
  victory: 'Combat remporté',
  defeat: 'Combat perdu',
  draw: 'Égalité',
  finished: 'Le combat est terminé et la progression est sauvegardée localement.',
};

const english: typeof french = {
  title: 'Resume this run',
  compatibility: 'This run keeps the rules and enhancements from its original version.',
  automatic:
    'This battle will automatically restart from the beginning using those same rules. You can continue to the next encounters on the map.',
  resume: 'Resume battle automatically',
  loading: 'Resuming battle with its original rules…',
  error: 'The battle could not resume. Your run is preserved: you can try again.',
  retry: 'Try resuming again',
  map: 'Continue to the map',
  victory: 'Battle won',
  defeat: 'Battle lost',
  draw: 'Draw',
  finished: 'The battle is complete and your progress is saved locally.',
};

export function getHistoricalCombatContent(locale: CombatContentLocale) {
  return locale === 'en-US' ? english : french;
}

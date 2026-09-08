import { describe, expect, it } from 'vitest';
import { tutorialContent } from '@/i18n/tutorialContent';

describe('tutorialContent', () => {
  it('keeps strict French and English key parity', () => {
    expect(Object.keys(tutorialContent['en-US'])).toEqual(Object.keys(tutorialContent['fr-FR']));
  });

  it('provides faithful progress and control copy in both locales', () => {
    expect(tutorialContent['fr-FR'].progress(2, 4)).toBe('Étape 2 sur 4');
    expect(tutorialContent['en-US'].progress(2, 4)).toBe('Step 2 of 4');
    expect(tutorialContent['en-US']).toMatchObject({
      help: 'Help',
      close: 'Close tutorial',
      previous: 'Previous',
      next: 'Next',
      done: 'Got it',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { gameOverContent } from '@/i18n/gameOverContent';
import { scanUserCopyFile } from './helpers/userCopyScanner';

function catalogShape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, catalogShape(child)]),
  );
}

describe('gameOverContent', () => {
  it('keeps strict FR/EN structural parity and locale-aware templates', () => {
    expect(catalogShape(gameOverContent['en-US'])).toEqual(catalogShape(gameOverContent['fr-FR']));
    expect(gameOverContent['fr-FR'].rewards.candies(2)).toBe('2 bonbons');
    expect(gameOverContent['en-US'].rewards.candies(2)).toBe('2 candies');
    expect(gameOverContent['fr-FR'].contribution.damageShare(0.75)).toContain('75');
    expect(gameOverContent['en-US'].contribution.damageShare(0.75)).toContain('75%');
  });

  it('leaves no raw user copy in run-result presentation sources', () => {
    const findings = [
      'src/pages/GameOverPage.tsx',
      'src/components/NotificationRegion.tsx',
    ].flatMap((path) => scanUserCopyFile(`${process.cwd()}/${path}`));
    expect(findings).toEqual([]);
  });
});

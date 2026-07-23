import { stripMarkup } from '../src/utils/text';

describe('stripMarkup', () => {
  it('renders Data Dragon markup as safe plain text', () => {
    expect(stripMarkup('<physicalDamage>100 damage</physicalDamage><br />Tom &amp; Jerry')).toBe(
      '100 damage Tom & Jerry',
    );
  });

  it('removes executable markup instead of returning HTML', () => {
    expect(stripMarkup('<script>alert(1)</script>Safe')).toBe('alert(1)Safe');
  });
});

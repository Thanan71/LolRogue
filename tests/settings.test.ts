import { describe, expect, it } from 'vitest';
import {
  getDifficultyMultiplier,
  getTextSizeMultiplier,
  scaleFontSize,
} from '../src/stores/settingsStore';

describe('settings rules', () => {
  it('scales enemy difficulty consistently', () => {
    expect(getDifficultyMultiplier('easy')).toBe(0.85);
    expect(getDifficultyMultiplier('normal')).toBe(1);
    expect(getDifficultyMultiplier('hard')).toBe(1.2);
  });

  it('scales interface text from the selected accessibility size', () => {
    expect(getTextSizeMultiplier('small')).toBe(0.85);
    expect(getTextSizeMultiplier('large')).toBe(1.2);
    expect(scaleFontSize(20, 'large')).toBe(24);
  });
});

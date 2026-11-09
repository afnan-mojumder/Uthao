import { describe, it, expect } from 'vitest';
import { resolveQualityLevel } from '../../../src/render/quality';

describe('resolveQualityLevel (audit: saved quality setting must reach the renderer)', () => {
  it('uses the saved quality when the URL has no quality parameter', () => {
    expect(resolveQualityLevel(null, 'low')).toBe('low');
    expect(resolveQualityLevel(undefined, 'high')).toBe('high');
  });

  it('lets a valid URL parameter override the saved quality', () => {
    expect(resolveQualityLevel('high', 'low')).toBe('high');
  });

  it('ignores an invalid URL parameter and uses the saved quality', () => {
    expect(resolveQualityLevel('ultra', 'low')).toBe('low');
    expect(resolveQualityLevel('', 'medium')).toBe('medium');
  });
});

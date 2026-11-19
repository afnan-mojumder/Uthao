import { describe, it, expect } from 'vitest';
import { resolveQualityLevel, AdaptiveQualityManager } from '../../../src/render/quality';

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

describe('AdaptiveQualityManager step-down and zero-allocation ring buffer (P2.6)', () => {
  it('downgrades high -> medium -> low -> resolutionScale when fps drops below 28 over 2s', () => {
    const mgr = new AdaptiveQualityManager('high', 1);
    expect(mgr.config.level).toBe('high');

    // Feed 15 FPS frames (66.7ms apart) from t=0 to t=2100ms
    let triggered = false;
    for (let t = 0; t <= 2100; t += 66.7) {
      if (mgr.recordFrame(t)) triggered = true;
    }
    expect(triggered).toBe(true);
    expect(mgr.config.level).toBe('medium');

    // Feed another 2.1s of 15 FPS -> medium -> low
    triggered = false;
    for (let t = 2166.7; t <= 4300; t += 66.7) {
      if (mgr.recordFrame(t)) triggered = true;
    }
    expect(triggered).toBe(true);
    expect(mgr.config.level).toBe('low');

    // Feed another 2.1s of 15 FPS -> low lowers resolutionScale below 1.0
    triggered = false;
    for (let t = 4366.7; t <= 6500; t += 66.7) {
      if (mgr.recordFrame(t)) triggered = true;
    }
    expect(triggered).toBe(true);
    expect(mgr.config.level).toBe('low');
    expect(mgr.config.resolutionScale).toBeCloseTo(0.9, 5);
  });
});

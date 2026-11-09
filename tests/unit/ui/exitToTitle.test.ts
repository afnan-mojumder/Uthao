import { describe, it, expect, beforeEach } from 'vitest';
import {
  exitToTitle,
  screenSignal,
  pausedSignal,
  tutorialSignal,
} from '../../../src/ui/store';

describe('exitToTitle (audit H-2: tutorial must not cover the title)', () => {
  beforeEach(() => {
    screenSignal.value = 'game';
    pausedSignal.value = true;
    tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  });

  it('clears the first-ride tutorial when the player leaves for the title', () => {
    // Arrange: the tutorial is open mid-ride (set in beforeEach).
    // Act
    exitToTitle();
    // Assert
    expect(tutorialSignal.value.active).toBe(false);
    expect(screenSignal.value).toBe('title');
    expect(pausedSignal.value).toBe(false);
  });
});

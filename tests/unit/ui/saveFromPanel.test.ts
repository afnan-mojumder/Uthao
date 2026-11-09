import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveStatusSignal,
  saveToSlotFromPanel,
  setSaveDispatchers,
} from '../../../src/ui/store';

describe('saveToSlotFromPanel (audit H-13: save failure must not close the panel silently)', () => {
  beforeEach(() => {
    saveStatusSignal.value = null;
  });

  it('reports failure so the save panel stays open with its message', () => {
    // Arrange: the browser refuses the write
    setSaveDispatchers((): void => {
      saveStatusSignal.value = 'failed';
    }, undefined);

    // Act
    const ok = saveToSlotFromPanel('slot1');

    // Assert
    expect(ok).toBe(false);
    expect(saveStatusSignal.value).toBe('failed');
  });

  it('reports success so the panel closes after a good save', () => {
    setSaveDispatchers((): void => {
      saveStatusSignal.value = 'saved';
    }, undefined);

    expect(saveToSlotFromPanel('slot1')).toBe(true);
  });
});

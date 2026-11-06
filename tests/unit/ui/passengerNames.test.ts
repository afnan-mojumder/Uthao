import { describe, it, expect, afterEach } from 'vitest';
import { t, setLanguage, type Language } from '../../../src/ui/i18n';
import archetypes from '../../../data/archetypes.json';

// Every random passenger's name key must resolve to a real display name in
// both languages. Before this, t() returned the raw id (p_abdul_kader), which
// showed on the core negotiation screen.

const nameKeys = Object.values(archetypes as Record<string, { names: string[] }>).flatMap((a) => a.names);

describe('passenger names are localized', () => {
  afterEach(() => setLanguage('bn'));

  for (const lang of ['en', 'bn'] as Language[]) {
    it(`every archetype name resolves to a display name in ${lang}`, () => {
      // Arrange
      setLanguage(lang);

      // Act
      const unresolved = nameKeys.filter((key) => t(key) === key);

      // Assert
      expect(nameKeys.length).toBeGreaterThan(0);
      expect(unresolved).toEqual([]);
    });
  }
});

import type { ArchetypeId, WeatherKind } from '../../core/types';
import type { DialogueLineDef, DialoguePhase } from '../schemas';
import dialogueLinesRaw from '../../../data/dialogue_lines.json';
import { Rng } from '../../core/rng';
import { t } from '../../ui/i18n';

function normalizeDialogueWeather(w: string): string {
  if (w === 'cloudy') return 'overcast';
  if (w === 'lightRain') return 'rain';
  if (w === 'heavyRain') return 'monsoon';
  return w;
}

export interface DialogueQueryContext {
  phase: DialoguePhase;
  archetype?: ArchetypeId;
  characterId?: string;
  relationshipLevel?: number;
  flags?: Record<string, boolean | string | number>;
  weather?: 'clear' | 'overcast' | 'rain' | 'monsoon' | WeatherKind;
  timeOfDay?: 'morning' | 'rush_morning' | 'midday' | 'rush_evening' | 'night';
  category?: 'cricket' | 'exams' | 'jam' | 'rain' | 'family' | 'general' | 'humour';
  vars?: Record<string, string | number>;
  rng?: Rng;
}

export interface SelectedDialogue {
  lineDef: DialogueLineDef;
  key: string;
  text: string;
}

export class DialogueManager {
  private readonly lines: DialogueLineDef[];

  constructor(customLines?: DialogueLineDef[]) {
    this.lines = customLines ?? (dialogueLinesRaw as DialogueLineDef[]);
  }

  getAllLines(): readonly DialogueLineDef[] {
    return this.lines;
  }

  getLinesForArchetypeAndPhase(archetype: ArchetypeId, phase: DialoguePhase): DialogueLineDef[] {
    return this.lines.filter((l) => l.archetype === archetype && l.phase === phase);
  }

  selectLine(ctx: DialogueQueryContext): SelectedDialogue | null {
    const candidateLines = this.lines.filter((line) => {
      if (line.phase !== ctx.phase) return false;

      // 1. Character match check
      if (line.characterId && line.characterId !== ctx.characterId) {
        return false;
      }

      // 2. Archetype match check
      if (!line.characterId && line.archetype && ctx.archetype && line.archetype !== ctx.archetype) {
        return false;
      }

      // 3. Category match check (optional)
      if (ctx.category && line.category && line.category !== ctx.category) {
        return false;
      }

      // 4. Requires conditions check
      if (line.requires) {
        if (typeof line.requires.minRelationship === 'number') {
          const rel = ctx.relationshipLevel ?? 0;
          if (rel < line.requires.minRelationship) return false;
        }

        if (line.requires.weather) {
          if (
            !ctx.weather ||
            normalizeDialogueWeather(ctx.weather) !== normalizeDialogueWeather(line.requires.weather)
          ) {
            return false;
          }
        }

        if (line.requires.timeOfDay) {
          if (!ctx.timeOfDay || line.requires.timeOfDay !== ctx.timeOfDay) {
            return false;
          }
        }

        if (line.requires.flags) {
          if (!ctx.flags) return false;
          for (const [flagKey, expectedVal] of Object.entries(line.requires.flags)) {
            if (ctx.flags[flagKey] !== expectedVal) {
              return false;
            }
          }
        }
      }

      return true;
    });

    if (candidateLines.length === 0) {
      return null;
    }

    // Prioritize character-specific lines if available
    const characterSpecific = candidateLines.filter(
      (l) => l.characterId && l.characterId === ctx.characterId
    );
    const pool = characterSpecific.length > 0 ? characterSpecific : candidateLines;

    const rng = ctx.rng ?? new Rng(1);
    const chosen = pool[rng.int(0, pool.length - 1)];
    if (!chosen) return null;

    const resolvedVars = ctx.vars ? { ...ctx.vars } : undefined;
    if (resolvedVars && typeof resolvedVars.destination === 'string') {
      const translatedDest = t(resolvedVars.destination);
      if (translatedDest !== resolvedVars.destination) {
        resolvedVars.destination = translatedDest;
      }
    }

    return {
      lineDef: chosen,
      key: chosen.key,
      text: t(chosen.key, resolvedVars),
    };
  }

  getSmallTalk(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'small_talk' });
  }

  getDropOff(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'drop_off' });
  }

  getGreeting(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'greeting' });
  }

  getOffer(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'offer' });
  }

  getCounter(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'counter' });
  }

  getAccept(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'accept' });
  }

  getReject(ctx: Omit<DialogueQueryContext, 'phase'>): SelectedDialogue | null {
    return this.selectLine({ ...ctx, phase: 'reject' });
  }
}

export const defaultDialogueManager = new DialogueManager();

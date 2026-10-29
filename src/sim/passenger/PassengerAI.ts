import type { CharacterDef, PassengerProfile } from '../../core/types';
import { clamp } from '../../core/math';
import { Rng, hashSeed } from '../../core/rng';
import { BALANCE } from '../../config/balance';
import charactersRaw from '../../../data/characters.json';

export const CHARACTERS: CharacterDef[] = charactersRaw as CharacterDef[];

export function getCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getAllCharacters(): CharacterDef[] {
  return [...CHARACTERS];
}

export function isContactUnlocked(
  characterId: string,
  relationshipLevel: number
): boolean {
  const def = getCharacter(characterId);
  if (!def) return false;
  return relationshipLevel >= 15 || def.initialRelationship >= 15;
}

export function isWithinPreferredTimes(
  def: CharacterDef,
  currentMinute: number
): boolean {
  const m = ((currentMinute % 1440) + 1440) % 1440;
  return def.preferredTimes.some((t) => m >= t.startMinute && m <= t.endMinute);
}

export function generateCharacterProfile(
  charDef: CharacterDef,
  currentRelationship: number
): PassengerProfile {
  return {
    passengerId: `pass_${charDef.id}`,
    characterId: charDef.id,
    archetype: charDef.archetype,
    budget: charDef.budget,
    patience: charDef.patience,
    urgency: charDef.urgency,
    bargainingTendency: charDef.bargainingTendency,
    safetySensitivity: charDef.safetySensitivity,
    trustInRider: charDef.trustInRider,
    localKnowledge: charDef.localKnowledge,
    paymentReliability: charDef.paymentReliability,
    relationshipLevel: currentRelationship,
    nameKey: charDef.nameKey,
    traits: {
      luggage: charDef.fixedTraits.luggage,
      child: charDef.fixedTraits.child,
      walkTolerance: charDef.fixedTraits.walkTolerance,
    },
    personalBias: 0,
  };
}

export function getDailyMoodOffset(passengerId: string, day: number): number {
  const seed = hashSeed(passengerId, day, 'daily_mood');
  const rng = new Rng(seed);
  return rng.range(-0.05, 0.05);
}

export function expectedBudget(
  p: PassengerProfile,
  fair: number,
  day: number
): number {
  const dailyMood = getDailyMoodOffset(p.passengerId, day);
  const factor = p.budget * (1 + p.personalBias + dailyMood);
  const raw = fair * factor;
  const rounded = Math.round(raw / BALANCE.FARE.roundTo) * BALANCE.FARE.roundTo;
  return Math.max(BALANCE.FARE.minFare, rounded);
}

export function openingOffer(p: PassengerProfile, budget: number): number {
  const baseOpeningFactor =
    BALANCE.ARCHETYPES[p.archetype]?.openingFactor ?? 0.85;

  // High bargaining tendency pulls opening offer even lower
  const penalty = p.bargainingTendency * 0.1;
  const openingFactor = clamp(baseOpeningFactor - penalty, 0.6, 1.0);

  const raw = budget * openingFactor;
  const rounded = Math.round(raw / BALANCE.FARE.roundTo) * BALANCE.FARE.roundTo;
  return Math.max(BALANCE.FARE.minFare, rounded);
}

export class PassengerAI {
  readonly profile: PassengerProfile;
  mood: number;
  expectedBudget: number;
  private hornTimestamps: number[] = [];

  constructor(profile: PassengerProfile, fairFare: number, day: number) {
    this.profile = profile;
    this.expectedBudget = expectedBudget(profile, fairFare, day);

    // Initial mood based on day mood & urgency
    const dailyOffset = getDailyMoodOffset(profile.passengerId, day);
    this.mood = clamp(0.8 + dailyOffset, 0, 1);
  }

  getMood(): number {
    return this.mood;
  }

  onNearMiss(): void {
    // Near miss: -0.1 * safetySensitivity * 2
    const drop = 0.1 * this.profile.safetySensitivity * 2.0;
    this.mood = clamp(this.mood - drop, 0, 1);
  }

  onBump(): void {
    const drop = 0.2 * this.profile.safetySensitivity * 2.0;
    this.mood = clamp(this.mood - drop, 0, 1);
  }

  onCrash(): void {
    this.mood = clamp(this.mood - 0.6, 0, 1);
  }

  onHorn(currentMinute: number): void {
    // Keep horns within the last 1 minute window
    this.hornTimestamps = this.hornTimestamps.filter(
      (t) => currentMinute - t <= 1.0
    );
    this.hornTimestamps.push(currentMinute);

    // Horn spam: > 3 per minute -> -0.05
    if (this.hornTimestamps.length > 3) {
      this.mood = clamp(this.mood - 0.05, 0, 1);
    }
  }

  onLateness(minutesLate: number): void {
    if (minutesLate > 0) {
      const drop = 0.03 * minutesLate * (1.0 + this.profile.urgency);
      this.mood = clamp(this.mood - drop, 0, 1);
    }
  }

  onHelpfulChoice(bonus = 0.1): void {
    this.mood = clamp(this.mood + bonus, 0, 1);
  }

  canSuggestShortcut(): boolean {
    return this.profile.localKnowledge > 0.7;
  }
}

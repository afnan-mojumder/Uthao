import type { ArchetypeId, PassengerProfile } from '../../core/types';
import type { Rng } from '../../core/rng';
import type { ArchetypesData } from '../schemas';
import archetypesDataRaw from '../../../data/archetypes.json';

const ARCHETYPES: ArchetypesData = archetypesDataRaw as ArchetypesData;

export function getArchetypeDefinition(archetype: ArchetypeId) {
  const def = ARCHETYPES[archetype];
  if (!def) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }
  return def;
}

export function generateProfile(
  archetype: ArchetypeId,
  rng: Rng,
  idOverride?: string
): PassengerProfile {
  const def = getArchetypeDefinition(archetype);

  const budgetFactor = rng.range(def.budgetFactor[0], def.budgetFactor[1]);
  const patience = rng.range(def.patience[0], def.patience[1]);
  const urgency = rng.range(def.urgency[0], def.urgency[1]);
  const bargainingTendency = rng.range(
    def.bargainingTendency[0],
    def.bargainingTendency[1]
  );
  const safetySensitivity = rng.range(
    def.safetySensitivity[0],
    def.safetySensitivity[1]
  );
  const trustInRider = rng.range(def.trustInRider[0], def.trustInRider[1]);
  const localKnowledge = rng.range(
    def.localKnowledge[0],
    def.localKnowledge[1]
  );
  const paymentReliability = rng.range(
    def.paymentReliability[0],
    def.paymentReliability[1]
  );
  const walkTolerance = rng.range(
    def.walkTolerance[0],
    def.walkTolerance[1]
  );

  const nameKey = rng.pick(def.names);
  const personalBias = rng.range(-0.1, 0.1);
  const passengerId = idOverride ?? `pass_${rng.int(100000, 999999)}`;

  return {
    passengerId,
    archetype,
    budget: budgetFactor,
    patience,
    urgency,
    bargainingTendency,
    safetySensitivity,
    trustInRider,
    localKnowledge,
    paymentReliability,
    relationshipLevel: 0,
    nameKey,
    traits: {
      luggage: rng.chance(0.15),
      child: rng.chance(0.08),
      walkTolerance,
    },
    personalBias,
  };
}

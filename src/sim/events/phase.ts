import type { TripState } from '../../core/types';
import type { EncounterPhase } from './conditions';

/** Within this distance of the pickup or drop-off, the bike counts as being there. */
export const RIDE_PHASE_RADIUS_M = 60;

export interface RidePhaseInput {
  trip: TripState;
  hasRequest: boolean;
  distToPickupM: number;
  distToDropoffM: number;
}

/**
 * Maps the live ride to the encounter phase the sim evaluates. Without this,
 * every ride encounter (pickup, trip, drop-off, offer) had a phase the sim never
 * reported, so those encounters could never fire.
 */
export function encounterPhaseFor(input: RidePhaseInput): EncounterPhase {
  if (!input.hasRequest) return 'roaming';

  switch (input.trip) {
    case 'RequestAvailable':
    case 'Negotiating':
      return 'requestOffered';
    case 'Accepted':
    case 'EnRouteToPickup':
      return input.distToPickupM <= RIDE_PHASE_RADIUS_M ? 'atPickup' : 'onTrip';
    case 'PassengerOnboard':
    case 'EnRouteToDestination':
      return input.distToDropoffM <= RIDE_PHASE_RADIUS_M ? 'dropOff' : 'onTrip';
    case 'Completing':
      return 'dropOff';
    default:
      return 'roaming';
  }
}

import type { RideManager } from './RideManager';
import { nextInstruction, type NavInstruction } from '../road/navigation';
import { passengerStatusOf } from './tripFsm';
import type { PassengerStatus, TripState } from '../../core/types';

export interface RideView {
  trip: TripState;
  passenger: PassengerStatus;
  /** i18n key (data/dialogue/{bn,en}/hud.json); resolve with `t(objectiveKey, objectiveVars)`. */
  objectiveKey: string;
  objectiveVars: Record<string, string | number>;
  navTargetNodeId: string | null;
  pickupVisible: boolean;
  dropoffVisible: boolean;
  /** T8.4: next maneuver on the live route; null unless a real route is being followed.
   * Shared scratch object: read it immediately, never keep a reference. */
  instruction: NavInstruction | null;
}

// One view per RideManager, rewritten in place: this is read every frame, so it
// must not allocate. Consumers read it immediately and never keep a reference.
const views = new WeakMap<RideManager, RideView>();

/**
 * The ONLY source for HUD, minimap and world markers. Pure function of the
 * ride's `TripState` (+ outcome and active request); nothing else decides what
 * the player is told to do.
 */
export function deriveRideView(ride: RideManager): RideView {
  let v = views.get(ride);
  if (!v) {
    v = {
      trip: 'Idle',
      passenger: 'RequestCreated',
      objectiveKey: 'objective.idle_find_ride',
      objectiveVars: { node: '' },
      navTargetNodeId: null,
      pickupVisible: false,
      dropoffVisible: false,
      instruction: null,
    };
    views.set(ride, v);
  }

  const trip = ride.getTripState();
  const req = ride.getActiveRequest();
  // An interrupted ride still points at wherever it was heading.
  const phase = trip === 'EmergencyInterrupted' ? (ride.getInterruptedFrom() ?? trip) : trip;

  v.trip = trip;
  v.passenger = passengerStatusOf(trip, ride.getOutcome() ?? undefined);
  v.objectiveVars.node = '';
  v.navTargetNodeId = null;
  v.pickupVisible = false;
  v.dropoffVisible = false;
  v.instruction = null;

  if (!req) {
    const notice = ride.getNoticeKey();
    const app = trip === 'Idle' ? ride.getAppStatus() : 'ok';
    v.objectiveKey =
      notice !== null
        ? notice
        : app === 'suspended'
          ? 'objective.app_suspended'
          : app === 'phoneDead'
            ? 'objective.charge_phone'
            : trip === 'RequestAvailable'
              ? 'objective.ride_available'
              : trip === 'NoShow'
          ? 'objective.no_show'
          : trip === 'Cancelled'
            ? 'objective.cancelled'
            : trip === 'Failed'
              ? 'objective.failed'
              : 'objective.idle_find_ride';
    return v;
  }

  switch (phase) {
    case 'Negotiating':
      v.objectiveKey = 'objective.negotiate';
      v.pickupVisible = true;
      break;
    case 'Accepted':
    case 'EnRouteToPickup':
      v.objectiveKey = 'objective.go_to_pickup';
      v.objectiveVars.node = req.pickupNodeId;
      v.navTargetNodeId = req.pickupNodeId;
      v.pickupVisible = true;
      break;
    case 'PassengerOnboard':
    case 'EnRouteToDestination':
      v.objectiveKey = 'objective.drop_off';
      v.objectiveVars.node = req.destinationNodeId;
      v.navTargetNodeId = req.destinationNodeId;
      v.dropoffVisible = true;
      break;
    case 'Completing':
      v.objectiveKey = 'objective.completing';
      break;
    default:
      v.objectiveKey = 'objective.idle_find_ride';
  }
  if (v.navTargetNodeId !== null && ride.currentRoute) {
    v.instruction = nextInstruction(ride.currentRoute, ride.getPose(), ride.roadNetwork.getNodesMap());
  }
  if (trip === 'EmergencyInterrupted') v.objectiveKey = 'objective.emergency';
  return v;
}

import type { Fsm } from '../../core/fsm';
import type {
  PassengerState,
  PassengerStatus,
  TripOutcome,
  TripState,
} from '../../core/types';

export type { TripState, TripOutcome, PassengerStatus };

export type TripEvent =
  | 'offer' // Idle -> RequestAvailable
  | 'withdraw' // RequestAvailable -> Idle (every offer expired or was withdrawn)
  | 'open' // RequestAvailable -> Negotiating
  | 'decline' // rider turned the request down / negotiation failed
  | 'walkAway' // passenger left during negotiation
  | 'agree' // Negotiating -> Accepted
  | 'headToPickup' // Accepted -> EnRouteToPickup
  | 'arrivePickup' // EnRouteToPickup -> PassengerOnboard
  | 'noShow' // EnRouteToPickup -> NoShow
  | 'startTrip' // PassengerOnboard -> EnRouteToDestination
  | 'arriveDestination' // EnRouteToDestination -> Completing
  | 'settle' // Completing -> Completed
  | 'cancel' // before onboard
  | 'abort' // after onboard, always with a TripOutcome
  | 'fail' // any active state
  | 'interrupt' // -> EmergencyInterrupted, remembering where it came from
  | 'resume' // EmergencyInterrupted -> prior state
  | 'reset'; // any terminal state -> Idle

const TERMINAL: TripState[] = ['Completed', 'Declined', 'Cancelled', 'NoShow', 'Failed'];

export function isTerminalTripState(s: TripState): boolean {
  return TERMINAL.includes(s);
}

const TRIP_TABLE: Record<TripState, Partial<Record<TripEvent, TripState>>> = {
  Idle: { offer: 'RequestAvailable' },
  RequestAvailable: { open: 'Negotiating', decline: 'Declined', withdraw: 'Idle' },
  Negotiating: { agree: 'Accepted', decline: 'Declined', walkAway: 'Declined', fail: 'Failed' },
  Accepted: { headToPickup: 'EnRouteToPickup', cancel: 'Cancelled', fail: 'Failed' },
  EnRouteToPickup: {
    arrivePickup: 'PassengerOnboard',
    noShow: 'NoShow',
    cancel: 'Cancelled',
    fail: 'Failed',
    interrupt: 'EmergencyInterrupted',
  },
  PassengerOnboard: {
    startTrip: 'EnRouteToDestination',
    abort: 'Cancelled',
    fail: 'Failed',
    interrupt: 'EmergencyInterrupted',
  },
  EnRouteToDestination: {
    arriveDestination: 'Completing',
    abort: 'Cancelled',
    fail: 'Failed',
    interrupt: 'EmergencyInterrupted',
  },
  Completing: { settle: 'Completed', abort: 'Cancelled', fail: 'Failed' },
  EmergencyInterrupted: { abort: 'Cancelled', fail: 'Failed' }, // resume is resolved below
  Completed: { reset: 'Idle' },
  Declined: { reset: 'Idle' },
  Cancelled: { reset: 'Idle' },
  NoShow: { reset: 'Idle' },
  Failed: { reset: 'Idle' },
};

/**
 * The single authority for ride state. Same `Fsm` shape as `createFsm`, but
 * `interrupt`/`resume` carry memory (the state that was interrupted), which a
 * plain transition table cannot express. Illegal events throw outside production,
 * matching `createFsm`.
 */
export function createTripFsm(): Fsm<TripState, TripEvent> {
  let state: TripState = 'Idle';
  let interruptedFrom: TripState = 'Idle';

  const target = (event: TripEvent): TripState | undefined =>
    event === 'resume' && state === 'EmergencyInterrupted'
      ? interruptedFrom
      : TRIP_TABLE[state][event];

  return {
    get state() {
      return state;
    },
    can: (event) => target(event) !== undefined,
    send(event) {
      const next = target(event);
      if (next === undefined) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return state;
        throw new Error(`Illegal trip transition: cannot handle '${event}' in state '${state}'`);
      }
      if (next === 'EmergencyInterrupted') interruptedFrom = state;
      state = next;
      return state;
    },
  };
}

export function passengerStatusOf(s: TripState, outcome?: TripOutcome): PassengerStatus {
  if (outcome === 'disputed' && (s === 'Completed' || s === 'Cancelled')) return 'Disputed';
  switch (s) {
    case 'Idle':
      return 'RequestCreated';
    case 'RequestAvailable':
      return 'Offered';
    case 'Negotiating':
      return 'Negotiating';
    case 'Accepted':
      return 'Accepted';
    case 'EnRouteToPickup':
      return 'RiderEnRoute';
    case 'PassengerOnboard':
      return 'AtPickup';
    case 'EnRouteToDestination':
    case 'EmergencyInterrupted':
      return 'OnTrip';
    case 'Completing':
      return 'AtDestination';
    case 'Completed':
      return 'Completed';
    case 'Declined':
      return 'Declined';
    case 'Cancelled':
      return outcome === 'abandonedForSafety' ? 'AbandonedForSafety' : 'Cancelled';
    case 'NoShow':
      return 'NoShow';
    case 'Failed':
      return 'Failed';
  }
}

/** Maps `TripState` onto the pre-T8.1 `RideRequest.status` values for older readers. */
export function legacyStatusOf(s: TripState): PassengerState {
  switch (s) {
    case 'Idle':
    case 'RequestAvailable':
    case 'Accepted':
    case 'EnRouteToPickup':
      return 'WaitingForPickup';
    case 'Negotiating':
      return 'Negotiating';
    case 'PassengerOnboard':
    case 'EnRouteToDestination':
      return 'OnTrip';
    case 'EmergencyInterrupted':
      return 'HandlingIncident';
    case 'Completing':
    case 'Completed':
      return 'Completed';
    default:
      return 'Cancelled';
  }
}

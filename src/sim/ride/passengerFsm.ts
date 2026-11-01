/**
 * @deprecated T8.1: `TripFsm` (tripFsm.ts) is the single authority for ride state, and
 * negotiation now happens before pickup. Nothing in `src/` uses this any more; it is
 * kept only for its own test and is removed in T12.5.
 */
import { createFsm, type Fsm } from '../../core/fsm';
import type { PassengerState } from '../../core/types';

export type PassengerEvent =
  | 'riderArrived'
  | 'passengerCancel'
  | 'fareRejected'
  | 'fareAccepted'
  | 'walkAway'
  | 'incident'
  | 'arrived'
  | 'resume'
  | 'endEarly'
  | 'abort'
  | 'paidAndRated'
  | 'paymentDispute';

export const PASSENGER_FSM_TABLE: Record<
  PassengerState,
  Partial<Record<PassengerEvent, PassengerState>>
> = {
  WaitingForPickup: {
    riderArrived: 'Negotiating',
    passengerCancel: 'Cancelled',
  },
  Negotiating: {
    fareRejected: 'WaitingForPickup',
    fareAccepted: 'OnTrip',
    walkAway: 'Cancelled',
  },
  OnTrip: {
    incident: 'HandlingIncident',
    arrived: 'Completed',
  },
  HandlingIncident: {
    resume: 'OnTrip',
    endEarly: 'Completed',
    abort: 'Cancelled',
  },
  Completed: {
    paidAndRated: 'Reviewed',
    paymentDispute: 'HandlingIncident',
  },
  Reviewed: {},
  Cancelled: {},
};

export function createPassengerFsm(
  initial: PassengerState = 'WaitingForPickup'
): Fsm<PassengerState, PassengerEvent> {
  return createFsm(PASSENGER_FSM_TABLE, initial);
}

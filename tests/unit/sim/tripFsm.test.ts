import { describe, it, expect } from 'vitest';
import {
  createTripFsm,
  passengerStatusOf,
  legacyStatusOf,
  type TripEvent,
} from '../../../src/sim/ride/tripFsm';
import { deriveRideView } from '../../../src/sim/ride/rideView';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';
import type { BikeInput } from '../../../src/physics/bikeModel';
import type { Rng } from '../../../src/core/rng';
import type { RideRequest, TripState } from '../../../src/core/types';
import testloopData from '../../../data/districts/testloop.json';

const NEUTRAL: BikeInput = { throttle: 0, brake: 0, steer: 0 };
const ALL_EVENTS: TripEvent[] = [
  'offer', 'withdraw', 'open', 'decline', 'walkAway', 'agree', 'headToPickup', 'arrivePickup',
  'noShow', 'startTrip', 'arriveDestination', 'settle', 'cancel', 'abort', 'fail', 'interrupt',
  'resume', 'reset',
];

// Independent of the implementation's table: how to reach each state, and what is legal there.
const PATH: Record<TripState, TripEvent[]> = {
  Idle: [],
  RequestAvailable: ['offer'],
  Negotiating: ['offer', 'open'],
  Accepted: ['offer', 'open', 'agree'],
  EnRouteToPickup: ['offer', 'open', 'agree', 'headToPickup'],
  PassengerOnboard: ['offer', 'open', 'agree', 'headToPickup', 'arrivePickup'],
  EnRouteToDestination: ['offer', 'open', 'agree', 'headToPickup', 'arrivePickup', 'startTrip'],
  Completing: ['offer', 'open', 'agree', 'headToPickup', 'arrivePickup', 'startTrip', 'arriveDestination'],
  Completed: ['offer', 'open', 'agree', 'headToPickup', 'arrivePickup', 'startTrip', 'arriveDestination', 'settle'],
  Declined: ['offer', 'decline'],
  Cancelled: ['offer', 'open', 'agree', 'cancel'],
  NoShow: ['offer', 'open', 'agree', 'headToPickup', 'noShow'],
  Failed: ['offer', 'open', 'fail'],
  EmergencyInterrupted: ['offer', 'open', 'agree', 'headToPickup', 'interrupt'],
};
const LEGAL: Record<TripState, TripEvent[]> = {
  Idle: ['offer'],
  RequestAvailable: ['open', 'decline', 'withdraw'],
  Negotiating: ['agree', 'decline', 'walkAway', 'fail'],
  Accepted: ['headToPickup', 'cancel', 'fail'],
  EnRouteToPickup: ['arrivePickup', 'noShow', 'cancel', 'fail', 'interrupt'],
  PassengerOnboard: ['startTrip', 'abort', 'fail', 'interrupt'],
  EnRouteToDestination: ['arriveDestination', 'abort', 'fail', 'interrupt'],
  Completing: ['settle', 'abort', 'fail'],
  Completed: ['reset'],
  Declined: ['reset'],
  Cancelled: ['reset'],
  NoShow: ['reset'],
  Failed: ['reset'],
  EmergencyInterrupted: ['resume', 'abort', 'fail'],
};

function fsmAt(state: TripState) {
  const f = createTripFsm();
  for (const e of PATH[state]) f.send(e);
  expect(f.state).toBe(state);
  return f;
}

function makeSession(rng?: Rng, reliability?: number) {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
  const session = new GameSession({ gm, road, autoRequests: false });
  if (rng) {
    // Same wiring GameSession uses, with a controllable RNG / reliability.
    (session.ride as unknown as { rng: Rng }).rng = rng;
    (session.ride as unknown as { paymentReliabilityOf: () => number }).paymentReliabilityOf = () =>
      reliability ?? 1;
  }
  const nodes = road.getAllNodes();
  const pickup = nodes[0]!;
  const dest = nodes[1]!;
  const req: RideRequest = {
    requestId: 'req_t',
    passengerId: 'p_t',
    pickupNodeId: pickup.nodeId,
    destinationNodeId: dest.nodeId,
    initialFare: 120,
    estimatedDistance: 0.5,
    estimatedDuration: 3,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1,
  };
  return { session, req, pickup, dest, gm };
}

function stepAt(session: GameSession, node: { x: number; z: number }): void {
  session.bike.x = node.x;
  session.bike.z = node.z;
  session.bike.speed = 0;
  session.step(NEUTRAL);
}

function walkRide(
  session: GameSession,
  req: RideRequest,
  pickup: { x: number; z: number },
  dest: { x: number; z: number }
): TripState[] {
  const seen: TripState[] = [];
  const off = session.gm.bus.on('trip/state', (e) => seen.push(e.to));
  session.ride.offer(req);
  session.ride.accept(req.requestId);
  stepAt(session, pickup);
  stepAt(session, dest);
  off();
  return seen;
}

describe('TripFsm table', () => {
  it('cannot settle before pickup and arrival', () => {
    expect(createTripFsm().can('settle')).toBe(false);
  });

  it.each(Object.keys(PATH) as TripState[])('%s accepts exactly its legal events', (state) => {
    for (const e of ALL_EVENTS) {
      const f = fsmAt(state);
      const legal = LEGAL[state].includes(e);
      expect(f.can(e), `${state} can ${e}`).toBe(legal);
      if (!legal) expect(() => f.send(e), `${state} send ${e}`).toThrow(/Illegal trip transition/);
    }
  });

  it.each(['EnRouteToPickup', 'PassengerOnboard', 'EnRouteToDestination'] as TripState[])(
    'EmergencyInterrupted resumes to the state it interrupted (%s)',
    (state) => {
      const f = fsmAt(state);
      f.send('interrupt');
      expect(f.state).toBe('EmergencyInterrupted');
      expect(f.send('resume')).toBe(state);
    }
  );

  it('maps trip state to passenger status and legacy status', () => {
    expect(passengerStatusOf('EnRouteToPickup')).toBe('RiderEnRoute');
    expect(passengerStatusOf('EnRouteToDestination')).toBe('OnTrip');
    expect(passengerStatusOf('Cancelled', 'abandonedForSafety')).toBe('AbandonedForSafety');
    expect(passengerStatusOf('Completed', 'disputed')).toBe('Disputed');
    expect(passengerStatusOf('NoShow')).toBe('NoShow');
    expect(legacyStatusOf('Accepted')).toBe('WaitingForPickup');
    expect(legacyStatusOf('EnRouteToDestination')).toBe('OnTrip');
    expect(legacyStatusOf('NoShow')).toBe('Cancelled');
  });
});

describe('RideManager driven by TripFsm', () => {
  it('a full ride walks the states in order, negotiating before pickup', () => {
    const { session, req, pickup, dest } = makeSession();
    expect(walkRide(session, req, pickup, dest)).toEqual([
      'RequestAvailable', 'Negotiating', 'Accepted', 'EnRouteToPickup', 'PassengerOnboard',
      'EnRouteToDestination', 'Completing', 'Completed', 'Idle',
    ]);
  });

  it('with negotiation enabled the ride waits in Negotiating until a fare is agreed', () => {
    const { session, req, pickup } = makeSession();
    session.ride.enableNegotiation = true;
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    expect(session.ride.getActiveRequest()?.status).toBe('Negotiating');

    stepAt(session, pickup); // sitting at the pickup must not start the trip
    expect(session.ride.getTripState()).toBe('Negotiating');

    session.ride.agreeFare(150);
    expect(session.ride.getTripState()).toBe('Accepted');
    expect(session.ride.getActiveRequest()?.initialFare).toBe(150);
    stepAt(session, pickup);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
    expect(session.ride.getActiveRequest()?.status).toBe('OnTrip');
  });

  it('a passenger walking away during negotiation ends Declined with nothing active', () => {
    const { session, req } = makeSession();
    session.ride.enableNegotiation = true;
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    session.ride.walkAwayNegotiation();
    expect(session.ride.getTripState()).toBe('Declined');
    expect(session.ride.getActiveRequest()).toBeNull();
    expect(deriveRideView(session.ride).navTargetNodeId).toBeNull();
  });

  it('after completion, the view has no nav target or stale objective', () => {
    const { session, req, pickup, dest } = makeSession();
    walkRide(session, req, pickup, dest);
    const v = deriveRideView(session.ride);
    expect(v.navTargetNodeId).toBeNull();
    expect(v.pickupVisible).toBe(false);
    expect(v.dropoffVisible).toBe(false);
    expect(v.objectiveKey).toBe('objective.idle_find_ride');
    expect(session.ride.currentRoute).toBeNull();
  });

  it('the view points at pickup, then at the destination, and is not reallocated', () => {
    const { session, req, pickup, dest } = makeSession();
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    const first = deriveRideView(session.ride);
    expect(first.objectiveKey).toBe('objective.go_to_pickup');
    expect(first.navTargetNodeId).toBe(pickup.nodeId);
    expect(first.pickupVisible).toBe(true);
    expect(first.objectiveVars.node).toBe(pickup.nodeId);

    stepAt(session, pickup);
    stepAt(session, pickup);
    const second = deriveRideView(session.ride);
    expect(second).toBe(first); // allocation-free: same object rewritten in place
    expect(second.objectiveKey).toBe('objective.drop_off');
    expect(second.navTargetNodeId).toBe(dest.nodeId);
    expect(second.dropoffVisible).toBe(true);
    expect(second.passenger).toBe('OnTrip');
  });

  it('an interrupted ride makes no progress and resumes where it was', () => {
    const { session, req, pickup, dest } = makeSession();
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    stepAt(session, pickup);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    expect(session.ride.interrupt()).toBe(true);
    stepAt(session, dest); // arriving while interrupted must not complete
    expect(session.ride.getTripState()).toBe('EmergencyInterrupted');
    const v = deriveRideView(session.ride);
    expect(v.objectiveKey).toBe('objective.emergency');
    expect(v.navTargetNodeId).toBe(dest.nodeId);

    expect(session.ride.resumeTrip()).toBe(true);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
    stepAt(session, dest);
    expect(session.ride.getTripState()).toBe('Idle');
  });

  it('a passenger who no-shows ends in NoShow, pays nothing, clears navigation and posts no ledger row', () => {
    const chances: number[] = [];
    const alwaysNoShow = { chance: (p: number) => (chances.push(p), true) } as unknown as Rng;
    const { session, req, pickup } = makeSession(alwaysNoShow, 0);
    const tx: unknown[] = [];
    session.gm.bus.on('economy/transaction', (e) => tx.push(e));
    const completed: unknown[] = [];
    session.gm.bus.on('ride/completed', (e) => completed.push(e));
    const cashBefore = session.gm.economyManager.cash;

    session.ride.offer(req);
    session.ride.accept(req.requestId);
    stepAt(session, pickup);

    expect(chances).toHaveLength(1);
    expect(chances[0]).toBeGreaterThan(0); // derived from paymentReliability 0
    expect(session.ride.getTripState()).toBe('NoShow');
    const v = deriveRideView(session.ride);
    expect(v.passenger).toBe('NoShow');
    expect(v.navTargetNodeId).toBeNull();
    expect(v.pickupVisible).toBe(false);
    expect(session.ride.currentRoute).toBeNull();
    expect(session.ride.getActiveRequest()).toBeNull();
    expect(tx).toHaveLength(0);
    expect(completed).toHaveLength(0);
    expect(session.gm.economyManager.cash).toBe(cashBefore);

    stepAt(session, pickup); // the next tick returns the FSM to Idle
    expect(session.ride.getTripState()).toBe('Idle');
  });

  it('a fully reliable passenger never rolls for NoShow', () => {
    const rolls: number[] = [];
    const rng = { chance: (p: number) => (rolls.push(p), true) } as unknown as Rng;
    const { session, req, pickup } = makeSession(rng, 1);
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    stepAt(session, pickup);
    expect(rolls).toHaveLength(0);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
  });
});

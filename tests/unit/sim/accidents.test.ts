import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { SIM_DT } from '../../../src/config/constants';
import { assessAccident } from '../../../src/sim/events/accidents';
import testloopData from '../../../data/districts/testloop.json';
import type { DistrictData } from '../../../src/sim/schemas';

function makeActiveRideSession(opts: { physics?: PhysicsWorld; seed?: number } = {}) {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: opts.seed ?? 19, mode: 'career', data: {} });
  gm.eventDirector.enabled = true;
  const session = new GameSession({
    gm,
    road,
    physics: opts.physics,
    autoRequests: false,
    negotiation: false,
  });

  const nodes = road.getAllNodes();
  const nPickup = nodes[0]!;
  const nDest = nodes[Math.min(2, nodes.length - 1)]!;
  session.requests.sampleRequest(8 * 60, 'clear', 'app');
  const req = {
    requestId: 'req_acc_test',
    passengerId: 'p_acc_test',
    pickupNodeId: nPickup.nodeId,
    destinationNodeId: nDest.nodeId,
    initialFare: 120,
    estimatedDistance: 1.5,
    estimatedDuration: 8,
    requestedArrivalTime: null,
    bookingType: 'app' as const,
    status: 'WaitingForPickup' as const,
    surge: 1.0,
  };
  session.ride.offer(req);
  session.ride.accept(req.requestId, nPickup.nodeId);
  session.bike.x = nPickup.x;
  session.bike.z = nPickup.z;
  session.bike.speed = 0;
  session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
  expect(session.ride.getTripState()).toBe('EnRouteToDestination');

  return { gm, session };
}

describe('Accidents & Passenger Safety (P4.5 / T10.4)', () => {
  it('derives fair responsibility: low when NPC hits stopped bike, high on static/reckless crash', () => {
    const npcHitsStopped = assessAccident(
      {
        severity: 'crash',
        relSpeedKmh: 38,
        otherKind: 'traffic',
        otherParty: true,
        bikeSpeedKmh: 0,
        otherSpeedKmh: 38,
      },
      {
        bikeSpeedKmh: 0,
        otherSpeedKmh: 38,
        hasPassenger: true,
        wet: false,
        bikeCondition: 90,
      }
    );
    expect(npcHitsStopped.otherParty).toBe(true);
    expect(npcHitsStopped.responsibility).toBeLessThanOrEqual(0.2);

    const staticCrash = assessAccident(
      {
        severity: 'crash',
        relSpeedKmh: 45,
        otherKind: 'static',
        otherParty: false,
        bikeSpeedKmh: 45,
        otherSpeedKmh: 0,
      },
      {
        bikeSpeedKmh: 45,
        hasPassenger: false,
        wet: false,
        bikeCondition: 90,
      }
    );
    expect(staticCrash.otherParty).toBe(false);
    expect(staticCrash.responsibility).toBeGreaterThanOrEqual(0.7);
    expect(staticCrash.severity).toBe('serious');
    expect(staticCrash.riderInjury).toBe(2);
  });

  it('populates otherParty and impact speeds from PhysicsWorld when NPC traffic hits stopped player', async () => {
    const physics = await PhysicsWorld.create();
    const { gm, session } = makeActiveRideSession({ physics });
    session.bike.x = 0;
    session.bike.z = 0;
    session.bike.heading = 0;
    session.bike.speed = 0;

    const collisions: Array<{
      severity: string;
      relSpeedKmh: number;
      otherKind?: string;
      otherParty?: boolean;
      bikeSpeedKmh?: number;
      otherSpeedKmh?: number;
    }> = [];
    gm.bus.on('bike/collision', (ev) => collisions.push(ev));

    const npcCar = {
      id: 'npc_rear_ender',
      kind: 'car' as const,
      laneId: 'manual_lane',
      distAlongLane: 0,
      speed: 40 / 3.6,
      x: 0,
      z: -3.2,
      heading: 0,
      length: 4.5,
      width: 1.8,
      desiredSpeed: 40 / 3.6,
      lod: 'near' as const,
    };
    session.traffic.agents.set(npcCar.id, npcCar);

    for (let i = 0; i < 15 && collisions.length === 0; i++) {
      npcCar.z += npcCar.speed * SIM_DT;
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }

    expect(collisions).toHaveLength(1);
    const ev = collisions[0]!;
    expect(ev.otherKind).toBe('traffic');
    expect(ev.otherParty).toBe(true);
    expect(ev.bikeSpeedKmh).toBeLessThanOrEqual(1);
    expect(ev.otherSpeedKmh).toBeGreaterThan(30);

    const report = assessAccident(ev as never, {
      bikeSpeedKmh: ev.bikeSpeedKmh ?? 0,
      otherSpeedKmh: ev.otherSpeedKmh,
      hasPassenger: true,
      wet: false,
      bikeCondition: 90,
    });
    expect(report.responsibility).toBeLessThanOrEqual(0.2);
  });

  it('low-speed bumps resume cleanly without interrupting the ride', () => {
    const { gm, session } = makeActiveRideSession();
    const started: string[] = [];
    gm.bus.on('encounter/started', ({ instance }) => started.push(instance.encounterId));

    gm.bus.emit('bike/collision', {
      severity: 'bump',
      relSpeedKmh: 12,
      otherKind: 'traffic',
      otherParty: true,
    });

    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
    expect(started).toEqual([]);
  });

  it('high-speed static crash interrupts via RideManager.interrupt(), charges compensation, and resumes via resumeTrip()', () => {
    const { gm, session } = makeActiveRideSession();
    gm.economyManager.cash = 1000;
    gm.economy.cash = 1000;

    const txs: Array<{ kind: string; amount: number }> = [];
    gm.bus.on('economy/transaction', ({ tx }) => txs.push({ kind: tx.kind, amount: tx.amount }));

    // Moderate high-speed static crash (32 km/h -> moderate severity, non-serious injury)
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });

    expect(session.ride.getTripState()).toBe('EmergencyInterrupted');
    const enc = gm.eventDirector.activeEncounter;
    expect(enc?.encounterId).toBe('enc_accident_aftermath');

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc!.id,
      choiceId: 'check_and_settle',
    });
    expect(res.success).toBe(true);
    expect(txs.some((t) => t.kind === 'compensation' && t.amount < 0)).toBe(true);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
  });

  it('serious injury crash charges medical and cancels/fails the trip instead of resuming', () => {
    const { gm, session } = makeActiveRideSession();
    gm.economyManager.cash = 1000;
    gm.economy.cash = 1000;

    const txs: Array<{ kind: string; amount: number }> = [];
    gm.bus.on('economy/transaction', ({ tx }) => txs.push({ kind: tx.kind, amount: tx.amount }));

    // Serious crash (>= 50 km/h -> serious injury)
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 55,
      otherKind: 'traffic',
      otherParty: true,
      bikeSpeedKmh: 55,
      otherSpeedKmh: 0,
    });

    expect(session.ride.getTripState()).toBe('EmergencyInterrupted');
    const enc = gm.eventDirector.activeEncounter;
    expect(enc?.encounterId).toBe('enc_accident_aftermath');
    expect(enc!.choices.some((c) => c.id === 'call_medical')).toBe(true);

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc!.id,
      choiceId: 'call_medical',
    });
    expect(res.success).toBe(true);
    expect(txs.some((t) => t.kind === 'medical' && t.amount < 0)).toBe(true);
    expect(['Cancelled', 'Failed', 'Idle']).toContain(session.ride.getTripState());
    expect(session.ride.getActiveRequest()).toBeNull();
  });

  it('never leaves RideManager stuck in EmergencyInterrupted when accident encounter fails to start or on day/ended / state/restored', () => {
    // 1. Moderate crash when another encounter is already active (forceStart returns null)
    const { gm, session } = makeActiveRideSession();
    gm.eventDirector.forceStart('enc_friend_package', gm.bus);
    expect(gm.eventDirector.activeEncounter).not.toBeNull();

    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // 2. Moderate crash when eventDirector is disabled
    gm.eventDirector.activeEncounter = null;
    gm.eventDirector.activeEncounterDef = null;
    gm.eventDirector.enabled = false;
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'traffic',
      otherParty: true,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // 3. Serious crash when forceStart fails (disabled / cooldown) -> charges medical & cancels cleanly
    const txs: Array<{ kind: string; amount: number }> = [];
    gm.bus.on('economy/transaction', ({ tx }) => txs.push({ kind: tx.kind, amount: tx.amount }));
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 55,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 55,
      otherSpeedKmh: 0,
    });
    expect(txs.some((t) => t.kind === 'medical' && t.amount < 0)).toBe(true);
    expect(session.ride.getTripState()).not.toBe('EmergencyInterrupted');
    expect(['Cancelled', 'Failed', 'Idle']).toContain(session.ride.getTripState());

    // 4. state/restored & day/ended never leave RideManager stranded in EmergencyInterrupted
    const { gm: gm2, session: s2 } = makeActiveRideSession({ seed: 29 });
    gm2.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });
    expect(s2.ride.getTripState()).toBe('EmergencyInterrupted');
    gm2.bus.emit('state/restored', {});
    expect(s2.ride.getTripState()).not.toBe('EmergencyInterrupted');

    const { gm: gm3, session: s3 } = makeActiveRideSession({ seed: 31 });
    gm3.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });
    expect(s3.ride.getTripState()).toBe('EmergencyInterrupted');
    gm3.bus.emit('day/ended', { day: 1, summary: {} as never });
    expect(s3.ride.getTripState()).not.toBe('EmergencyInterrupted');
  });

  it('keeps trip in EmergencyInterrupted when a second non-serious collision happens while enc_accident_aftermath is active', () => {
    const { gm, session } = makeActiveRideSession({ seed: 37 });
    gm.economyManager.cash = 1000;
    gm.economy.cash = 1000;

    // First moderate crash opens enc_accident_aftermath -> EmergencyInterrupted
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 32,
      otherKind: 'static',
      otherParty: false,
      bikeSpeedKmh: 32,
      otherSpeedKmh: 0,
    });
    expect(session.ride.getTripState()).toBe('EmergencyInterrupted');
    const enc = gm.eventDirector.activeEncounter;
    expect(enc?.encounterId).toBe('enc_accident_aftermath');

    // Second moderate/traffic crash while enc_accident_aftermath is still open
    gm.bus.emit('bike/collision', {
      severity: 'crash',
      relSpeedKmh: 28,
      otherKind: 'traffic',
      otherParty: true,
      bikeSpeedKmh: 0,
      otherSpeedKmh: 28,
    });

    // Must remain EmergencyInterrupted until enc_accident_aftermath is resolved
    expect(session.ride.getTripState()).toBe('EmergencyInterrupted');
    expect(gm.eventDirector.activeEncounter?.id).toBe(enc!.id);

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc!.id,
      choiceId: 'check_and_settle',
    });
    expect(res.success).toBe(true);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
  });
});

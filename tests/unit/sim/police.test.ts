import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { SignalController } from '../../../src/sim/traffic/signals';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { createDefaultBikeState } from '../../../src/physics/bikeModel';
import { SIM_DT } from '../../../src/config/constants';
import type { BikeInfractionKind, RoadNode, RoadSegment } from '../../../src/core/types';
import type { EncounterContext } from '../../../src/sim/events/conditions';
import type { EncounterDef } from '../../../src/sim/schemas';
import {
  detectViolations,
  ViolationMonitor,
} from '../../../src/sim/events/violations';
import policeEncounters from '../../../data/encounters/police.json';
import routeEncounters from '../../../data/encounters/route.json';

function makeSegment(overrides: Partial<RoadSegment> = {}): RoadSegment {
  return {
    segmentId: 'seg_main_1',
    startNodeId: 'n1',
    endNodeId: 'n2',
    width: 10,
    surfaceCondition: 1,
    trafficDensity: 0.3,
    speedLimit: 40,
    turnRestrictions: [],
    motorcycleAccessible: true,
    pedestrianDensity: 0.2,
    riskLevel: 0.1,
    oneWay: false,
    divided: false,
    lanes: 2,
    roadType: 'main',
    floodSensitivity: 0,
    pickupPractical: true,
    district: 'mirpara',
    tags: ['main'],
    ...overrides,
  };
}

function makeNodes(): Map<string, RoadNode> {
  return new Map<string, RoadNode>([
    ['n1', { nodeId: 'n1', x: 0, y: 0, z: 0, kind: 'junction' }],
    ['n2', { nodeId: 'n2', x: 0, y: 0, z: 100, kind: 'junction', signal: true }],
  ]);
}

describe('Police, Violations & Bribery (P4.5 / T10.3)', () => {
  it('detectViolations detects speeding, wrongWay, and redLight without allocating', () => {
    const nodes = makeNodes();
    const n2 = nodes.get('n2')!;
    const signals = new SignalController([n2], 30);
    const out: BikeInfractionKind[] = [];
    const bike = createDefaultBikeState();

    // 1. Speeding: 65 km/h on 40 km/h road
    const segNormal = makeSegment({ speedLimit: 40 });
    bike.x = 0;
    bike.z = 50;
    bike.heading = 0; // +Z (n1 -> n2)
    bike.speed = 65 / 3.6;

    detectViolations(bike, segNormal, signals, out, nodes);
    expect(out).toEqual(['speeding']);

    // Within speed limit: no violation
    bike.speed = 38 / 3.6;
    detectViolations(bike, segNormal, signals, out, nodes);
    expect(out).toEqual([]);

    // 2. Wrong-way on oneWay road: heading south (PI) while segment goes north (0)
    const segOneWay = makeSegment({ oneWay: true, speedLimit: 40 });
    bike.heading = Math.PI;
    bike.speed = 25 / 3.6;
    detectViolations(bike, segOneWay, signals, out, nodes);
    expect(out).toEqual(['wrongWay']);

    // Wrong-way on divided road (on forward/left side lat > 1m going backward)
    const segDivided = makeSegment({ oneWay: false, divided: true, speedLimit: 40 });
    // Segment n1(0,0)->n2(0,100) has ux=0, uz=1, left=(1, 0). So x=+3 is forward lane.
    bike.x = 3;
    bike.z = 50;
    bike.heading = Math.PI; // going against forward in forward lane
    bike.speed = 25 / 3.6;
    detectViolations(bike, segDivided, signals, out, nodes);
    expect(out).toEqual(['wrongWay']);

    // 3. Red light at signaled node n2 (phase 0 is green for approach 0 (E/W), red for approach 1 (N/S))
    // Heading 0 (due north, sin=0, cos=1) -> approach 1 -> 'red' initially!
    bike.x = 0;
    bike.z = 98; // 2m from n2(0, 100), inside stop line
    bike.heading = 0;
    bike.speed = 20 / 3.6;
    expect(signals.getSignalStatus('n2', 1)).toBe('red');
    detectViolations(bike, segNormal, signals, out, nodes);
    expect(out).toEqual(['redLight']);

    // Reuses the same `out` array reference and stays zero-alloc in steady state
    const prevRef = out;
    for (let i = 0; i < 500; i++) {
      detectViolations(bike, segNormal, signals, out, nodes);
    }
    expect(out).toBe(prevRef);
  });

  it('emits bike/infraction once per offense with cooldown/hysteresis in ViolationMonitor & GameSession', () => {
    const road = RoadNetwork.fromDistricts([
      {
        districtId: 'mirpara',
        name: { bn: 'মিরপাড়া', en: 'Mirpara' },
        nodes: [
          { nodeId: 'n1', x: 0, y: 0, z: 0, kind: 'junction' },
          { nodeId: 'n2', x: 0, y: 0, z: 200, kind: 'junction', signal: true },
        ],
        segments: [
          makeSegment({ segmentId: 'seg_oneway', startNodeId: 'n1', endNodeId: 'n2', oneWay: true, speedLimit: 35 }),
        ],
        pois: [],
        lots: [],
      },
    ]);

    const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    const infractions: Array<{ kind: BikeInfractionKind; segmentId: string }> = [];
    gm.bus.on('bike/infraction', (ev) => infractions.push(ev));

    // Speeding continuously for 2 seconds -> emits 'speeding' only ONCE
    session.bike.x = 0;
    session.bike.z = 40;
    session.bike.heading = 0;
    session.bike.speed = 60 / 3.6;
    for (let i = 0; i < 120; i++) {
      session.bike.speed = 60 / 3.6;
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(infractions.filter((e) => e.kind === 'speeding')).toHaveLength(1);

    // Slow down cleanly for hysteresis + cooldown, then speed again -> emits a 2nd offense
    session.bike.speed = 20 / 3.6;
    for (let i = 0; i < Math.ceil(16 / SIM_DT); i++) {
      session.bike.speed = 20 / 3.6;
      session.bike.z = 50;
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(infractions.filter((e) => e.kind === 'speeding')).toHaveLength(2);

    // Direct ViolationMonitor check for redLight once-per-junction
    const monitor = new ViolationMonitor();
    const nodes = road.getNodesMap();
    const signals = new SignalController([nodes.get('n2')!], 30);
    const seg = road.getSegment('seg_oneway')!;
    const emitted: BikeInfractionKind[] = [];
    session.bike.x = 0;
    session.bike.z = 198;
    session.bike.heading = 0;
    session.bike.speed = 20 / 3.6;
    for (let i = 0; i < 30; i++) {
      monitor.step(session.bike, seg, signals, SIM_DT, nodes, (kind) => emitted.push(kind));
    }
    expect(emitted).toEqual(['redLight']);
  });

  it('never triggers a police stop without a violation or story flag', () => {
    const allPoliceAndRoute = [
      ...(policeEncounters as unknown as EncounterDef[]),
      ...(routeEncounters as unknown as EncounterDef[]),
    ];
    const director = new EventDirector({
      definitions: allPoliceAndRoute,
      seed: 123,
    });

    const phases: EncounterContext['phase'][] = ['roaming', 'onTrip', 'atPickup', 'dropOff', 'requestOffered'];
    const roadTypes: RoadSegment['roadType'][] = ['main', 'residential', 'market', 'alley', 'service', 'flyover'];

    for (let chapter = 1; chapter <= 6; chapter++) {
      for (const phase of phases) {
        for (const roadType of roadTypes) {
          for (const hour of [8, 12, 18, 22]) {
            director.resetDaily();
            const seg = makeSegment({ roadType, tags: [roadType] });
            const inst = director.evaluate({
              phase,
              minute: hour * 60,
              day: chapter * 2,
              weather: 'clear',
              chapter,
              flags: {}, // NO violation flag, NO story flag
              relationships: {},
              cash: 1000,
              speedKmh: 0,
              bikeCondition: 90,
              segment: seg,
            });
            if (inst) {
              expect(inst.encounterId).not.toMatch(/police|checkpoint/i);
            }
          }
        }
      }
    }

    // With policeViolation flag set, police stop IS eligible and triggers
    director.resetDaily();
    const segMain = makeSegment({ roadType: 'main', tags: ['main'] });
    const triggered = director.evaluate({
      phase: 'roaming',
      minute: 10 * 60,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: { policeViolation: true },
      relationships: {},
      cash: 1000,
      speedKmh: 0,
      bikeCondition: 90,
      segment: segMain,
    });
    expect(triggered).not.toBeNull();
    expect(triggered!.encounterId).toBe('enc_police_signal_stop');
  });

  it('bribes use bribe tx kind, get rejected > 50% across 1000 seeds, raise evidenceExposure, and fleeing risks criminalExposure', () => {
    const policeDefs = policeEncounters as unknown as EncounterDef[];
    let rejectedCount = 0;
    let acceptedCount = 0;
    let bribeTxCount = 0;
    let fineTxCount = 0;
    let evidenceRaisedCount = 0;

    for (let seed = 1; seed <= 1000; seed++) {
      const gm = new GameManager({
        seed,
        mode: 'career',
        data: { encounters: policeDefs } as never,
      });
      gm.story.branchFlags['policeViolation'] = true;
      gm.economyManager.cash = 1000;
      gm.economy.cash = 1000;

      const txs: string[] = [];
      gm.bus.on('economy/transaction', ({ tx }) => txs.push(tx.kind));
      const ev0 = gm.reputationSystem.getMeters().evidenceExposure;

      const inst = gm.eventDirector.forceStart('enc_police_signal_stop', gm.bus);
      expect(inst).not.toBeNull();
      const res = gm.dispatch({
        type: 'chooseEncounterOption',
        instanceId: inst!.id,
        choiceId: 'offer_bribe',
      });
      expect(res.success).toBe(true);

      const ev1 = gm.reputationSystem.getMeters().evidenceExposure;
      if (ev1 > ev0) evidenceRaisedCount++;

      if (txs.includes('bribe')) {
        bribeTxCount++;
        acceptedCount++;
      } else {
        rejectedCount++;
        if (txs.includes('fine')) fineTxCount++;
      }
    }

    expect(rejectedCount + acceptedCount).toBe(1000);
    expect(rejectedCount / 1000).toBeGreaterThan(0.5);
    // Expected ~85% rejected (55 by_the_book + 30 lenient), ~15% opportunist accepted
    expect(rejectedCount / 1000).toBeGreaterThan(0.75);
    expect(acceptedCount).toBeGreaterThan(50);
    expect(bribeTxCount).toBe(acceptedCount);
    expect(fineTxCount).toBeGreaterThan(0);
    expect(evidenceRaisedCount).toBeGreaterThan(rejectedCount * 0.9);

    // Fleeing raises criminalExposure
    const gmFlee = new GameManager({
      seed: 42,
      mode: 'career',
      data: { encounters: policeDefs } as never,
    });
    gmFlee.story.branchFlags['policeViolation'] = true;
    const crim0 = gmFlee.reputationSystem.getMeters().criminalExposure;
    const instFlee = gmFlee.eventDirector.forceStart('enc_police_signal_stop', gmFlee.bus);
    expect(instFlee).not.toBeNull();
    gmFlee.dispatch({
      type: 'chooseEncounterOption',
      instanceId: instFlee!.id,
      choiceId: 'flee_stop',
    });
    expect(gmFlee.reputationSystem.getMeters().criminalExposure).toBeGreaterThan(crim0);
  });

  it('resets ViolationMonitor cooldowns and latches on day/started, state/restored, and newCareer(), and ignores exiting intersections on red', () => {
    const road = RoadNetwork.fromDistricts([
      {
        districtId: 'mirpara',
        name: { bn: 'মিরপাড়া', en: 'Mirpara' },
        nodes: [
          { nodeId: 'n1', x: 0, y: 0, z: 0, kind: 'junction' },
          { nodeId: 'n2', x: 0, y: 0, z: 200, kind: 'junction', signal: true },
        ],
        segments: [
          makeSegment({
            segmentId: 'seg_main_reset',
            startNodeId: 'n1',
            endNodeId: 'n2',
            speedLimit: 35,
          }),
        ],
        pois: [],
        lots: [],
      },
    ]);

    const gm = new GameManager({ seed: 77, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    const infractions: BikeInfractionKind[] = [];
    gm.bus.on('bike/infraction', ({ kind }) => infractions.push(kind));

    // Late night Day 1 (22:45 = 1365 min): speeding triggers once and latches cooldown
    gm.clock.day = 1;
    gm.clock.minutes = 22 * 60 + 45;
    session.bike.x = 0;
    session.bike.z = 40;
    session.bike.heading = 0;
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(infractions).toEqual(['speeding']);

    // Day 2 morning (07:00) via day/started must clear Day 1 cooldown & latch immediately
    gm.clock.day = 2;
    gm.clock.minutes = 7 * 60;
    gm.bus.emit('day/started', { day: 2 });
    session.bike.x = 0;
    session.bike.z = 40;
    session.bike.heading = 0;
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(infractions).toEqual(['speeding', 'speeding']);

    // state/restored clears cooldown & latch immediately
    gm.bus.emit('state/restored', {});
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(infractions).toEqual(['speeding', 'speeding', 'speeding']);

    // newCareer() clears cooldown & latch immediately
    session.newCareer();
    session.bike.x = 0;
    session.bike.z = 40;
    session.bike.heading = 0;
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(infractions).toEqual(['speeding', 'speeding', 'speeding', 'speeding']);

    // Exiting an already-entered intersection past junction center does NOT trigger redLight
    const nodes = road.getNodesMap();
    const signals = new SignalController([nodes.get('n2')!], 30);
    const seg = road.getSegment('seg_main_reset')!;
    const out: BikeInfractionKind[] = [];
    const bike = createDefaultBikeState();
    bike.x = 0;
    bike.z = 202; // 2m past n2(0, 200) while heading +Z (exiting)
    bike.heading = 0;
    bike.speed = 20 / 3.6;
    expect(signals.getSignalStatus('n2', 1)).toBe('red');
    detectViolations(bike, seg, signals, out, nodes);
    expect(out).toEqual([]);
  });

  it('isolates bike/infraction event payloads across consecutive infractions', () => {
    const road = RoadNetwork.fromDistricts([
      {
        districtId: 'mirpara',
        name: { bn: 'মিরপাড়া', en: 'Mirpara' },
        nodes: [
          { nodeId: 'n1', x: 0, y: 0, z: 0, kind: 'junction' },
          { nodeId: 'n2', x: 0, y: 0, z: 200, kind: 'junction' },
        ],
        segments: [
          makeSegment({
            segmentId: 'seg_oneway_iso',
            startNodeId: 'n1',
            endNodeId: 'n2',
            oneWay: true,
            speedLimit: 35,
          }),
        ],
        pois: [],
        lots: [],
      },
    ]);

    const gm = new GameManager({ seed: 81, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    const infractions: Array<{ kind: BikeInfractionKind; segmentId: string }> = [];
    gm.bus.on('bike/infraction', (ev) => infractions.push(ev));

    // 1. Speeding along segment direction
    session.bike.x = 0;
    session.bike.z = 40;
    session.bike.heading = 0;
    session.bike.speed = 60 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    // 2. Reverse direction at moderate speed -> wrongWay infraction
    session.bike.heading = Math.PI;
    session.bike.speed = 20 / 3.6;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    expect(infractions).toHaveLength(2);
    expect(infractions[0]).toEqual({ kind: 'speeding', segmentId: 'seg_oneway_iso' });
    expect(infractions[1]).toEqual({ kind: 'wrongWay', segmentId: 'seg_oneway_iso' });
    expect(infractions[0]).not.toBe(infractions[1]);
  });
});

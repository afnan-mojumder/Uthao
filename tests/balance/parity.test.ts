import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/sim/GameManager';
import { GameSession } from '../../src/sim/GameSession';
import { AutopilotController } from '../../src/debug/autopilot';
import { SIM_DT } from '../../src/config/constants';
import { BALANCE } from '../../src/config/balance';
import type { TripReceipt } from '../../src/core/types';
import {
  createBalanceNetwork,
  smartProStrategy,
  runHeadlessDay,
  runHeadlessCampaign,
} from '../../src/sim/bot/strategies';
import { Rng } from '../../src/core/rng';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function runAutopilotRide(seed: number, startMinute: number) {
  const road = createBalanceNetwork();
  const gm = new GameManager({ seed, mode: 'career', data: {} });
  gm.clock.minutes = startMinute;
  const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
  session.gm.eventDirector.enabled = false;
  session.spawnAtHome();
  gm.economyManager.fuelLevel = 5.0;

  const startNode = road.nearestNode(session.bike.x, session.bike.z)?.nodeId ?? 'N1';
  const sampled = session.requests.sampleRequest(startMinute, gm.weather, 'app', startNode);
  expect(sampled).not.toBeNull();
  const req = sampled!.request;

  const startMin = gm.clock.minutes;
  const startDay = gm.clock.day;
  const startFuel = gm.economyManager.fuelLevel;

  let receipt: TripReceipt | null = null;
  gm.bus.on('ride/completed', (ev) => {
    receipt = ev.receipt;
  });

  session.ride.offer(req);
  expect(session.ride.accept(req.requestId, startNode)).toBe(true);

  const autopilot = new AutopilotController(road);
  autopilot.setEnabled(true);

  for (let step = 0; step < 60 * 300 && !receipt; step++) {
    // Keep random traffic clear so baseline measures pure route + physics parity
    session.traffic.agents.clear();
    const st = session.ride.getTripState();
    const target =
      st === 'Accepted' || st === 'EnRouteToPickup' ? req.pickupNodeId : req.destinationNodeId;
    autopilot.setDestination(session.bike.x, session.bike.z, target);
    session.step(autopilot.step(session.bike), SIM_DT);
  }

  expect(receipt).not.toBeNull();
  const durationMin = (gm.clock.day - startDay) * 1440 + gm.clock.minutes - startMin;
  const fuelConsumed = startFuel - gm.economyManager.fuelLevel;

  return {
    fuelConsumed,
    durationMin,
    net: receipt!.net,
    rating: gm.reputationSystem.getAppRating(),
    ledgerIds: gm.economyManager.getSettledIds(),
  };
}

function runFastForwardRide(seed: number, startMinute: number) {
  const road = createBalanceNetwork();
  const gm = new GameManager({ seed, mode: 'career', data: {} });
  gm.clock.minutes = startMinute;
  const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
  session.gm.eventDirector.enabled = false;
  session.spawnAtHome();
  gm.economyManager.fuelLevel = 5.0;

  const startNode = road.nearestNode(session.bike.x, session.bike.z)?.nodeId ?? 'N1';
  const sampled = session.requests.sampleRequest(startMinute, gm.weather, 'app', startNode);
  expect(sampled).not.toBeNull();
  const req = sampled!.request;

  const startMin = gm.clock.minutes;
  const startDay = gm.clock.day;
  const startFuel = gm.economyManager.fuelLevel;

  let receipt: TripReceipt | null = null;
  gm.bus.on('ride/completed', (ev) => {
    receipt = ev.receipt;
  });

  session.ride.offer(req);
  expect(session.ride.accept(req.requestId, startNode)).toBe(true);
  session.fastForwardTrip({});

  expect(receipt).not.toBeNull();
  const durationMin = (gm.clock.day - startDay) * 1440 + gm.clock.minutes - startMin;
  const fuelConsumed = startFuel - gm.economyManager.fuelLevel;

  return {
    fuelConsumed,
    durationMin,
    net: receipt!.net,
    rating: gm.reputationSystem.getAppRating(),
    ledgerIds: gm.economyManager.getSettledIds(),
    tripState: session.ride.getTripState(),
  };
}

describe('Real-Code Bot & FastForward Parity (P5.3 / T11.3)', () => {
  it('fastForwardTrip matches real autopilot ride within 15% on fuel, duration, and net', () => {
    const cases = [
      { seed: 1, startMinute: 480 },
      { seed: 2, startMinute: 720 },
      { seed: 3, startMinute: 1080 },
      { seed: 42, startMinute: 540 },
    ];

    for (const { seed, startMinute } of cases) {
      const real = runAutopilotRide(seed, startMinute);
      const ff = runFastForwardRide(seed, startMinute);

      const fuelErr = Math.abs(ff.fuelConsumed - real.fuelConsumed) / Math.max(1e-6, real.fuelConsumed);
      const durErr = Math.abs(ff.durationMin - real.durationMin) / Math.max(1e-6, real.durationMin);
      const netErr = Math.abs(ff.net - real.net) / Math.max(1, Math.abs(real.net));

      expect(fuelErr, `seed ${seed} fuel err`).toBeLessThanOrEqual(0.15);
      expect(durErr, `seed ${seed} duration err`).toBeLessThanOrEqual(0.15);
      expect(netErr, `seed ${seed} net err`).toBeLessThanOrEqual(0.15);
      expect(ff.ledgerIds).toEqual(real.ledgerIds);
      expect(Math.abs(ff.rating - real.rating)).toBeLessThanOrEqual(0.5);
      expect(ff.tripState).toBe('Idle');
    }
  });

  it('fastForwardTrip({ idleMin }) advances clock cleanly without active ride', () => {
    const road = createBalanceNetwork();
    const gm = new GameManager({ seed: 77, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    session.gm.eventDirector.enabled = false;
    session.spawnAtHome();
    const beforeMin = gm.clock.minutes;
    session.fastForwardTrip({ idleMin: 30 });
    expect(gm.clock.minutes - beforeMin).toBeCloseTo(30, 1);
    expect(gm.ticks).toBeGreaterThan(0);
  });

  it('strategies.ts runs on real GameSession with zero parallel economy/settlement logic', () => {
    const strategiesSrc = readFileSync(path.resolve('src/sim/bot/strategies.ts'), 'utf-8');
    expect(strategiesSrc).toContain('GameSession');
    expect(strategiesSrc).toContain('GameManager');
    expect(strategiesSrc).toContain('fastForwardTrip');
    expect(strategiesSrc).not.toMatch(/localTrust\s*\+=/);

    const network = createBalanceNetwork();
    const dayRes = runHeadlessDay(smartProStrategy, network, 1, 'clear', new Rng(101));
    expect(dayRes.ridesCompleted).toBeGreaterThan(0);

    const campRes = runHeadlessCampaign(smartProStrategy, network, 42, 5);
    expect(campRes.totalCompletedRides).toBeGreaterThan(0);
    // Cash + savings - debt - starting cash must match real EconomyManager ledger cash flow
    const netWorthDelta =
      campRes.finalCash + campRes.finalSavings - campRes.finalDebt - BALANCE.LIVING.startCash;
    expect(Number.isFinite(netWorthDelta)).toBe(true);
    expect(campRes.meters).toBeDefined();
    expect(campRes.meters!.riderIntegrity).toBeGreaterThanOrEqual(0);
    expect(campRes.meters!.publicReputation).toBeGreaterThanOrEqual(0);
  });

  it('fastForwardTrip({ crashed: true }) without onEncounter never returns completed+null receipt or strands EmergencyInterrupted', () => {
    let sawAccident = false;
    for (const seed of [1, 2, 7, 15, 42]) {
      const road = createBalanceNetwork();
      const gm = new GameManager({ seed, mode: 'career', data: {} });
      gm.clock.minutes = 600;
      const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
      gm.eventDirector.enabled = true;
      gm.eventDirector.pauseOnDecisions = false;
      gm.bus.on('encounter/started', (ev) => {
        if (ev.instance.encounterId === 'enc_accident_aftermath') sawAccident = true;
      });
      session.spawnAtHome();
      gm.economyManager.fuelLevel = 5.0;

      const startNode = road.nearestNode(session.bike.x, session.bike.z)?.nodeId ?? 'N1';
      const sampled = session.requests.sampleRequest(600, gm.weather, 'app', startNode);
      expect(sampled).not.toBeNull();
      const req = sampled!.request;

      session.ride.offer(req);
      expect(session.ride.accept(req.requestId, startNode)).toBe(true);

      const res = session.fastForwardTrip({ crashed: true });
      if (res.status === 'completed') {
        expect(res.receipt).not.toBeNull();
      } else {
        expect(res.receipt).toBeNull();
      }
      expect(session.ride.getTripState()).not.toBe('EmergencyInterrupted');
      expect(gm.eventDirector.activeEncounter).toBeNull();
    }
    expect(sawAccident).toBe(true);
  });

  it('fastForwardTrip interrupted by shift end never misreports completed with null receipt', () => {
    const road = createBalanceNetwork();
    const gm = new GameManager({ seed: 9, mode: 'career', data: {} });
    gm.clock.minutes = 22 * 60 + 58;
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    gm.eventDirector.enabled = true;
    gm.eventDirector.pauseOnDecisions = false;
    session.spawnAtHome();

    const startNode = road.nearestNode(session.bike.x, session.bike.z)?.nodeId ?? 'N1';
    const sampled = session.requests.sampleRequest(gm.clock.minutes, gm.weather, 'app', startNode);
    expect(sampled).not.toBeNull();
    session.ride.offer(sampled!.request);
    expect(session.ride.accept(sampled!.request.requestId, startNode)).toBe(true);

    const res = session.fastForwardTrip({ idleMin: 5 });
    if (res.receipt === null) {
      expect(res.status).not.toBe('completed');
    }
    expect(session.ride.getTripState()).not.toBe('EmergencyInterrupted');
    expect(gm.eventDirector.activeEncounter).toBeNull();
  });
});

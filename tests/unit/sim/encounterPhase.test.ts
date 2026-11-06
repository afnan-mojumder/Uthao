import { describe, it, expect } from 'vitest';
import { encounterPhaseFor } from '../../../src/sim/events/phase';
import { GameManager } from '../../../src/sim/GameManager';
import { SIM_DT } from '../../../src/config/constants';
import bike from '../../../data/encounters/bike.json';
import crime from '../../../data/encounters/crime.json';
import passenger from '../../../data/encounters/passenger.json';
import payment from '../../../data/encounters/payment.json';
import pickup from '../../../data/encounters/pickup.json';
import route from '../../../data/encounters/route.json';

const encounters = [...bike, ...crime, ...passenger, ...payment, ...pickup, ...route];

const FAR = 500;
const NEAR = 30;

describe('encounter phase from the live ride', () => {
  it('no active request is roaming', () => {
    expect(
      encounterPhaseFor({ trip: 'Idle', hasRequest: false, distToPickupM: FAR, distToDropoffM: FAR })
    ).toBe('roaming');
  });

  it('a request on offer is requestOffered', () => {
    expect(
      encounterPhaseFor({ trip: 'RequestAvailable', hasRequest: true, distToPickupM: FAR, distToDropoffM: FAR })
    ).toBe('requestOffered');
  });

  it('riding toward pickup is onTrip until the bike is close, then atPickup', () => {
    const far = encounterPhaseFor({ trip: 'EnRouteToPickup', hasRequest: true, distToPickupM: FAR, distToDropoffM: FAR });
    const near = encounterPhaseFor({ trip: 'EnRouteToPickup', hasRequest: true, distToPickupM: NEAR, distToDropoffM: FAR });
    expect(far).toBe('onTrip');
    expect(near).toBe('atPickup');
  });

  it('carrying a passenger is onTrip until the bike is close, then dropOff', () => {
    const far = encounterPhaseFor({ trip: 'EnRouteToDestination', hasRequest: true, distToPickupM: FAR, distToDropoffM: FAR });
    const near = encounterPhaseFor({ trip: 'EnRouteToDestination', hasRequest: true, distToPickupM: FAR, distToDropoffM: NEAR });
    expect(far).toBe('onTrip');
    expect(near).toBe('dropOff');
  });

  it('settling a finished trip is dropOff', () => {
    expect(
      encounterPhaseFor({ trip: 'Completing', hasRequest: true, distToPickupM: FAR, distToDropoffM: NEAR })
    ).toBe('dropOff');
  });

  it('an emergency interrupt shows no ride encounters', () => {
    expect(
      encounterPhaseFor({ trip: 'EmergencyInterrupted', hasRequest: true, distToPickupM: NEAR, distToDropoffM: NEAR })
    ).toBe('roaming');
  });
});

describe('ride encounters can fire', () => {
  it('an onTrip encounter fires while the sim is evaluated in the onTrip phase', () => {
    // Arrange
    const onTripIds = new Set(
      encounters
        .filter((e) => (e.trigger as { phase?: string }).phase === 'onTrip')
        .map((e) => e.id)
    );
    expect(onTripIds.size).toBeGreaterThan(0);
    const gm = new GameManager({ seed: 5, mode: 'career', data: { encounters } as never });
    gm.eventDirector.enabled = true;
    let started: string | null = null;
    gm.bus.on('encounter/started', ({ instance }) => {
      started = instance.encounterId;
    });

    // Act: ride at a standstill through the phase the bike is in
    for (let i = 0; i < 200000 && started === null; i++) {
      gm.tick(SIM_DT, 0, 'onTrip');
    }

    // Assert
    expect(started).not.toBeNull();
    expect(onTripIds.has(started!)).toBe(true);
  });
});

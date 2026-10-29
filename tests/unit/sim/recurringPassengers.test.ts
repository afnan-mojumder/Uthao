import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { Rng } from '../../../src/core/rng';
import { GameManager } from '../../../src/sim/GameManager';
import { CHARACTERS, isContactUnlocked } from '../../../src/sim/passenger/PassengerAI';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';
import { receipt } from '../../../src/sim/economy/fuel';

describe('T4.3 Recurring Passengers & Direct Bookings', () => {
  const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);

  it('defines all 10 fictional characters with fixed profile traits and preferred times', () => {
    expect(CHARACTERS.length).toBe(10);

    const expectedIds = [
      'char_ma',
      'char_mintu',
      'char_kamal',
      'char_nabila',
      'char_tanvir',
      'char_rahim',
      'char_ferdousi',
      'char_jamil',
      'char_morshed',
      'char_bablu',
    ];

    for (const id of expectedIds) {
      const char = CHARACTERS.find((c) => c.id === id);
      expect(char).toBeDefined();
      expect(char!.phone).toMatch(/^\+880/);
      expect(char!.homeNodeId).toBeTruthy();
      expect(char!.preferredTimes.length).toBeGreaterThanOrEqual(1);
      expect(char!.fixedTraits).toBeDefined();
      expect(typeof char!.budget).toBe('number');
      expect(typeof char!.safetySensitivity).toBe('number');
    }
  });

  it('regular requests appear only after threshold', () => {
    const rng = new Rng(42);
    let mockRelationships: Record<string, number> = {
      char_tanvir: 0,
      char_nabila: 10, // below 15
      char_rahim: 14, // just below 15
    };

    const generator = new RequestGenerator(roadNetwork, rng, {
      relationshipsProvider: () => mockRelationships,
    });

    // When relationship is below threshold (15), cannot emit recurring request
    expect(generator.canEmitRecurringRequest('char_tanvir', 540)).toBe(false);
    expect(generator.canEmitRecurringRequest('char_nabila', 540)).toBe(false);
    expect(generator.canEmitRecurringRequest('char_rahim', 600)).toBe(false);

    // sampleRecurringRequest returns null below threshold
    const reqBelow1 = generator.sampleRecurringRequest(540, 'clear', 'char_tanvir');
    expect(reqBelow1).toBeNull();

    const reqBelow2 = generator.sampleRecurringRequest(540, 'clear', 'char_nabila');
    expect(reqBelow2).toBeNull();

    // Now raise relationship to >= 15 (threshold reached)
    mockRelationships = {
      char_tanvir: 15,
      char_nabila: 20,
      char_rahim: 30,
    };

    // Within preferred morning rush times (08:00 - 10:00 -> 480 - 600)
    expect(generator.canEmitRecurringRequest('char_tanvir', 540)).toBe(true);
    expect(generator.canEmitRecurringRequest('char_nabila', 540)).toBe(true);

    const reqTanvir = generator.sampleRecurringRequest(540, 'clear', 'char_tanvir');
    expect(reqTanvir).not.toBeNull();
    expect(reqTanvir!.request.characterId).toBe('char_tanvir');
    expect(reqTanvir!.request.bookingType).toBe('direct');
    expect(reqTanvir!.profile.nameKey).toBe('character.tanvir.name');
    expect(reqTanvir!.profile.relationshipLevel).toBe(15);

    // Direct bookings have 0% commission
    const tripRec = receipt({
      requestId: reqTanvir!.request.requestId,
      fare: reqTanvir!.request.initialFare,
      bookingType: reqTanvir!.request.bookingType,
      distanceKm: reqTanvir!.request.estimatedDistance,
      durationMin: reqTanvir!.request.estimatedDuration,
    });
    expect(tripRec.commission).toBe(0);
  });

  it('relationship persists across days', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });

    // Starting relationship
    expect(gm.reputationSystem.getRelationship('char_nabila')).toBe(0);

    // Complete ride / build relationship on Day 1
    gm.reputationSystem.setRelationship('char_nabila', 20);
    gm.reputationSystem.setRelationship('char_tanvir', 18);
    expect(gm.reputationSystem.getRelationship('char_nabila')).toBe(20);
    expect(gm.reputationSystem.getRelationship('char_tanvir')).toBe(18);

    // End day 1 shift and sleep to start Day 2
    gm.clock.minutes = 13 * 60; // Advance time past 12:00
    gm.dispatch({ type: 'sleep' });

    // Verify relationship levels persisted across the day boundary
    expect(gm.clock.day).toBe(2);
    expect(gm.reputationSystem.getRelationship('char_nabila')).toBe(20);
    expect(gm.reputationSystem.getRelationship('char_tanvir')).toBe(18);

    // Verify unlocked in contacts check on Day 2
    expect(
      isContactUnlocked('char_nabila', gm.reputationSystem.getRelationship('char_nabila'))
    ).toBe(true);
    expect(
      isContactUnlocked('char_tanvir', gm.reputationSystem.getRelationship('char_tanvir'))
    ).toBe(true);
  });
});

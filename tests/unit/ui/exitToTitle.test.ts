import { describe, it, expect, beforeEach } from 'vitest';
import {
  exitToTitle,
  screenSignal,
  pausedSignal,
  tutorialSignal,
  phoneSignal,
  negotiationSignal,
  garageSignal,
  journalSignal,
  dayEndSignal,
  endingSignal,
  tripSummarySignal,
  choiceSignal,
  saveSlotsSignal,
  impactSignal,
} from '../../../src/ui/store';

describe('exitToTitle (audit H-2: tutorial must not cover the title)', () => {
  beforeEach(() => {
    screenSignal.value = 'game';
    pausedSignal.value = true;
    tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  });

  it('clears the first-ride tutorial when the player leaves for the title', () => {
    // Arrange: the tutorial is open mid-ride (set in beforeEach).
    // Act
    exitToTitle();
    // Assert
    expect(tutorialSignal.value.active).toBe(false);
    expect(screenSignal.value).toBe('title');
    expect(pausedSignal.value).toBe(false);
  });

  it('clears all open modal and panel signals when returning to title', () => {
    phoneSignal.value = { ...phoneSignal.value, open: true };
    negotiationSignal.value = { active: true, session: {} as never, lastResult: null };
    garageSignal.value = { ...garageSignal.value, open: true };
    journalSignal.value = true;
    dayEndSignal.value = { active: true, summary: {} as never };
    endingSignal.value = { active: true, result: {} as never, choices: [] };
    tripSummarySignal.value = {
      requestId: 'req_1',
      fare: 100,
      tip: 0,
      bonus: 0,
      commission: 15,
      fuelCost: 10,
      fuelLiters: 0.1,
      otherCosts: 0,
      penalties: 0,
      compensation: 0,
      net: 75,
      distanceKm: 2,
      durationMin: 8,
      rating: 5,
      consequences: [],
    };
    choiceSignal.value = { active: true, prompt: 'test', options: [{ id: '1', text: 'opt' }], instanceId: 'inst' };
    saveSlotsSignal.value = { isOpen: true, mode: 'save' };
    impactSignal.value = { kind: 'bump', seq: 1 };
    phoneSignal.value = {
      ...phoneSignal.value,
      availableDeliveries: [
        {
          id: 'del_test',
          senderNameKey: 'poi.mirpara.tea_stall',
          pickupPoiId: 'poi_mirpara_tea_stall',
          pickupNodeId: 'N1',
          dropoffNodeId: 'N2',
          itemType: 'parcel',
          fragile: false,
          basePayout: 120,
          timeLimitMinutes: 20,
          status: 'offered',
        },
      ],
    };

    exitToTitle();

    expect(tutorialSignal.value.active).toBe(false);
    expect(pausedSignal.value).toBe(false);
    expect(screenSignal.value).toBe('title');
    expect(phoneSignal.value.open).toBe(false);
    expect(negotiationSignal.value.active).toBe(false);
    expect(negotiationSignal.value.session).toBeNull();
    expect(garageSignal.value.open).toBe(false);
    expect(journalSignal.value).toBe(false);
    expect(dayEndSignal.value.active).toBe(false);
    expect(dayEndSignal.value.summary).toBeNull();
    expect(endingSignal.value.active).toBe(false);
    expect(endingSignal.value.result).toBeNull();
    expect(tripSummarySignal.value).toBeNull();
    expect(choiceSignal.value.active).toBe(false);
    expect(saveSlotsSignal.value.isOpen).toBe(false);
    expect(impactSignal.value.kind).toBeNull();
    expect(phoneSignal.value.availableDeliveries).toEqual([]);
    expect(phoneSignal.value.activeDeliveries).toEqual([]);
  });
});

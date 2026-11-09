import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  phoneSignal,
  choiceSignal,
  bindEventBusToStore,
} from '../../../src/ui/store';
import { EventBus } from '../../../src/core/events';
import type { GameEvents } from '../../../src/core/events';
import type { RideRequest } from '../../../src/core/types';

const request: RideRequest = {
  requestId: 'req_held_01',
  passengerId: 'p_commuter_01',
  pickupNodeId: 'node_farmgate',
  destinationNodeId: 'node_dhanmondi',
  initialFare: 120,
  estimatedDistance: 3.5,
} as RideRequest;

describe('audit H-era: ride requests under an open story card', () => {
  let bus: EventBus<GameEvents>;
  let unbind: () => void;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    unbind = bindEventBusToStore(bus);
    phoneSignal.value = {
      ...phoneSignal.value,
      open: false,
      incomingRequest: null,
      unreadCount: 0,
      timeoutRemaining: 15,
    };
    choiceSignal.value = { ...choiceSignal.value, active: false };
  });

  afterEach(() => {
    unbind();
    choiceSignal.value = { ...choiceSignal.value, active: false };
  });

  it('holds a request that arrives while a card is open, and shows it after the card closes', () => {
    // Arrange: a story card covers the screen.
    choiceSignal.value = { ...choiceSignal.value, active: true };

    // Act: a request arrives under the card.
    bus.emit('ride/requested', { request });

    // Assert: nothing is shown on top of the card, but the request is counted.
    expect(phoneSignal.value.incomingRequest).toBeNull();
    expect(phoneSignal.value.unreadCount).toBe(1);

    // Act: the player closes the card.
    choiceSignal.value = { ...choiceSignal.value, active: false };

    // Assert: the held request now appears with a fresh timer.
    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_held_01');
    expect(phoneSignal.value.timeoutRemaining).toBe(15);
  });

  it('shows a request immediately when no card is open', () => {
    bus.emit('ride/requested', { request });
    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_held_01');
  });
});

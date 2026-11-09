import { describe, it, expect } from 'vitest';
import { passengerHintKey } from '../../../src/ui/hud/passengerHint';

describe('HUD passenger hint (audit: HUD said no passenger during a fare)', () => {
  it('shows the drop-off line while the passenger is on the bike', () => {
    expect(passengerHintKey('OnTrip')).toBe('hud.passenger.ontrip');
    expect(passengerHintKey('AtPickup')).toBe('hud.passenger.ontrip');
    expect(passengerHintKey('AtDestination')).toBe('hud.passenger.ontrip');
  });

  it('shows the pickup line before the passenger is aboard', () => {
    expect(passengerHintKey('Accepted')).toBe('hud.passenger.pickup');
    expect(passengerHintKey('RiderEnRoute')).toBe('hud.passenger.pickup');
    expect(passengerHintKey('Negotiating')).toBe('hud.passenger.pickup');
  });

  it('shows free roam only once the fare has ended', () => {
    expect(passengerHintKey('Completed')).toBe('hud.passenger.none');
    expect(passengerHintKey('Cancelled')).toBe('hud.passenger.none');
    expect(passengerHintKey(undefined)).toBe('hud.passenger.none');
  });
});

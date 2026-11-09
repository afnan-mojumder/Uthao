import type { PassengerStatus } from '../../core/types';

/**
 * The HUD line under the passenger name. Every status maps to one line, so no
 * status falls through to "Free Roam" while a fare is still on (audit: the HUD
 * said "no passenger" during a ride).
 */
export function passengerHintKey(status: PassengerStatus | 'None' | undefined): string {
  switch (status) {
    case 'OnTrip':
    case 'AtPickup':
    case 'AtDestination':
      return 'hud.passenger.ontrip';
    case 'Offered':
    case 'Negotiating':
    case 'Accepted':
    case 'RiderEnRoute':
      return 'hud.passenger.pickup';
    default:
      return 'hud.passenger.none';
  }
}

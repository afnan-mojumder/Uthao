import { describe, it, expect } from 'vitest';
import { createPassengerFsm } from '../../../src/sim/ride/passengerFsm';

describe('passengerFsm', () => {
  it('full lifecycle transitions through states', () => {
    const fsm = createPassengerFsm();
    expect(fsm.state).toBe('WaitingForPickup');

    expect(fsm.send('riderArrived')).toBe('Negotiating');
    expect(fsm.send('fareAccepted')).toBe('OnTrip');
    expect(fsm.send('arrived')).toBe('Completed');
    expect(fsm.send('paidAndRated')).toBe('Reviewed');
  });

  it('cannot bargain after Completed except via paymentDispute', () => {
    const fsm = createPassengerFsm();
    fsm.send('riderArrived');
    fsm.send('fareAccepted');
    fsm.send('arrived');
    expect(fsm.state).toBe('Completed');

    // Trying to send fareAccepted or fareRejected throws in dev
    expect(fsm.can('fareAccepted')).toBe(false);
    expect(fsm.can('fareRejected')).toBe(false);
    expect(() => fsm.send('fareAccepted')).toThrow();

    // But paymentDispute is allowed and transitions to HandlingIncident
    expect(fsm.can('paymentDispute')).toBe(true);
    expect(fsm.send('paymentDispute')).toBe('HandlingIncident');
  });

  it('walk away transitions Negotiating to Cancelled', () => {
    const fsm = createPassengerFsm();
    fsm.send('riderArrived');
    expect(fsm.send('walkAway')).toBe('Cancelled');
  });
});

import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { GameManager } from '../../../src/sim/GameManager';
import { BALANCE } from '../../../src/config/balance';
import { SIM_DT } from '../../../src/config/constants';

describe('family advances', () => {
  it('an advance is posted to the ledger, so cash still reconciles with the ledger', () => {
    // Arrange
    const econ = new EconomyManager(new EventBus<GameEvents>(), { cash: 0, debt: 0 });
    const cashBefore = econ.cash;

    // Act
    const accepted = econ.askAdvance('char_ma', 500, 1, 0);

    // Assert: cash rose by the advance, and the ledger shows it as a transaction
    expect(accepted).toBe(true);
    expect(econ.cash - cashBefore).toBe(500);
    expect(econ.getLedger().at(-1)?.amount).toBe(500);
  });

  it('total advances are capped, so the debt cannot grow without limit', () => {
    // Arrange
    const econ = new EconomyManager(new EventBus<GameEvents>(), { cash: 0, debt: 0 });

    // Act: ask for far more than the cap, repeatedly
    for (let i = 0; i < 20; i++) econ.askAdvance('char_mintu', 500, 1, i);

    // Assert
    expect(econ.debt).toBeLessThanOrEqual(BALANCE.LIVING.advanceCap);
    expect(econ.cash).toBeLessThanOrEqual(BALANCE.LIVING.advanceCap);
  });
});

describe('delay rent', () => {
  it('delaying today\'s rent gives the money back and adds the rent to the next rent day', () => {
    // Arrange: a rent day, with the rent already posted at shift end
    const gm = new GameManager({ seed: 3, mode: 'career', data: {} as never });
    gm.clock.day = 7; // a rent day, so the command is not refused for timing
    gm.economyManager.cash = 10000;
    const rent = BALANCE.LIVING.rentAmount;
    gm.clock.minutes = 13 * 60;
    gm.dispatch({ type: 'endShift' }); // posts today's rent, as a real shift end does
    const cashAfterRent = gm.economyManager.cash;

    // Act
    const result = gm.dispatch({ type: 'delayRent' });

    // Assert: the rent is returned to cash today...
    expect(result.success).toBe(true);
    expect(gm.economyManager.cash - cashAfterRent).toBe(rent);
    // ...and is charged again on the next rent day, on top of that day's rent
    const next = gm.economyManager.postDailyLivingExpenses(14, 0);
    expect(next.rent).toBe(rent + rent);
  });

  it('a second delay is refused and changes nothing', () => {
    // Arrange
    const gm = new GameManager({ seed: 3, mode: 'career', data: {} as never });
    gm.clock.day = 7;
    gm.economyManager.cash = 10000;
    gm.clock.minutes = 13 * 60;
    gm.dispatch({ type: 'endShift' });
    gm.dispatch({ type: 'delayRent' });
    const maRelationship = gm.story.characterRelationships['char_ma'];

    // Act
    const second = gm.dispatch({ type: 'delayRent' });

    // Assert: refused, and Ma's trust is not docked again
    expect(second.success).toBe(false);
    expect(gm.story.characterRelationships['char_ma']).toBe(maRelationship);
  });
});

describe('shift end and rides', () => {
  it('an offer that has not been agreed does not hold the shift open', () => {
    // Arrange: a request is on offer, nobody is in the bike
    const gm = new GameManager({ seed: 5, mode: 'career', data: {} as never });
    gm.rideManager = { getTripState: () => 'RequestAvailable' } as never;
    gm.clock.minutes = 13 * 60;

    // Act
    const result = gm.dispatch({ type: 'endShift' });

    // Assert
    expect(result.success).toBe(true);
    expect(gm.shiftEnded).toBe(true);
  });

  it('the forced 23:00 shift end waits while a ride is still in progress', () => {
    // Arrange: a ride is active at 22:59
    const gm = new GameManager({ seed: 5, mode: 'career', data: {} as never });
    gm.rideManager = { getTripState: () => 'EnRouteToDestination' } as never;
    gm.clock.minutes = 22 * 60 + 59;

    // Act: run past 23:00
    for (let i = 0; i < 600; i++) gm.tick(SIM_DT, 0);

    // Assert: the trip's money must land before the day's summary is taken
    expect(gm.shiftEnded).toBe(false);
  });

  it('the shift ends once the ride is over', () => {
    // Arrange
    const gm = new GameManager({ seed: 5, mode: 'career', data: {} as never });
    let rideActive = true;
    gm.rideManager = { getTripState: () => (rideActive ? 'EnRouteToDestination' : 'Idle') } as never;
    gm.clock.minutes = 22 * 60 + 59;
    for (let i = 0; i < 600; i++) gm.tick(SIM_DT, 0);

    // Act: the ride finishes, then time passes
    rideActive = false;
    for (let i = 0; i < 600; i++) gm.tick(SIM_DT, 0);

    // Assert
    expect(gm.shiftEnded).toBe(true);
  });

  it('the player cannot end the shift in the middle of a ride', () => {
    // Arrange
    const gm = new GameManager({ seed: 5, mode: 'career', data: {} as never });
    gm.rideManager = { getTripState: () => 'EnRouteToDestination' } as never;
    gm.clock.minutes = 13 * 60;

    // Act
    const result = gm.dispatch({ type: 'endShift' });

    // Assert
    expect(result.success).toBe(false);
    expect(gm.shiftEnded).toBe(false);
  });
});

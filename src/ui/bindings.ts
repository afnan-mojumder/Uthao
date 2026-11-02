import { fuelUsed } from '../sim/economy/fuel';
import type { GameSession } from '../sim/GameSession';
import type { SaveSystem } from '../sim/save/SaveSystem';
import { respond } from '../sim/negotiation/NegotiationSystem';
import type { BikeId } from '../core/types';
import {
  setChoiceDispatcher,
  setRequestDispatchers,
  setPhoneContactDispatcher,
  setNegotiationActionDispatcher,
  setDayEndDispatchers,
  setGarageDispatchers,
  setBikeDispatchers,
  setMenuDispatchers,
  setSaveDispatchers,
  setTutorialDispatchers,
  setEndingDispatchers,
  negotiationSignal,
  tutorialSignal,
  pausedSignal,
} from './store';

/**
 * Wires every UI dispatcher slot declared in `store.ts` to the running
 * `GameSession`. Each binding either dispatches a `Command` through
 * `GameManager.dispatch`, or (where no Command exists for the action, same as
 * the pre-T7.4 code it replaces) calls the equivalent sim-side method
 * directly (`RideManager.accept`, `GameSession.newCareer`, ...). This is the
 * single place that turns a UI button press into a real game-state change —
 * UI components themselves only read signals and invoke `on*Callback`.
 */
export function bindUi(session: GameSession, saveSystem?: SaveSystem): void {
  const gm = session.gm;
  const rideManager = session.ride;

  setChoiceDispatcher((choiceId, instanceId) => {
    gm.dispatch({ type: 'chooseEncounterOption', choiceId, instanceId });
  });

  setRequestDispatchers(
    (requestId) => rideManager.accept(requestId),
    (requestId) => rideManager.cancel(requestId, 'rider', 'declined')
  );

  // T7.4: previously unbound. "Calling" an unlocked contact samples a
  // recurring request from them (same path RequestGenerator uses for
  // regulars) and offers it, same as any other incoming ride.
  setPhoneContactDispatcher((characterId) => {
    const sample = session.requests.sampleRecurringRequest(
      gm.clock.minutes,
      gm.weather,
      characterId
    );
    if (sample) rideManager.offer(sample.request);
  });

  setNegotiationActionDispatcher((action) => {
    const current = negotiationSignal.value.session;
    if (!current) return;
    const result = respond(current, action);
    negotiationSignal.value = {
      active: result.session.status === 'active',
      session: result.session,
      lastResult: result,
    };
    if (result.outcome?.kind === 'accepted') {
      rideManager.agreeFare(result.outcome.fare);
    } else if (result.outcome?.kind === 'walkedAway') {
      rideManager.walkAwayNegotiation();
    }
  });

  setDayEndDispatchers(
    () => gm.dispatch({ type: 'sleep' }),
    () => gm.dispatch({ type: 'delayRent' }),
    (from, amount) => gm.dispatch({ type: 'askAdvance', from, amount })
  );

  setGarageDispatchers(
    (item) => gm.dispatch({ type: 'repair', item }),
    (upgradeId) => gm.dispatch({ type: 'buyUpgrade', upgradeId })
  );

  setBikeDispatchers(
    (bikeId, useTradeIn) =>
      gm.dispatch({ type: 'buyBike', bikeId: bikeId as BikeId, useTradeIn }),
    (bikeId) => gm.dispatch({ type: 'switchBike', bikeId: bikeId as BikeId })
  );

  const startNewCareer = () => {
    session.newCareer();
    tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  };

  setMenuDispatchers(
    startNewCareer,
    () => {
      if (saveSystem) {
        const res = saveSystem.loadGame('auto');
        if (res.success) gm.applySnapshot(res.gm.snapshot(), res.save.rngState);
      }
    },
    () => session.enterEndless(),
    () => {
      pausedSignal.value = false;
    },
    (nodeId) => gm.dispatch({ type: 'setWaypoint', nodeId })
  );

  setSaveDispatchers(
    (slot) => saveSystem?.save(gm, slot),
    (slot) => {
      if (!saveSystem) return;
      const res = saveSystem.loadGame(slot);
      if (res.success) gm.applySnapshot(res.gm.snapshot(), res.save.rngState);
    }
  );

  setTutorialDispatchers({
    advance: (nextStep) => {
      tutorialSignal.value = { ...tutorialSignal.value, step: nextStep };
      if (nextStep === 'bike_inspection') {
        gm.bus.emit('story/flag', { key: 'tutorial_bike_started', value: true });
      } else if (nextStep === 'tea_stall') {
        gm.bus.emit('story/flag', { key: 'tutorial_mintu_advice', value: true });
      } else if (nextStep === 'receipt') {
        const fare = tutorialSignal.value.agreedFare ?? 100;
        // T8.2: the tutorial ride is paid through the same exactly-once path as a live ride.
        const tutorialRating = gm.reputationSystem.getActiveTripRating();
        const settled = gm.economyManager.settleTrip({
          requestId: 'req_tutorial_01',
          fare,
          tip: 0,
          bonus: 0,
          bookingType: 'app',
          fuelLiters: fuelUsed(0.1, 0),
          otherCosts: 0,
          penalties: 0,
          compensation: 0,
          durationMin: 3,
          distanceKm: 0.1,
          rating: tutorialRating,
          day: gm.clock.day,
          minute: gm.clock.minutes,
          consequences: [],
        });
        if (settled) {
          gm.bus.emit('ride/completed', { requestId: settled.requestId, receipt: settled });
        }
      }
    },
    negotiate: (fare) => {
      tutorialSignal.value = { ...tutorialSignal.value, agreedFare: fare };
      gm.bus.emit('story/flag', { key: 'tutorial_nabila_negotiated', value: true });
      rideManager.agreeFare(fare);
    },
    complete: () => {
      tutorialSignal.value = { active: false, step: 'completed' };
      gm.bus.emit('story/flag', { key: 'tutorial_ride_done', value: true });
    },
  });

  // T7.4: previously unbound. Selecting a career path deducts its savings
  // cost (through GameManager.dispatch -> EconomyManager, never the UI) and
  // records the choice as a story flag; restart/endless reuse the same
  // session methods as the main menu's equivalent buttons.
  setEndingDispatchers(
    (choice) => gm.dispatch({ type: 'selectCareerChoice', choice }),
    startNewCareer,
    () => session.enterEndless()
  );
}

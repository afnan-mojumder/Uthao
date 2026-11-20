import type { GameSession } from '../sim/GameSession';
import type { SaveSystem } from '../sim/save/SaveSystem';
import { respond } from '../sim/negotiation/NegotiationSystem';
import { nearestPlaceKey } from '../sim/ride/rideView';
import type { BikeId } from '../core/types';
import type { SaveSlot } from '../sim/save/migrations';
import { requestFreshCareer, resolveCareerSeed } from './freshCareer';
import { saveSlotsRefreshSignal } from './menus/SaveSlots';
import {
  setChoiceDispatcher,
  setRequestDispatchers,
  setPhoneContactDispatcher,
  setNegotiationActionDispatcher,
  setDayEndDispatchers,
  setEndShiftEarlyDispatcher,
  setDeliveryDispatcher,
  setGarageDispatchers,
  setBikeDispatchers,
  setFuelDispatchers,
  setChargePhoneDispatcher,
  setMenuDispatchers,
  setHasSaveCallback,
  setSaveDispatchers,
  setActiveSaveSystem,
  setTutorialDispatchers,
  setEndingDispatchers,
  syncGarageState,
  showDeliveryNotice,
  negotiationSignal,
  choiceSignal,
  tutorialSignal,
  pausedSignal,
  screenSignal,
  phoneSignal,
  saveStatusSignal,
  endShiftBlockedKeySignal,
} from './store';

let activeBindingsCleanup: (() => void) | null = null;

/**
 * Wires every UI dispatcher slot declared in `store.ts` to the running
 * `GameSession`. Each binding either dispatches a `Command` through
 * `GameManager.dispatch`, or (where no Command exists for the action, same as
 * the pre-T7.4 code it replaces) calls the equivalent sim-side method
 * directly (`RideManager.accept`, `GameSession.newCareer`, ...). This is the
 * single place that turns a UI button press into a real game-state change —
 * UI components themselves only read signals and invoke `on*Callback`.
 */
export function bindUi(session: GameSession, saveSystem?: SaveSystem): () => void {
  activeBindingsCleanup?.();

  const gm = session.gm;
  const rideManager = session.ride;
  const unsubscribers: Array<() => void> = [];
  setActiveSaveSystem(saveSystem ?? null);

  const enrichDeliveryPlaces = (jobs: ReturnType<typeof gm.deliveryManager.getAvailableJobs>) => {
    const roadNet = (rideManager as { roadNetwork?: Parameters<typeof nearestPlaceKey>[0]['roadNetwork'] } | undefined)?.roadNetwork;
    if (!roadNet) return jobs;
    return jobs.map((job) => ({
      ...job,
      pickupPlaceKey: job.pickupPlaceKey ?? (nearestPlaceKey({ roadNetwork: roadNet }, job.pickupNodeId) || undefined),
      dropoffPlaceKey: job.dropoffPlaceKey ?? (nearestPlaceKey({ roadNetwork: roadNet }, job.dropoffNodeId) || undefined),
    }));
  };

  const syncDeliveries = () => {
    const dm = gm?.deliveryManager;
    if (!dm) return;
    phoneSignal.value = {
      ...phoneSignal.value,
      availableDeliveries: enrichDeliveryPlaces(dm.getAvailableJobs()),
      activeDeliveries: enrichDeliveryPlaces(dm.getActiveJobs()),
    };
  };

  const syncPauseEndShift = () => {
    endShiftBlockedKeySignal.value =
      typeof gm.getEndShiftEarlyBlockedReasonKey === 'function'
        ? gm.getEndShiftEarlyBlockedReasonKey()
        : null;
  };

  const syncGarage = () => syncGarageState(gm);
  const syncContacts = () => {
    if (!gm?.reputationSystem) return;
    phoneSignal.value = {
      ...phoneSignal.value,
      relationships: gm.reputationSystem.getAllRelationships(),
    };
  };
  if (gm?.economyManager) syncGarage();
  if (gm?.reputationSystem) syncContacts();
  if (gm?.deliveryManager) syncDeliveries();
  syncPauseEndShift();

  unsubscribers.push(
    pausedSignal.subscribe((isPaused) => {
      if (isPaused) syncPauseEndShift();
      else endShiftBlockedKeySignal.value = null;
    })
  );
  unsubscribers.push(
    screenSignal.subscribe((scr) => {
      if (scr === 'pause') syncPauseEndShift();
    })
  );

  if (gm?.bus) {
    unsubscribers.push(gm.bus.on('economy/transaction', syncGarage));
    unsubscribers.push(gm.bus.on('bike/swapped', syncGarage));
    unsubscribers.push(gm.bus.on('upgrade/purchased', syncGarage));
    unsubscribers.push(
      gm.bus.on('reputation/changed', () => {
        syncGarage();
        syncContacts();
      })
    );
    unsubscribers.push(
      gm.bus.on('karma/changed', () => {
        syncGarage();
        syncContacts();
      })
    );
    unsubscribers.push(gm.bus.on('player/kamalProximity', syncGarage));
    unsubscribers.push(gm.bus.on('bike/wearChanged', syncGarage));
    unsubscribers.push(gm.bus.on('clock/hour', syncPauseEndShift));
    unsubscribers.push(gm.bus.on('trip/state', syncPauseEndShift));
    unsubscribers.push(
      gm.bus.on('day/ended', () => {
        syncGarage();
        syncPauseEndShift();
      })
    );
    unsubscribers.push(
      gm.bus.on('day/started', () => {
        syncGarage();
        syncContacts();
        syncDeliveries();
        syncPauseEndShift();
      })
    );
    unsubscribers.push(
      gm.bus.on('state/restored', () => {
        syncGarage();
        syncContacts();
        syncDeliveries();
        syncPauseEndShift();
      })
    );
  }

  setChoiceDispatcher((choiceId, instanceId) => {
    if (instanceId.startsWith('dispute:')) {
      if (
        choiceId === 'acceptPartial' ||
        choiceId === 'insistFull' ||
        choiceId === 'reportSupport'
      ) {
        const resolved = rideManager.resolveDispute(choiceId);
        if (!resolved && choiceSignal.value.instanceId === instanceId) {
          choiceSignal.value = {
            active: false,
            prompt: '',
            promptVars: undefined,
            options: [],
            instanceId: undefined,
          };
        }
      }
      return;
    }
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
    // Only the live negotiation for the ride that is still active may act.
    if (!current || current.status !== 'active') return;
    if (rideManager.getActiveRequest()?.requestId !== current.req.requestId) return;
    // Relocation and alley refusal use the sim's measured option, never numbers the panel sent.
    const choice = action.kind === 'pickupAdjust' ? session.pickupChoice() : null;
    if (action.kind === 'pickupAdjust' && !choice) return;
    const alley = action.kind === 'refuseAlley' ? (session.alleyChoice?.() ?? null) : null;
    if (action.kind === 'refuseAlley' && !alley) return;

    const effectiveAction = choice
      ? { kind: 'pickupAdjust' as const, walkM: choice.walkM, savesMin: choice.savesMin }
      : alley
        ? { kind: 'refuseAlley' as const, walkM: alley.walkM }
        : action;
    const result = respond(current, effectiveAction);
    session.applyNegotiationResult?.(result);
    let next = result.session;
    const accepted = result.outcome?.kind === 'accepted';
    // A successful pickupAdjust only raises the walked distance; it does not end the
    // negotiation and carries no outcome, so it must be detected from the session.
    const relocated =
      action.kind === 'pickupAdjust' &&
      result.outcome === undefined &&
      result.session.walkM > current.walkM;
    if (choice && relocated) {
      if (rideManager.relocatePickup(choice.nodeId, choice.walkM)) {
        next = session.repriceNegotiation(result.session);
      } else {
        // The pickup did not move, so the walk penalty must not stick: keep only the patience cost.
        next = { ...current, currentPatience: result.session.currentPatience };
      }
    }
    let nextDestinationKey = negotiationSignal.value.destinationKey;
    const alleyMoved =
      action.kind === 'refuseAlley' &&
      result.outcome === undefined &&
      Boolean(result.session.alleyRefused);
    if (alley && alleyMoved) {
      if (rideManager.relocateAlley?.(alley.nodeId, alley.walkM, alley.target)) {
        next = session.repriceNegotiation(result.session);
        if (alley.target === 'destination' && next.req.destinationNodeId) {
          nextDestinationKey = nearestPlaceKey(rideManager, next.req.destinationNodeId);
        }
      } else {
        next = { ...current, currentPatience: result.session.currentPatience, alleyRefused: false };
      }
    }
    negotiationSignal.value = {
      active: next.status === 'active',
      session: next,
      lastResult: result,
      mood: rideManager.getPassengerMood(),
      pickup: next.status === 'active' ? session.pickupChoice() : null,
      alley: next.status === 'active' && !next.alleyRefused ? (session.alleyChoice?.() ?? null) : null,
      destinationKey: nextDestinationKey,
    };
    if (accepted && result.outcome?.kind === 'accepted') {
      if (action.kind === 'offApp') session.markOffApp();
      const earnedDiscount = action.kind === 'discount' && result.outcome.fare <= current.fairFare;
      rideManager.agreeFare(
        result.outcome.fare,
        earnedDiscount ? { discount: true } : undefined
      );
    } else if (result.outcome?.kind === 'walkedAway') {
      // The rider declining ends in Declined; the passenger losing patience ends in Cancelled.
      if (action.kind === 'decline') {
        const id = rideManager.getActiveRequest()?.requestId;
        if (id) rideManager.cancel(id, 'rider', 'declined');
        negotiationSignal.value = { ...negotiationSignal.value, active: false };
      } else {
        rideManager.walkAwayNegotiation();
      }
    }
  });

  setDayEndDispatchers(
    () => gm.dispatch({ type: 'sleep' }),
    () => gm.dispatch({ type: 'delayRent' }),
    (from, amount) => gm.dispatch({ type: 'askAdvance', from, amount }),
    (amount) => gm.dispatch({ type: 'depositSavings', amount }),
    (amount) => gm.dispatch({ type: 'withdrawSavings', amount }),
    (amount) => gm.dispatch({ type: 'repayDebt', amount })
  );

  setEndShiftEarlyDispatcher(() => {
    const res = gm.dispatch({ type: 'endShiftEarly' });
    if (res.success) {
      pausedSignal.value = false;
      screenSignal.value = 'game';
      endShiftBlockedKeySignal.value = null;
    } else {
      syncPauseEndShift();
    }
  });

  setDeliveryDispatcher((jobId) => {
    const res = gm.dispatch({ type: 'acceptDelivery', jobId });
    if (!res.success && res.reason === 'Finish the active ride first') {
      showDeliveryNotice('delivery.blocked_active_ride');
    } else if (!res.success && res.reason === 'Luggage capacity full') {
      showDeliveryNotice('delivery.luggage_full', {
        max: gm.deliveryManager.getMaxCapacity(),
      });
    }
  });

  setGarageDispatchers(
    (item) => gm.dispatch({ type: 'repair', item }),
    (upgradeId) => gm.dispatch({ type: 'buyUpgrade', upgradeId })
  );

  // T8.3: fill the tank (the command charges money and checks the station) or
  // call a paid fuel rescue. The UI only dispatches; GameManager decides.
  setFuelDispatchers(
    () =>
      void gm.dispatch({
        type: 'refuelAtStation',
        liters: gm.economyManager.maxFuelL() - gm.economyManager.fuelLevel,
      }),
    () => void gm.dispatch({ type: 'callFuelRescue' })
  );

  // T8.4: charge the phone at home or a tea stall (a real, timed action).
  setChargePhoneDispatcher((where) => void gm.dispatch({ type: 'chargePhone', location: where }));

  setBikeDispatchers(
    (bikeId, useTradeIn) =>
      gm.dispatch({ type: 'buyBike', bikeId: bikeId as BikeId, useTradeIn }),
    (bikeId) => gm.dispatch({ type: 'switchBike', bikeId: bikeId as BikeId })
  );

  const startNewCareer = () => {
    // A new career needs a fresh game, so every system starts from its defaults.
    // Reload for one; the boot starts the career (main.ts). Without session
    // storage, start in place.
    if (requestFreshCareer() && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    session.newCareer(resolveCareerSeed());
    tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  };

  const applyLoadedSave = (slot: SaveSlot): boolean => {
    if (!saveSystem) return false;
    const res = saveSystem.loadGame(slot);
    if (!res.success) {
      saveSlotsRefreshSignal.value++;
      return false;
    }
    gm.applySnapshot(res.gm.snapshot(), res.save.rngState);
    if (res.save.rideMeta?.hadUnsettledTrip) {
      showDeliveryNotice('save.unsettled_trip_cancelled');
    }
    return true;
  };

  setMenuDispatchers(
    startNewCareer,
    () => {
      const slot = saveSystem?.latestSlot();
      if (slot) applyLoadedSave(slot);
      gm.paused = false;
      pausedSignal.value = false;
    },
    () => {
      session.enterEndless();
      gm.paused = false;
      pausedSignal.value = false;
    },
    () => {
      pausedSignal.value = false;
    },
    (nodeId) => gm.dispatch({ type: 'setWaypoint', nodeId })
  );
  setHasSaveCallback(() => saveSystem?.hasAnySave() ?? false);

  setSaveDispatchers(
    (slot) => {
      const res = saveSystem?.save(gm, slot);
      if (res) {
        saveStatusSignal.value = res.success ? 'saved' : 'failed';
        saveSlotsRefreshSignal.value++;
      }
    },
    (slot) => {
      applyLoadedSave(slot);
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
        session.settleTutorialRide(fare);
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

  const cleanup = () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
    if (activeBindingsCleanup === cleanup) {
      activeBindingsCleanup = null;
    }
  };
  activeBindingsCleanup = cleanup;
  return cleanup;
}

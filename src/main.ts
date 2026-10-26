import { render, h } from 'preact';
import { GameManager, runFrame } from './sim/GameManager';
import { Renderer } from './render/Renderer';
import { initDebugApi } from './debug/debugApi';
import { SIM_DT } from './config/constants';
import {
  createDefaultBikeSpec,
  createDefaultBikeState,
  stepBike,
  type BikeInput,
} from './physics/bikeModel';
import { RoadNetwork } from './sim/road/RoadNetwork';
import { RideManager } from './sim/ride/RideManager';
import { AutopilotController } from './debug/autopilot';
import { Hud } from './ui/hud/Hud';
import { InputManager } from './input';
import { App } from './ui/App';
import {
  bindEventBusToStore,
  pausedSignal,
  contextLostSignal,
  unsupportedSignal,
  hudSignal,
  isMapOpenSignal,
  isPhoneOpenSignal,
  isStoryModalOpenSignal,
  isShowcaseModalOpenSignal,
  activePoliceCaseSignal,
  activeCrimeEncounterSignal,
  activeAccidentSignal,
  daySummarySignal,
} from './ui/store';
import { PoliceEncounterSystem } from './sim/darkChoices/PoliceEncounterSystem';
import { CrimeEncounterSystem } from './sim/darkChoices/CrimeEncounterSystem';
import { AccidentManager } from './sim/darkChoices/AccidentManager';
import type { RideRequest } from './core/types';
import type { DistrictData } from './sim/schemas';
import testloopData from '../data/districts/testloop.json';

console.log('Uthao booting...');

// 1. WebGL2 capability check
function hasWebGL2Support(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const testCanvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && testCanvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (!hasWebGL2Support()) {
  unsupportedSignal.value = 'WebGL2 is required to run Uthao on this device';
}

// 2. Mount Preact UI App
if (typeof document !== 'undefined') {
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    render(h(App, null), uiRoot);
  }
}

const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);

const gm = new GameManager({
  seed: 42,
  mode: 'career',
  data: { testloop: testloopData },
});

// Bind reactive signals store to sim event bus
bindEventBusToStore(gm.bus);

const rideManager = new RideManager({
  roadNetwork,
  bus: gm.bus,
});

const canvas = typeof document !== 'undefined'
  ? (document.getElementById('game-canvas') as HTMLCanvasElement)
  : null;
let renderer: Renderer | undefined;

if (canvas && hasWebGL2Support()) {
  renderer = Renderer.init(canvas, 'medium');

  // WebGL context lost & restored lifecycle listeners
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    gm.dispatch({ type: 'pause' });
    pausedSignal.value = true;
    contextLostSignal.value = true;
  });

  canvas.addEventListener('webglcontextrestored', () => {
    contextLostSignal.value = false;
    if (canvas) {
      renderer = Renderer.init(canvas, 'medium');
    }
  });
}

// Mobile/desktop tab visibility lifecycle handling
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      gm.dispatch({ type: 'pause' });
      pausedSignal.value = true;
    }
  });
}

const hud = typeof document !== 'undefined' ? new Hud() : undefined;
const autopilot = new AutopilotController(roadNetwork);
const inputManager = new InputManager();

initDebugApi(gm, {
  renderer,
  autopilot,
  rideManager,
});

// Expose browser window debug helpers for testing UI & dark choices
const debugPolice = new PoliceEncounterSystem();
const debugCrime = new CrimeEncounterSystem();
const debugAccident = new AccidentManager();

if (typeof window !== 'undefined') {
  const win = window as unknown as {
    __uthao: Record<string, unknown>;
  };
  if (win.__uthao) {
    win.__uthao.toggleMap = () => {
      isMapOpenSignal.value = !isMapOpenSignal.value;
    };
    win.__uthao.openPhone = () => {
      isPhoneOpenSignal.value = true;
    };
    win.__uthao.openStory = () => {
      isStoryModalOpenSignal.value = true;
    };
    win.__uthao.openShowcase = () => {
      isShowcaseModalOpenSignal.value = true;
    };
    win.__uthao.triggerDaySummary = () => {
      daySummarySignal.value = {
        day: 1,
        grossFare: 2480,
        appCommission: 496,
        fuelAndRepairs: 550,
        officialFines: 500,
        unofficialPayments: 200,
        compensationAndMedical: 500,
        netSavings: 864,
        completedRides: 16,
        reputationDelta: 8,
      };
    };
    win.__uthao.triggerAccident = () => {
      activeAccidentSignal.value = debugAccident.reportCollision('moderate', 'rider_fault', true);
    };
    win.__uthao.triggerPoliceStop = (violation = 'red_light') => {
      activePoliceCaseSignal.value = debugPolice.createCase(violation as never, 'moderate', 2, 'balanced');
    };
    win.__uthao.triggerAlleyAmbush = () => {
      activeCrimeEncounterSignal.value = debugCrime.checkForEncounter(
        {
          segmentId: 'alley_seg_01',
          districtId: 'puranpara',
          isNarrowAlley: true,
          lightingLevel: 'pitch_black',
          pedestrianActivity: 'deserted',
          policePresence: false,
          isolated: true,
        },
        23,
        'p_nabila'
      );
    };
  }
}

// Create initial test ride request
const sampleRequest: RideRequest = {
  requestId: 'req_tutorial_01',
  passengerId: 'p_nabila',
  pickupNodeId: 'N1',
  destinationNodeId: 'N2',
  initialFare: 120,
  estimatedDistance: 0.1,
  estimatedDuration: 2,
  requestedArrivalTime: null,
  bookingType: 'app',
  status: 'WaitingForPickup',
  surge: 1.0,
};

rideManager.offer(sampleRequest);
rideManager.accept(sampleRequest.requestId);

// Setup markers for pickup / dropoff
const pNode = roadNetwork.getNode(sampleRequest.pickupNodeId);
const dNode = roadNetwork.getNode(sampleRequest.destinationNodeId);

if (renderer && pNode && dNode) {
  renderer.markers.setPickup(pNode.x, pNode.z, true);
  renderer.markers.setDropoff(dNode.x, dNode.z, false);
}

const bikeSpec = createDefaultBikeSpec();
// Start bike slightly before N1 heading towards it
let bikeState = {
  ...createDefaultBikeState(),
  x: -9,
  z: 0,
  heading: Math.PI / 2, // Facing +X
  speed: 0,
};

const env = {
  wet: false,
  surface: 1.0,
  hasPassenger: false,
  conditionPct: 100,
};

let lastTime = typeof performance !== 'undefined' ? performance.now() : 0;

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const steps = runFrame(gm, dt);

  for (let s = 0; s < steps; s++) {
    inputManager.update(SIM_DT);
    const activeReq = rideManager.getActiveRequest();

    // Autopilot or inputManager
    let input: BikeInput;

    if (autopilot.isEnabled()) {
      if (activeReq) {
        if (activeReq.status === 'WaitingForPickup') {
          autopilot.setDestination(bikeState.x, bikeState.z, activeReq.pickupNodeId);
        } else if (activeReq.status === 'OnTrip') {
          autopilot.setDestination(bikeState.x, bikeState.z, activeReq.destinationNodeId);
        }
      }
      input = autopilot.step(bikeState);
    } else {
      const state = inputManager.read();
      input = {
        throttle: state.throttle,
        brake: state.brake,
        steer: state.steer,
      };

      // Hotkey listeners for Map, Phone
      if (state.map) isMapOpenSignal.value = !isMapOpenSignal.value;
      if (state.phone) isPhoneOpenSignal.value = !isPhoneOpenSignal.value;
    }

    // Physics step
    env.hasPassenger = activeReq?.status === 'OnTrip';
    bikeState = stepBike(bikeState, input, bikeSpec, env, SIM_DT);

    // Update RideManager
    rideManager.update(
      { x: bikeState.x, z: bikeState.z, speed: bikeState.speed },
      SIM_DT
    );
  }

  const activeReq = rideManager.getActiveRequest();
  if (renderer) {
    if (activeReq) {
      if (activeReq.status === 'WaitingForPickup') {
        if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, true);
        if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, false);
        renderer.setPassengerVisible(false);
      } else if (activeReq.status === 'OnTrip') {
        if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, false);
        if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, true);
        renderer.setPassengerVisible(true);
      }
    } else {
      renderer.markers.setPickup(0, 0, false);
      renderer.markers.setDropoff(0, 0, false);
      renderer.setPassengerVisible(false);
    }

    renderer.setBikeState(bikeState);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha);
  }

  // Update Dynamic Preact Glass HUD & Classic HUD
  const speedKmh = bikeState.speed * 3.6;
  hudSignal.value = {
    ...hudSignal.value,
    speedKmh,
  };

  if (hud) {
    let objective = 'Free roam';
    let fare: number | undefined;

    if (activeReq) {
      fare = activeReq.initialFare;
      if (activeReq.status === 'WaitingForPickup') {
        objective = `Pick up passenger at ${activeReq.pickupNodeId}`;
      } else if (activeReq.status === 'OnTrip') {
        objective = `Drop off passenger at ${activeReq.destinationNodeId}`;
      }
    } else {
      objective = 'Trip complete! Looking for fares...';
    }

    hud.update({
      speedKmh,
      objectiveText: objective,
      fare,
    });
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(frame);
  }
}

if (typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(frame);
}

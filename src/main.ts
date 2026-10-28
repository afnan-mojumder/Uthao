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
import { audioManager } from './audio/AudioManager';
import type { RideRequest } from './core/types';
import type { DistrictData } from './sim/schemas';
import type { HudState } from './ui/store';
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
  renderer = Renderer.init(canvas, 'medium', roadNetwork);

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
      renderer = Renderer.init(canvas, 'medium', roadNetwork);
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

if (typeof window !== 'undefined') {
  (window as unknown as { __uthaoInput?: InputManager }).__uthaoInput = inputManager;
}

initDebugApi(gm, {
  renderer,
  autopilot,
  rideManager,
});

// Expose browser window debug helpers for testing UI & dark choices
const debugPolice = new PoliceEncounterSystem();
const debugCrime = new CrimeEncounterSystem();
const debugAccident = new AccidentManager();

function executeHorn(): void {
  audioManager.unlock();
  audioManager.startHorn();
  setTimeout(() => audioManager.stopHorn(), 320);

  const reaction = renderer?.triggerHorn({ x: bikeState.x, z: bikeState.z });
  if (reaction?.responded) {
    if (reaction.type === 'rickshaw') {
      setTimeout(() => audioManager.playRickshawBell(), 420);
    } else if (reaction.type === 'cng') {
      setTimeout(() => audioManager.playCounterHorn(), 380);
    }
  }
}

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
    win.__uthao.toggleCamera = () => {
      renderer?.cameraRig.toggleMode();
    };
    win.__uthao.soundHorn = () => {
      executeHorn();
    };
    win.__uthao.openStory = () => {
      isStoryModalOpenSignal.value = true;
    };
    win.__uthao.openShowcase = () => {
      isShowcaseModalOpenSignal.value = true;
    };
    win.__uthao.setTimeOfDay = (time: 'day' | 'evening' | 'night') => {
      renderer?.setTimeOfDay(time);
    };
    win.__uthao.setWeather = (weather: 'clear' | 'rain') => {
      renderer?.setWeather(weather);
      env.wet = weather === 'rain';
      env.surface = weather === 'rain' ? 0.75 : 1.0;
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

// Hook up traffic collision to accident & condition
if (renderer) {
  renderer.onTrafficCollision = (trafficType: string) => {
    console.log(`Traffic collision with ${trafficType}`);
    audioManager.playCrashImpact();
    env.conditionPct = Math.max(10, env.conditionPct - 15);
    const activeReq = rideManager.getActiveRequest();
    if (activeReq?.status === 'OnTrip') {
      activeAccidentSignal.value = debugAccident.reportCollision('minor', 'shared', true);
    }
  };
}

// Keyboard shortcuts for Time of Day (N) and Weather (R)
if (typeof window !== 'undefined') {
  let currentTimeIndex = 0;
  const times: Array<'day' | 'evening' | 'night'> = ['day', 'evening', 'night'];

  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') {
      currentTimeIndex = (currentTimeIndex + 1) % times.length;
      const nextTime = times[currentTimeIndex]!;
      renderer?.setTimeOfDay(nextTime);
    } else if (e.key === 'r' || e.key === 'R') {
      const nextWet = !env.wet;
      env.wet = nextWet;
      env.surface = nextWet ? 0.75 : 1.0;
      renderer?.setWeather(nextWet ? 'rain' : 'clear');
    } else if (e.key === 'c' || e.key === 'C') {
      renderer?.cameraRig.toggleMode();
    } else if (e.key === 'h' || e.key === 'H') {
      executeHorn();
    }
  });
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

  let lastThrottle = 0;

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

    lastThrottle = input.throttle;

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

  // Update Audio simulation
  audioManager.updateEngine(bikeState.speed, lastThrottle);
  audioManager.setAmbience(0.6, env.wet);

  // Update Dynamic Preact Glass HUD & Classic HUD
  const speedKmh = bikeState.speed * 3.6;

  let passengerState: HudState['passenger'] = undefined;
  let navState: HudState['navigation'] = {
    instruction: 'Free Roam · Looking for ride requests',
    distanceText: '0 m',
    etaText: 'Active',
  };

  if (activeReq) {
    if (activeReq.status === 'WaitingForPickup') {
      const dist = pNode ? Math.hypot(pNode.x - bikeState.x, pNode.z - bikeState.z) : 0;
      passengerState = {
        name: 'Nabila',
        mood: 'happy',
        status: 'WaitingForPickup',
      };
      navState = {
        instruction: 'Pick up passenger at Farmgate Stand (N1)',
        distanceText: dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`,
        etaText: `${Math.max(1, Math.round(dist / 8))}s`,
      };
    } else if (activeReq.status === 'OnTrip') {
      const dist = dNode ? Math.hypot(dNode.x - bikeState.x, dNode.z - bikeState.z) : 0;
      passengerState = {
        name: 'Nabila',
        mood: 'neutral',
        status: 'OnTrip',
      };
      navState = {
        instruction: 'Drop off at Green Rd / Padma Fuel (N2)',
        distanceText: dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`,
        etaText: `${Math.max(1, Math.round(dist / 8))}s`,
      };
    }
  }

  hudSignal.value = {
    ...hudSignal.value,
    speedKmh,
    passenger: passengerState,
    navigation: navState,
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

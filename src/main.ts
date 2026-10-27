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
import { TrafficManager } from './sim/traffic/TrafficManager';
import { AutopilotController } from './debug/autopilot';
import { Hud } from './ui/hud/Hud';
import { InputManager } from './input';
import { App } from './ui/App';
import {
  bindEventBusToStore,
  pausedSignal,
  contextLostSignal,
  unsupportedSignal,
} from './ui/store';
import type { RideRequest } from './core/types';
import type { Command } from './core/commands';
import type { DistrictData, WorldData } from './sim/schemas';
import type { QualityLevel } from './render/quality';
import type { DistrictId } from './core/types';
import testloopData from '../data/districts/testloop.json';
import mirparaData from '../data/districts/mirpara.json';
import fulgateData from '../data/districts/fulgate.json';
import dhanbaghData from '../data/districts/dhanbagh.json';
import mohakhalData from '../data/districts/mohakhal.json';
import gulbariData from '../data/districts/gulbari.json';
import puranparaData from '../data/districts/puranpara.json';
import motinagarData from '../data/districts/motinagar.json';
import worldDataJson from '../data/world.json';
import { initMapViewer } from './debug/mapViewer';

const allDistrictsMap: Record<string, DistrictData> = {
  mirpara: mirparaData as DistrictData,
  fulgate: fulgateData as DistrictData,
  dhanbagh: dhanbaghData as DistrictData,
  mohakhal: mohakhalData as DistrictData,
  gulbari: gulbariData as DistrictData,
  puranpara: puranparaData as DistrictData,
  motinagar: motinagarData as DistrictData,
  testloop: testloopData as DistrictData,
};

const allDistrictsList: DistrictData[] = [
  mirparaData as DistrictData,
  fulgateData as DistrictData,
  dhanbaghData as DistrictData,
  mohakhalData as DistrictData,
  gulbariData as DistrictData,
  puranparaData as DistrictData,
  motinagarData as DistrictData,
];

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

const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isMapTool = urlParams?.get('tool') === 'map';

if (isMapTool) {
  const districtChoice = urlParams?.get('district') === 'testloop' ? testloopData : mirparaData;
  initMapViewer({ district: districtChoice as DistrictData });
} else {
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

  const districtParam = urlParams?.get('district');
  const isSingleDistrict = Boolean(
    districtParam && districtParam !== 'world' && allDistrictsMap[districtParam]
  );
  const activeDistrict: DistrictData = isSingleDistrict
    ? allDistrictsMap[districtParam!]!
    : (mirparaData as DistrictData);
  const qualityParam = urlParams?.get('quality') as QualityLevel | null;
  const qualityChoice: QualityLevel =
    qualityParam && ['low', 'medium', 'high'].includes(qualityParam)
      ? qualityParam
      : 'medium';

  const roadNetwork = isSingleDistrict
    ? RoadNetwork.fromDistricts([activeDistrict])
    : RoadNetwork.fromWorld(worldDataJson as WorldData, allDistrictsList);

  const gm = new GameManager({
    seed: 42,
    mode: 'career',
    data: allDistrictsMap,
  });

  // Bind reactive signals store to sim event bus
  bindEventBusToStore(gm.bus, (cmd: Command) => gm.dispatch(cmd));

  const rideManager = new RideManager({
    roadNetwork,
    bus: gm.bus,
  });

  const canvas = typeof document !== 'undefined'
    ? (document.getElementById('game-canvas') as HTMLCanvasElement)
    : null;
  let renderer: Renderer | undefined;

  function loadRendererScene(r: Renderer) {
    if (isSingleDistrict) {
      r.loadDistrict(activeDistrict);
    } else {
      r.loadWorld(
        worldDataJson as WorldData,
        (id: DistrictId) => allDistrictsMap[id],
        undefined,
        { x: 300, z: 300 }
      );
    }
  }

  if (canvas && hasWebGL2Support()) {
    renderer = Renderer.init(canvas, qualityChoice);
    loadRendererScene(renderer);

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
        renderer = Renderer.init(canvas, qualityChoice);
        loadRendererScene(renderer);
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
const trafficManager = new TrafficManager(roadNetwork, 42);
const inputManager = new InputManager();

initDebugApi(gm, {
  renderer,
  autopilot,
  rideManager,
  trafficManager,
});

// Create initial test ride request
const pNodeId = activeDistrict.nodes[0]?.nodeId ?? 'N1';
const dNodeId = activeDistrict.nodes[1]?.nodeId ?? 'N2';
const sampleRequest: RideRequest = {
  requestId: 'req_tutorial_01',
  passengerId: 'p_nabila',
  pickupNodeId: pNodeId,
  destinationNodeId: dNodeId,
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
const startNode = activeDistrict.nodes[0] ?? { x: 0, z: 0 };
// Start bike slightly before pickup node heading towards it
let bikeState = {
  ...createDefaultBikeState(),
  x: startNode.x - 9,
  z: startNode.z,
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
let roamNodeIndex = 0;

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
      } else if (activeDistrict.nodes.length > 0 && autopilot.isFinished()) {
        roamNodeIndex = (roamNodeIndex + 1) % activeDistrict.nodes.length;
        const nextNode = activeDistrict.nodes[roamNodeIndex];
        if (nextNode) {
          autopilot.setDestination(bikeState.x, bikeState.z, nextNode.nodeId);
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
    }

    // Physics step
    const currentSegment = roadNetwork.segmentAt(bikeState.x, bikeState.z);
    env.wet = gm.weatherSystem.isRoadWet();
    if (currentSegment) {
      env.surface = gm.weatherSystem.getSurfaceModifier(currentSegment);
    } else {
      env.surface = env.wet ? 0.85 : 1.0;
    }
    env.hasPassenger = activeReq?.status === 'OnTrip';
    env.conditionPct = gm.economy.motorcycleCondition;
    bikeState = stepBike(bikeState, input, bikeSpec, env, SIM_DT);

    // Horn & traffic update
    const rawInput = inputManager.read();
    if (rawInput.horn) {
      trafficManager.triggerHorn({ x: bikeState.x, z: bikeState.z });
    }

    const camView = {
      x: bikeState.x,
      z: bikeState.z,
      heading: bikeState.heading,
      fovRad: (60 * Math.PI) / 180,
    };
    trafficManager.maintainDensity(camView, gm.clock.minutes);
    trafficManager.update(SIM_DT, camView, {
      x: bikeState.x,
      z: bikeState.z,
      speed: bikeState.speed,
    });

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

    renderer.updatePeople(
      trafficManager.pedestrians.getPedestrians(),
      trafficManager.getAgents(),
      now / 1000
    );

    renderer.setBikeState(bikeState);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha);
  }

  // Update HUD
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
      speedKmh: bikeState.speed * 3.6,
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
}

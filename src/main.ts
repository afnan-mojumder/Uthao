import { render, h } from 'preact';
import { GameManager } from './sim/GameManager';
import { GameSession } from './sim/GameSession';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Renderer } from './render/Renderer';
import { initDebugApi, spawnTestRequest } from './debug/debugApi';
import { SIM_DT, MAX_FRAME_DT, MAX_SIM_STEPS_PER_FRAME } from './config/constants';
import type { BikeInput } from './physics/bikeModel';
import { RoadNetwork } from './sim/road/RoadNetwork';
import { AutopilotController } from './debug/autopilot';
import { Hud } from './ui/hud/Hud';
import { InputManager } from './input';
import { App } from './ui/App';
import {
  bindEventBusToStore,
  pausedSignal,
  contextLostSignal,
  unsupportedSignal,
  initPwaInstall,
  negotiationSignal,
  phoneSignal,
  hudSignal,
  tutorialSignal,
  screenSignal,
  journalSignal,
  journalDataSignal,
} from './ui/store';
import { bindUi } from './ui/bindings';
import { SaveSystem } from './sim/save/SaveSystem';
import { startNegotiation } from './sim/negotiation/NegotiationSystem';
import { Minimap } from './render/minimap';
import { BALANCE } from './config/balance';
import { generateProfile } from './sim/passenger/profiles';
import { Rng } from './core/rng';
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

export let saveSystem: SaveSystem | undefined;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isMapTool = urlParams?.get('tool') === 'map';
// T7.1: `?encounters=0` permanently disables ambient encounters (used by debug/test URLs
// that drive the sim directly and don't want a roaming encounter card in the way).
const encountersDisabledByUrl = urlParams?.get('encounters') === '0';

if (isMapTool) {
  const districtChoice = urlParams?.get('district') === 'testloop' ? testloopData : mirparaData;
  initMapViewer({ district: districtChoice as DistrictData });
} else {
  // T7.3: Rapier's WASM init is async, so the rest of boot (which constructs
  // GameSession and loads the renderer's colliders) waits for it to finish
  // before the first frame runs.
  void bootGame();
}

async function bootGame(): Promise<void> {
  if (!hasWebGL2Support()) {
    unsupportedSignal.value = 'WebGL2 is required to run Uthao on this device';
  }

  // 2. Mount Preact UI App
  if (typeof document !== 'undefined') {
    initPwaInstall();
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
  bindEventBusToStore(gm.bus);

  // T7.3: real Rapier physics world, used by GameSession's MotorcycleController
  // (collisions/near-misses against colliders) and by CityBuilder (colliders
  // for streamed districts). Not constructed when WebGL2 is unavailable since
  // there's nothing to collide with on screen in that case.
  const physics = hasWebGL2Support() ? await PhysicsWorld.create() : undefined;

  // T7.2: single-district debug/test URLs (e.g. `?district=testloop`) get one
  // deterministic ride instead of the real RequestGenerator, so e2e specs stay
  // stable. The real game (world mode) drives rides from RequestGenerator only.
  const session = new GameSession({
    gm,
    road: roadNetwork,
    physics,
    autoRequests: !isSingleDistrict,
  });
  const rideManager = session.ride;

  const canvas = typeof document !== 'undefined'
    ? (document.getElementById('game-canvas') as HTMLCanvasElement)
    : null;
  let renderer: Renderer | undefined;

  function loadRendererScene(r: Renderer) {
    if (isSingleDistrict) {
      r.loadDistrict(activeDistrict, physics);
    } else {
      r.loadWorld(
        worldDataJson as WorldData,
        (id: DistrictId) => allDistrictsMap[id],
        physics,
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

// T4.9 SaveSystem and tab visibility lifecycle handling
const activeSaveSystem = new SaveSystem();
saveSystem = activeSaveSystem;
activeSaveSystem.bindAutosave(gm, typeof document !== 'undefined' ? document : undefined);

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      gm.dispatch({ type: 'pause' });
      pausedSignal.value = true;
    }
  });
}

const hud = typeof document !== 'undefined' ? new Hud() : undefined;
const minimap = typeof document !== 'undefined' ? new Minimap(roadNetwork) : undefined;
const autopilot = new AutopilotController(roadNetwork);
const trafficManager = session.traffic;
const inputManager = new InputManager();

initDebugApi(gm, {
  renderer,
  autopilot,
  rideManager,
  trafficManager,
});

// T7.4: every UI dispatcher slot (request accept/decline, negotiation,
// menu, save/load, tutorial, garage, bike, ending, phone contacts) is bound
// here in one place instead of scattered across this file.
bindUi(session, activeSaveSystem);

gm.bus.on('ride/arrivedPickup', (ev) => {
  if (rideManager.enableNegotiation) {
    const activeReq = rideManager.getActiveRequest();
    if (activeReq && activeReq.requestId === ev.requestId) {
      const profile = generateProfile('bargainer', new Rng(123), activeReq.passengerId);
      profile.patience = 0.8;
      const session = startNegotiation(activeReq, profile, {
        traffic: 0.5,
        day: gm.clock.day,
        walkM: 0,
        rng: new Rng(123),
      });
      negotiationSignal.value = {
        active: true,
        session,
        lastResult: null,
      };
    }
  }
});

// T7.2: single-district debug/test boots get one deterministic ride (the old
// hardcoded sample ride) since `autoRequests` is off for them; the real game
// (world mode) is offered real rides by RequestGenerator via GameSession.step.
if (isSingleDistrict) {
  spawnTestRequest(rideManager, 120);
}

// T7.3: spawn on the road network at the player's home node, aligned to the
// road, instead of the old off-road `activeDistrict.nodes[0].x - 9` offset.
session.spawnAtHome();

let lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
let roamNodeIndex = 0;

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // T7.1: the sim only runs while the real game screen is active, and ambient
  // encounters are additionally suppressed during the opening tutorial or when
  // disabled via URL — otherwise a roaming encounter can fire behind the main
  // menu and softlock boot.
  const inGame = screenSignal.value === 'game';
  gm.eventDirector.enabled = inGame && !tutorialSignal.value.active && !encountersDisabledByUrl;

  // Frame-rate decoupling: convert the variable rAF dt into a whole number of
  // fixed SIM_DT ticks, same clamp/cap as GameManager.runFrame. The clock tick
  // itself happens once per step inside session.step(), not here.
  let steps = 0;
  if (inGame && !gm.paused) {
    gm.accumulator += Math.min(dt, MAX_FRAME_DT);
    while (gm.accumulator >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
      gm.accumulator -= SIM_DT;
      steps++;
    }
    if (gm.accumulator > SIM_DT * MAX_SIM_STEPS_PER_FRAME) {
      gm.accumulator = 0;
    }
  }

  for (let s = 0; s < steps; s++) {
    inputManager.update(SIM_DT);
    const activeReq = rideManager.getActiveRequest();

    // Autopilot or inputManager
    let input: BikeInput;

    if (autopilot.isEnabled()) {
      if (activeReq) {
        if (activeReq.status === 'WaitingForPickup') {
          autopilot.setDestination(session.bike.x, session.bike.z, activeReq.pickupNodeId);
        } else if (activeReq.status === 'OnTrip') {
          autopilot.setDestination(session.bike.x, session.bike.z, activeReq.destinationNodeId);
        }
      } else if (activeDistrict.nodes.length > 0 && autopilot.isFinished()) {
        roamNodeIndex = (roamNodeIndex + 1) % activeDistrict.nodes.length;
        const nextNode = activeDistrict.nodes[roamNodeIndex];
        if (nextNode) {
          autopilot.setDestination(session.bike.x, session.bike.z, nextNode.nodeId);
        }
      }
      input = autopilot.step(session.bike);
    } else {
      const state = inputManager.read();
      input = {
        throttle: state.throttle,
        brake: state.brake,
        steer: state.steer,
      };
    }

    // Horn (traffic reaction to the player, not part of the bike/traffic/ride
    // step itself, so it stays here alongside the rest of the input glue).
    const rawInput = inputManager.read();
    if (rawInput.horn) {
      trafficManager.triggerHorn({ x: session.bike.x, z: session.bike.z });
    }

    session.step(input, SIM_DT);
  }

  const activeReq = rideManager.getActiveRequest();
  const pNode = activeReq ? roadNetwork.getNode(activeReq.pickupNodeId) : undefined;
  const dNode = activeReq ? roadNetwork.getNode(activeReq.destinationNodeId) : undefined;

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

    renderer.setBikeState(session.bike);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha);
  }

  // T7.4: Journal reads a live snapshot; only built while it's actually open.
  if (journalSignal.value) {
    journalDataSignal.value = {
      snapshot: gm.snapshot(),
      activeMissions: gm.story.activeMissions
        .map((id) => gm.missionManager.missions.get(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
      getObjectiveStates: (missionId) => gm.missionManager.getObjectiveStates(missionId),
    };
  }

  // Update Minimap
  if (minimap) {
    if (!minimap.canvas.parentElement && typeof document !== 'undefined') {
      const container = document.getElementById('minimap-container');
      if (container) {
        container.appendChild(minimap.canvas);
      }
    }
    const pNodePos = activeReq && activeReq.status === 'WaitingForPickup' ? pNode : null;
    const dNodePos = activeReq && activeReq.status === 'OnTrip' ? dNode : null;
    minimap.update(
      { x: session.bike.x, z: session.bike.z, heading: session.bike.heading },
      rideManager.currentRoute,
      { pickup: pNodePos ?? null, dropoff: dNodePos ?? null }
    );
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

    const currentSpeedKmh = session.bike.speed * 3.6;
    const fuelL = gm.economy.fuelLevel;
    const fuelMaxL = BALANCE.FUEL.tankL;
    const todayNetEarnings = gm.economy.dailyRevenue - gm.economy.dailyExpenses;
    const shiftClock = gm.clock.hhmm();
    const shiftDay = gm.clock.day;
    const rating = gm.reputationSystem.getAppRating();
    const isFirstPerson = renderer ? renderer.cameraRig.mode === 'firstPerson' : false;

    hud.update({
      speedKmh: currentSpeedKmh,
      objectiveText: objective,
      fare,
      fuelL,
      fuelMaxL,
      todayNetEarnings,
      shiftClock,
      shiftDay,
      rating,
      isFirstPerson,
      nextTurn: phoneSignal.value.navigationTurn,
      passengerStatus: activeReq
        ? {
            status: activeReq.status,
            name: 'Passenger',
          }
        : undefined,
      etaMinutes: activeReq ? activeReq.estimatedDuration : undefined,
    });

    hudSignal.value = {
      ...hudSignal.value,
      speedKmh: currentSpeedKmh,
      fuel: (fuelL / fuelMaxL) * 100,
      objectiveText: objective,
    };
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(frame);
  }
}


if (typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(frame);
}
}

import { render, h } from 'preact';
import { watchOverlayFocus } from './ui/gamepadNav';
import { AudioManager } from './audio/AudioManager';
import { getBikeDef } from './sim/economy/bikes';
import { bindAudio } from './audio/bindAudio';

/** Set once at boot in the bindings below; the frame loop drives it. */
let audio: AudioManager;
let engineThrottle = 0;
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
  loadingSignal,
  initPwaInstall,
  negotiationSignal,
  hudSignal,
  dialogueSubtitleSignal,
  tickPhoneOffers,
  tutorialSignal,
  screenSignal,
  journalSignal,
  mapPlayerPosSignal,
  journalDataSignal,
  settingsSignal,
  type GameSettings,
} from './ui/store';
import { getCharacter } from './sim/passenger/PassengerAI';
import { setLanguage } from './ui/i18n';
import { setDefaultSignLanguage } from './render/signage';
import { consumeFreshCareer } from './ui/freshCareer';
import { routeColorFor } from './ui/settingsEffects';
import { bindUi } from './ui/bindings';
import { SaveSystem } from './sim/save/SaveSystem';
import { Minimap } from './render/minimap';
import { deriveRideView, nearestPlaceKey } from './sim/ride/rideView';
import { t } from './ui/i18n';
import { BALANCE } from './config/balance';
import type { DistrictData, WorldData } from './sim/schemas';
import { resolveQualityLevel, type QualityLevel } from './render/quality';
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

let uiMounted = false;

function mountUiApp(): void {
  if (uiMounted || typeof document === 'undefined') return;
  initPwaInstall();
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    render(h(App, null), uiRoot);
    const bootText = document.getElementById('boot-text');
    if (bootText) bootText.style.display = 'none';
    uiMounted = true;
  }
}

function setLoadingStage(stageKey: string, progress: number): void {
  loadingSignal.value = {
    active: typeof document !== 'undefined',
    stageKey,
    progress,
  };
}

if (isMapTool) {
  const districtChoice = urlParams?.get('district') === 'testloop' ? testloopData : mirparaData;
  initMapViewer({ district: districtChoice as DistrictData });
} else {
  // PhysicsWorld initializes before boot constructs GameSession and loads
  // the renderer's colliders so the first frame has full collision coverage.
  void bootGame().catch((err) => {
    console.error('Uthao boot failed:', err);
    mountUiApp();
    const message = err instanceof Error ? err.message : String(err);
    loadingSignal.value = {
      active: typeof document !== 'undefined',
      stageKey: 'loading.error',
      progress: loadingSignal.value.progress,
      error: message,
    };
  });
}

async function bootGame(): Promise<void> {
  // The saved language applies before the first render.
  setLanguage(settingsSignal.value.language);

  setLoadingStage('loading.boot', 0);

  // 2. Mount Preact UI App while loadingSignal.active is true so <Loading />
  // owns the screen and <MainMenu /> stays hidden until bindUi() completes.
  mountUiApp();

  if (!hasWebGL2Support()) {
    unsupportedSignal.value = t('ui.unsupported_webgl');
    loadingSignal.value = { active: false, stageKey: 'loading.boot', progress: 0 };
    return;
  }

  const districtParam = urlParams?.get('district');
  const isSingleDistrict = Boolean(
    districtParam && districtParam !== 'world' && allDistrictsMap[districtParam]
  );
  const activeDistrict: DistrictData = isSingleDistrict
    ? allDistrictsMap[districtParam!]!
    : (mirparaData as DistrictData);
  // A `?quality=` URL parameter overrides the saved Settings value.
  const qualityChoice: QualityLevel = resolveQualityLevel(
    urlParams?.get('quality'),
    settingsSignal.value.quality
  );

  const roadNetwork = isSingleDistrict
    ? RoadNetwork.fromDistricts([activeDistrict])
    : RoadNetwork.fromWorld(worldDataJson as WorldData, allDistrictsList);

  const gm = new GameManager({
    seed: 42,
    mode: 'career',
    data: allDistrictsMap,
  });

  const bootCleanups: Array<() => void> = [];

  // Bind reactive signals store to sim event bus
  bootCleanups.push(bindEventBusToStore(gm.bus));
  // Keyboard and pad focus move into a panel when it opens.
  watchOverlayFocus();
  // Sound: the audio context starts on the first gesture; settings and sim events drive it.
  audio = new AudioManager();
  bindAudio(audio, gm.bus, settingsSignal, document);
  // The bike slid at the grip limit: a tyre sound (H-4 for the ear).
  bootCleanups.push(gm.bus.on('bike/wobble', () => audio.playWobble()));
  bootCleanups.push(gm.bus.on('bike/nearMiss', () => audio.playNearMiss()));

  // Deterministic 2.5D spatial-hash physics world, used by GameSession's
  // MotorcycleController (collisions/near-misses) and CityBuilder colliders.
  setLoadingStage('loading.physics', 25);
  const physics = await PhysicsWorld.create();

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

  // T7.3: spawn on the road network at the player's home node before streaming so
  // CityBuilder initializes around the actual player spawn position.
  session.spawnAtHome();

  const canvas = typeof document !== 'undefined'
    ? (document.getElementById('game-canvas') as HTMLCanvasElement)
    : null;
  let renderer: Renderer | undefined;
  const urlQualityParam = urlParams?.get('quality');
  const hasValidUrlQuality = Boolean(
    urlQualityParam === 'low' || urlQualityParam === 'medium' || urlQualityParam === 'high'
  );

  function loadRendererScene(r: Renderer) {
    if (isSingleDistrict) {
      r.loadDistrict(activeDistrict, physics);
    } else {
      r.loadWorld(
        worldDataJson as WorldData,
        (id: DistrictId) => allDistrictsMap[id],
        physics,
        { x: session.bike.x, z: session.bike.z }
      );
    }
  }

  const syncBikeAppearance = (r: Renderer | undefined) => {
    if (!r) return;
    r.setBikeVariant(gm.economyManager.currentBikeId);
    r.setBikeCosmetics(gm.economyManager.installedCosmetics);
  };

  if (canvas) {
    setLoadingStage('loading.world', 55);
    setDefaultSignLanguage(settingsSignal.value.language);
    renderer = Renderer.init(canvas, qualityChoice);
    if (hasValidUrlQuality) {
      renderer.setAdaptiveQualityEnabled(false);
    }
    await renderer.preloadAssets((pct) => {
      setLoadingStage('loading.world', 55 + Math.round(pct * 0.25));
    });
    loadRendererScene(renderer);
    renderer.cityBuilder?.signageAtlas.setLanguage(settingsSignal.value.language);
    syncBikeAppearance(renderer);
    bootCleanups.push(gm.bus.on('bike/swapped', () => syncBikeAppearance(renderer)));
    bootCleanups.push(gm.bus.on('upgrade/purchased', () => syncBikeAppearance(renderer)));
    bootCleanups.push(gm.bus.on('state/restored', () => syncBikeAppearance(renderer)));
    bootCleanups.push(
      gm.bus.on('bike/collision', ({ severity }) => {
        if (severity === 'crash') renderer?.cameraRig.triggerShake(0.45);
        else if (severity === 'bump') renderer?.cameraRig.triggerShake(0.18);
      })
    );
    bootCleanups.push(
      gm.bus.on('bike/wobble', () => {
        renderer?.cameraRig.triggerShake(0.12);
      })
    );
    bootCleanups.push(
      gm.bus.on('bike/speedBump', ({ speedKmh }) => {
        const intensity = Math.max(0.06, Math.min(0.18, 0.06 + (speedKmh / 60) * 0.12));
        renderer?.cameraRig.triggerShake(intensity);
      })
    );
    // Storefront signs follow a language change while playing.
    bootCleanups.push(
      settingsSignal.subscribe((s) => renderer?.cityBuilder?.signageAtlas.setLanguage(s.language))
    );
    // A quality change in Settings reaches the running renderer. A URL override still wins.
    bootCleanups.push(
      settingsSignal.subscribe((s) => {
        const level = resolveQualityLevel(urlParams?.get('quality'), s.quality);
        if (renderer && level !== renderer.qualityManager.config.level) renderer.setQuality(level);
      })
    );

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
        const s = settingsSignal.value;
        const restoredQuality = resolveQualityLevel(urlParams?.get('quality'), s.quality);
        const prevCamMode = renderer?.cameraRig.mode ?? 'chase';

        renderer?.dispose();
        physics.clearAllColliders();
        setLanguage(s.language);
        setDefaultSignLanguage(s.language);

        const nextRenderer = Renderer.init(canvas, restoredQuality);
        renderer = nextRenderer;
        if (hasValidUrlQuality) {
          nextRenderer.setAdaptiveQualityEnabled(false);
        }
        nextRenderer.cameraRig.setReduceMotion(s.reduceMotion);
        nextRenderer.cameraRig.setMode(prevCamMode);
        if (typeof window !== 'undefined' && window.__uthao) {
          window.__uthao.renderer = nextRenderer;
        }

        nextRenderer.peopleRenderer.refreshPrototypes();
        loadRendererScene(nextRenderer);
        nextRenderer.cityBuilder?.signageAtlas.setLanguage(s.language);
        syncBikeAppearance(nextRenderer);
        const restoredView = deriveRideView(rideManager);
        nextRenderer.setPassengerVisible(restoredView.dropoffVisible);
        nextRenderer.snapBikeState(session.bike);
        nextRenderer.syncFloodedSegments(gm.weatherSystem, roadNetwork);
        nextRenderer.render(gm.snapshot(), 1.0, trafficManager.signals);

        void nextRenderer.preloadAssets().then(() => {
          if (renderer === nextRenderer) {
            nextRenderer.peopleRenderer.refreshPrototypes();
          }
        });
      }
    });
  }

// T4.9 SaveSystem and tab visibility lifecycle handling
setLoadingStage('loading.session', 85);
const activeSaveSystem = new SaveSystem();
saveSystem = activeSaveSystem;
bootCleanups.push(
  activeSaveSystem.bindAutosave(
    gm,
    typeof document !== 'undefined' ? document : undefined,
    // On the title screen the game is blank: never save it over the real career.
    () => screenSignal.value !== 'title'
  )
);

if (typeof document !== 'undefined') {
  const onVisibilityChange = () => {
    if (document.hidden) {
      gm.dispatch({ type: 'pause' });
      pausedSignal.value = true;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  bootCleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
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
  requests: session.requests,
  trafficManager,
});

// T7.4: every UI dispatcher slot (request accept/decline, negotiation,
// menu, save/load, tutorial, garage, bike, ending, phone contacts) is bound
// here in one place instead of scattered across this file.
bootCleanups.push(bindUi(session, activeSaveSystem));

// Settings take effect as soon as they are saved, and the saved language is
// applied on boot. Cancel reverts the language preview (Settings.tsx).
const applySettings = (s: GameSettings) => {
  document.documentElement.dataset.reduceMotion = String(s.reduceMotion);
  renderer?.cameraRig.setReduceMotion(s.reduceMotion);
  setDefaultSignLanguage(s.language); // storefront signs, for districts loaded from now on
  minimap?.setRouteColor(routeColorFor(s));
  gm.eventDirector.pauseOnDecisions = s.pauseOnDecisions;
  inputManager.setBindings({ ...inputManager.getBindings(), tiltEnabled: s.tiltControls });
};
bootCleanups.push(settingsSignal.subscribe(applySettings));

// T8.1: negotiation now happens before pickup, as soon as the rider accepts.
bootCleanups.push(
  gm.bus.on('negotiation/started', (ev) => {
    const negotiation = session.beginNegotiation(ev.requestId);
    if (negotiation) {
      negotiationSignal.value = {
        active: true,
        session: negotiation,
        lastResult: null,
        mood: rideManager.getPassengerMood(),
        pickup: session.pickupChoice(),
        alley: session.alleyChoice(),
        destinationKey: nearestPlaceKey(rideManager, negotiation.req.destinationNodeId ?? ''),
      };
    }
  })
);

if (typeof window !== 'undefined') {
  const onPageHide = () => {
    for (const cleanup of bootCleanups) cleanup();
    bootCleanups.length = 0;
  };
  window.addEventListener('pagehide', onPageHide, { once: true });
}

// T7.2: single-district debug/test boots get one deterministic ride (the old
// hardcoded sample ride) since `autoRequests` is off for them; the real game
// (world mode) is offered real rides by RequestGenerator via GameSession.step.
if (isSingleDistrict) {
  spawnTestRequest(rideManager, 120);
}

// T7.3: confirm bike spawn is clear of newly loaded static colliders and snap camera
// directly to initial spawn pose (no 180m swoop on the first frame).
session.spawnAtHome();

// A new career requested from the menu before this reload: start it on this fresh game.
if (consumeFreshCareer()) {
  session.newCareer();
  syncBikeAppearance(renderer);
  tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  screenSignal.value = 'game';
}

renderer?.snapBikeState(session.bike);

// All systems, scene, SaveSystem, debug API, and UI callbacks are now bound;
// hide <Loading /> so <MainMenu /> (or the active game screen) can accept input.
loadingSignal.value = { active: false, stageKey: 'loading.ready', progress: 100 };

let lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
let roamNodeIndex = 0;
let cameraHeld = false;
let lastBikeBrake = 0;

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
    const driveView = deriveRideView(rideManager);

    // Autopilot or inputManager
    let input: BikeInput;

    if (autopilot.isEnabled()) {
      if (activeReq) {
        if (driveView.navTargetNodeId) {
          autopilot.setDestination(session.bike.x, session.bike.z, driveView.navTargetNodeId);
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
    // Camera key (C) or gamepad Select toggles on press, not while held.
    if (rawInput.camera && !cameraHeld) renderer?.cameraRig.toggleMode();
    cameraHeld = rawInput.camera;
    if (rawInput.horn) {
      trafficManager.triggerHorn({ x: session.bike.x, z: session.bike.z });
    }

    session.step(input, SIM_DT);
    if (s >= steps - 2) {
      renderer?.setBikeState(session.bike);
    }
    engineThrottle = input.throttle;
    lastBikeBrake = input.brake;
    if (rawInput.horn) audio.startHorn();
    else audio.stopHorn();
  }

  if (steps > 0) {
    tickPhoneOffers(steps * SIM_DT);
  }

  if (!inGame || gm.paused) {
    lastBikeBrake = 0;
  }

  // Engine and ambience follow the bike; menus and pause are silent.
  const playing = inGame && !pausedSignal.value;
  const raining = gm.weather === 'lightRain' || gm.weather === 'heavyRain';
  audio.setEnginePitch(getBikeDef(gm.economyManager.currentBikeId).audioPitch);
  audio.updateEngine(session.bike.speed, engineThrottle, playing);
  audio.setAmbience(0.5, raining);
  if (!playing) audio.stopHorn();

  const activeReq = rideManager.getActiveRequest();
  // T8.1: the one place HUD, minimap and markers read ride state from.
  const view = deriveRideView(rideManager);
  const pNode = activeReq ? roadNetwork.getNode(activeReq.pickupNodeId) : undefined;
  const dNode = activeReq ? roadNetwork.getNode(activeReq.destinationNodeId) : undefined;

  if (renderer) {
    if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, view.pickupVisible);
    else renderer.markers.setPickup(0, 0, false);
    if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, view.dropoffVisible);
    else renderer.markers.setDropoff(0, 0, false);
    renderer.setPassengerVisible(view.dropoffVisible);

    renderer.updatePeople(
      trafficManager.pedestrians.getPedestrians(),
      trafficManager.getAgents(),
      now / 1000
    );

    renderer.setBrakeLight(lastBikeBrake > 0.05);
    renderer.syncFloodedSegments(gm.weatherSystem, roadNetwork);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha, trafficManager.signals);
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
    const pNodePos = view.pickupVisible ? pNode : null;
    const dNodePos = view.dropoffVisible ? dNode : null;
    minimap.update(
      { x: session.bike.x, z: session.bike.z, heading: session.bike.heading },
      rideManager.currentRoute,
      { pickup: pNodePos ?? null, dropoff: dNodePos ?? null }
    );
  }

  // Update HUD
  if (hud) {
    // The view carries the place's name key; translate it here, not in the sim.
    const placeKey = String(view.objectiveVars.place ?? '');
    const objective = t(view.objectiveKey, { place: placeKey ? t(placeKey) : '' });
    const fare = activeReq?.initialFare;

    // Speed is signed (negative when reversing); the dial shows the magnitude.
    const currentSpeedKmh = Math.abs(session.bike.speed) * 3.6;
    const fuelL = gm.economyManager.fuelLevel;
    const fuelMaxL = gm.economyManager.maxFuelL();
    const todayNetEarnings = gm.economy.dailyRevenue - gm.economy.dailyExpenses;
    const shiftClock = gm.clock.hhmm();
    const shiftDay = gm.clock.day;
    const rating = gm.reputationSystem.getAppRating();
    const isFirstPerson = renderer ? renderer.cameraRig.mode === 'firstPerson' : false;

    let activeMissionHud: {
      titleKey: string;
      objectiveDescKey: string;
      progress: number;
      target: number;
      targetNameKey?: string;
      targetDistM?: number;
    } | null = null;
    const activeMissionId = gm.story.activeMissions[0];
    if (activeMissionId) {
      const mDef = gm.missionManager.missions.get(activeMissionId);
      const states = gm.missionManager.getObjectiveStates(activeMissionId);
      if (mDef && mDef.objectives.length > 0) {
        const nextObj = mDef.objectives.find((o) => !states.find((s) => s.id === o.id)?.completed) ?? mDef.objectives[0]!;
        const st = states.find((s) => s.id === nextObj.id);
        const reachTarget = nextObj.type === 'reach' ? session.getNearestMissionTarget() : null;
        activeMissionHud = {
          titleKey: mDef.titleKey,
          objectiveDescKey: nextObj.descKey,
          progress: st?.progress ?? 0,
          target: st?.target ?? 1,
          targetNameKey: reachTarget?.nameKey,
          targetDistM: reachTarget?.distanceM,
        };
      }
    }

    const activeRoadEv = gm.roadEvents.getActiveEvents().find((e) => e.active);
    const roadEventAlert = activeRoadEv
      ? {
          title: activeRoadEv.title?.[settingsSignal.value.language] ?? activeRoadEv.kind,
          kind: activeRoadEv.kind,
        }
      : null;

    const activeProfile = activeReq ? session.requests.getProfile(activeReq.passengerId) : undefined;
    const activeChar = activeReq?.characterId ? getCharacter(activeReq.characterId) : undefined;
    const passengerNameKey = activeProfile?.nameKey ?? activeChar?.nameKey;
    const passengerName = passengerNameKey ? t(passengerNameKey) : 'Passenger';

    hud.update({
      speedKmh: currentSpeedKmh,
      objectiveText: objective,
      activeMission: activeMissionHud,
      roadEventAlert,
      dialogueSubtitle: dialogueSubtitleSignal.value,
      fare,
      fuelL,
      fuelMaxL,
      nearStation: session.nearFuelStation(),
      conditionPct: gm.economyManager.motorcycleCondition,
      todayNetEarnings,
      shiftClock,
      shiftDay,
      rating,
      isFirstPerson,
      nextTurn: view.instruction
        ? { direction: view.instruction.kind, text: t(view.instruction.textKey, { dist: Math.round(view.instruction.distanceM) }) }
        : null,
      chargeSpot:
        gm.economyManager.phoneBattery < BALANCE.PHONE.lowBatteryPct
          ? session.nearChargeSpot('home')
            ? 'home'
            : session.nearChargeSpot('teaStall')
              ? 'teaStall'
              : null
          : null,
      passengerStatus: activeReq
        ? {
            status: view.passenger,
            name: passengerName,
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
    if (screenSignal.value === 'map') {
      mapPlayerPosSignal.value = { x: session.bike.x, z: session.bike.z };
    }
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(frame);
  }
}


if (typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(frame);
}
}

import { render, h } from 'preact';
import './ui/tokens.css';
import { uiModalOpen, watchOverlayFocus } from './ui/gamepadNav';
import { AudioManager } from './audio/AudioManager';
import { getBikeDef } from './sim/economy/bikes';
import { bindAudio } from './audio/bindAudio';
import { GameManager } from './sim/GameManager';
import { GameSession } from './sim/GameSession';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { SIM_DT, MAX_FRAME_DT, MAX_SIM_STEPS_PER_FRAME } from './config/constants';
import type { BikeInput } from './physics/bikeModel';
import { RoadNetwork } from './sim/road/RoadNetwork';
import type { AutopilotController } from './debug/autopilot';
import type { Renderer } from './render/Renderer';
import { InputManager } from './input';
import { loadBindings } from './input/bindings';
import { App } from './ui/App';
import { registerSW } from 'virtual:pwa-register';
import {
  bindEventBusToStore,
  bindGlobalCrashHandlers,
  bindScreenWakeLock,
  formatErrorMessage,
  pausedSignal,
  rideWaitSignal,
  contextLostSignal,
  unsupportedSignal,
  loadingSignal,
  initPwaInstall,
  setSwUpdateAvailable,
  negotiationSignal,
  minimapCanvasSignal,
  dialogueSubtitleSignal,
  tickPhoneOffers,
  tutorialSignal,
  screenSignal,
  journalSignal,
  mapPlayerPosSignal,
  journalDataSignal,
  settingsSignal,
  settingsOpenSignal,
  touchFeedbackSignal,
  audioPreviewSignal,
  audioPreviewSeqSignal,
  phoneSignal,
  setActiveSaveSystem,
  mapWorldSignal,
  type GameSettings,
} from './ui/store';
import {
  createHudCache,
  resolveHudEtaMinutes,
  syncHudWithCache,
  type HudSyncInput,
} from './ui/hud/hudSync';
import { getCharacter } from './sim/passenger/PassengerAI';
import { ensureLocaleLoaded, setLanguage, t } from './ui/i18n';
import { consumeFreshCareer, resolveCareerSeed } from './ui/freshCareer';
import { applyDocumentSettings, routeColorFor } from './ui/settingsEffects';
import { remainingRouteEtaMin } from './sim/road/navigation';
import { bindUi, syncMapLiveFromSession } from './ui/bindings';
import { SaveSystem } from './sim/save/SaveSystem';
import { Minimap } from './render/minimap';
import { deriveRideView, nearestPlaceKey } from './sim/ride/rideView';
import { BALANCE } from './config/balance';
import type { DistrictData, WorldData } from './sim/schemas';
import { resolveQualityLevel, type QualityLevel } from './render/quality';
import type { DistrictId } from './core/types';
import mirparaData from '../data/districts/mirpara.json';
import worldDataJson from '../data/world.json';
import { loadAllDistricts } from './ui/map/worldAccessor';

/** Set once at boot in the bindings below; the frame loop drives it. */
let audio: AudioManager;
let engineThrottle = 0;

const allDistrictsMap: Record<string, DistrictData> = {
  mirpara: mirparaData as DistrictData,
};

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
const isMapTool = import.meta.env.DEV && urlParams?.get('tool') === 'map';
// T7.1: `?encounters=0` permanently disables ambient encounters in DEV (used by debug/test URLs
// that drive the sim directly and don't want a roaming encounter card in the way).
const encountersDisabledByUrl = import.meta.env.DEV && urlParams?.get('encounters') === '0';

let uiMounted = false;

function mountUiApp(): void {
  if (uiMounted || typeof document === 'undefined') return;
  initPwaInstall();
  bindGlobalCrashHandlers();
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setSwUpdateAvailable(updateSW);
        },
      });
    } catch {
      // Ignore SW registration in unsupported or non-secure test contexts
    }
  }
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

if (import.meta.env.DEV && isMapTool) {
  void (async () => {
    const [{ initMapViewer }, districts] = await Promise.all([
      import('./debug/mapViewer'),
      loadAllDistricts(),
    ]);
    for (const d of districts) {
      allDistrictsMap[d.districtId] = d;
    }
    let testloopJson: DistrictData | undefined;
    if (urlParams?.get('district') === 'testloop') {
      const mod = await import('../data/districts/testloop.json');
      testloopJson = (mod.default ?? mod) as DistrictData;
    }
    const wantDistrict = urlParams?.get('district');
    const districtChoice =
      wantDistrict === 'testloop' && testloopJson
        ? testloopJson
        : (wantDistrict && allDistrictsMap[wantDistrict]) || (mirparaData as DistrictData);
    initMapViewer({ district: districtChoice });
  })();
} else {
  // PhysicsWorld initializes before boot constructs GameSession and loads
  // the renderer's colliders so the first frame has full collision coverage.
  void bootGame().catch((err: unknown) => {
    mountUiApp();
    const message = formatErrorMessage(err);
    loadingSignal.value = {
      active: typeof document !== 'undefined',
      stageKey: 'loading.error',
      progress: loadingSignal.value.progress,
      error: message,
    };
  });
}

async function bootGame(): Promise<void> {
  // Ensure the active language dictionary is loaded and applied before the first render.
  setLanguage(settingsSignal.value.language);
  await ensureLocaleLoaded(settingsSignal.value.language);
  applyDocumentSettings(settingsSignal.value);

  setLoadingStage('loading.boot', 0);

  // 2. Mount Preact UI App while loadingSignal.active is true so <Loading />
  // owns the screen and <MainMenu /> stays hidden until bindUi() completes.
  mountUiApp();

  if (!hasWebGL2Support()) {
    unsupportedSignal.value = t('ui.unsupported_webgl');
    loadingSignal.value = { active: false, stageKey: 'loading.boot', progress: 0 };
    return;
  }

  // Dynamically load non-Mirpara districts so they live in separate lazy chunks
  const allDistrictsList = await loadAllDistricts();
  for (const d of allDistrictsList) {
    allDistrictsMap[d.districtId] = d;
  }
  mapWorldSignal.value = worldDataJson as WorldData;

  const districtParam = import.meta.env.DEV ? urlParams?.get('district') : null;
  if (import.meta.env.DEV && districtParam === 'testloop' && !allDistrictsMap.testloop) {
    const mod = await import('../data/districts/testloop.json');
    allDistrictsMap.testloop = (mod.default ?? mod) as DistrictData;
  }

  const isSingleDistrict = Boolean(
    import.meta.env.DEV &&
      districtParam &&
      districtParam !== 'world' &&
      allDistrictsMap[districtParam]
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

  const bootSeed = resolveCareerSeed(
    typeof window !== 'undefined' && window.location ? window.location.search : undefined
  );
  const gm = new GameManager({
    seed: bootSeed,
    mode: 'career',
    data: allDistrictsMap,
  });

  const bootCleanups: Array<() => void> = [];

  // Bind reactive signals store to sim event bus
  bootCleanups.push(bindEventBusToStore(gm.bus));
  // Keep phone screen awake while actively riding in-game.
  bootCleanups.push(bindScreenWakeLock());
  // Keyboard and pad focus move into a panel when it opens.
  watchOverlayFocus();
  // Sound: the audio context starts on the first gesture; settings and sim events drive it.
  audio = new AudioManager();
  bootCleanups.push(() => audio.dispose());
  bootCleanups.push(
    bindAudio(audio, gm.bus, settingsSignal, document, {
      subscribe: (fn) => audioPreviewSignal.subscribe(fn),
      seq: { subscribe: (fn) => audioPreviewSeqSignal.subscribe(fn) },
    })
  );
  // The bike slid at the grip limit: a tyre sound (H-4 for the ear).
  bootCleanups.push(gm.bus.on('bike/wobble', () => audio.playWobble()));
  bootCleanups.push(gm.bus.on('bike/nearMiss', () => audio.playNearMiss()));

  // Deterministic 2.5D spatial-hash physics world, used by GameSession's
  // MotorcycleController (collisions/near-misses) and CityBuilder colliders.
  setLoadingStage('loading.physics', 25);
  const physics = await PhysicsWorld.create();

  // T7.2: single-district debug/test URLs (in DEV) get one deterministic ride
  // instead of the real RequestGenerator, so e2e specs stay stable.
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

  const canvas =
    typeof document !== 'undefined'
      ? (document.getElementById('game-canvas') as HTMLCanvasElement)
      : null;
  let renderer: Renderer | undefined;
  let setDefaultSignLanguageFn: ((lang: 'bn' | 'en') => void) | undefined;
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
    const [{ Renderer: RendererClass }, { setDefaultSignLanguage }] = await Promise.all([
      import('./render/Renderer'),
      import('./render/signage'),
    ]);
    setDefaultSignLanguageFn = setDefaultSignLanguage;
    setDefaultSignLanguage(settingsSignal.value.language);
    renderer = RendererClass.init(canvas, qualityChoice);
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
    bootCleanups.push(
      gm.bus.on('state/restored', () => {
        syncBikeAppearance(renderer);
        renderer?.snapBikeState(session.bike);
        renderer?.syncFloodedSegments(gm.weatherSystem, roadNetwork);
        renderer?.syncRoadEvents(gm.roadEvents, roadNetwork);
      })
    );
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
        setDefaultSignLanguageFn?.(s.language);

        const nextRenderer = RendererClass.init(canvas, restoredQuality);
        renderer = nextRenderer;
        if (hasValidUrlQuality) {
          nextRenderer.setAdaptiveQualityEnabled(false);
        }
        nextRenderer.cameraRig.setReduceMotion(s.reduceMotion);
        nextRenderer.cameraRig.setMode(prevCamMode);
        if (import.meta.env.DEV && typeof window !== 'undefined' && window.__uthao) {
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
        nextRenderer.syncRoadEvents(gm.roadEvents, roadNetwork);
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
  setActiveSaveSystem(activeSaveSystem);
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

  const minimap = typeof document !== 'undefined' ? new Minimap(roadNetwork) : undefined;
  if (minimap) {
    minimapCanvasSignal.value = minimap.canvas;
    bootCleanups.push(() => {
      minimapCanvasSignal.value = null;
    });
  }

  const trafficManager = session.traffic;
  const inputManager = new InputManager({
    isModalOpen: () =>
      gm.paused || screenSignal.value !== 'game' || uiModalOpen(settingsOpenSignal.value),
  });
  bootCleanups.push(() => inputManager.detach());

  let autopilot: AutopilotController | undefined;
  if (import.meta.env.DEV) {
    const [{ AutopilotController: AutopilotClass }, { initDebugApi, spawnTestRequest }] =
      await Promise.all([import('./debug/autopilot'), import('./debug/debugApi')]);
    autopilot = new AutopilotClass(roadNetwork);
    initDebugApi(gm, {
      renderer,
      autopilot,
      rideManager,
      requests: session.requests,
      trafficManager,
    });
    if (isSingleDistrict) {
      spawnTestRequest(rideManager, 120);
    }
  }

  // T7.4: every UI dispatcher slot (request accept/decline, negotiation,
  // menu, save/load, tutorial, garage, bike, ending, phone contacts) is bound
  // here in one place instead of scattered across this file.
  bootCleanups.push(bindUi(session, activeSaveSystem));

  // Settings take effect as soon as they are saved, and the saved language is
  // applied on boot. Cancel reverts the language preview (Settings.tsx).
  const applySettings = (s: GameSettings) => {
    applyDocumentSettings(s);
    renderer?.cameraRig.setReduceMotion(s.reduceMotion);
    setDefaultSignLanguageFn?.(s.language);
    minimap?.setRouteColor(routeColorFor(s));
    gm.eventDirector.pauseOnDecisions = s.pauseOnDecisions;
    const baseBindings = s.controls ?? loadBindings();
    inputManager.setBindings({ ...baseBindings, tiltEnabled: s.tiltControls });
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

  // T7.3: confirm bike spawn is clear of newly loaded static colliders and snap camera
  // directly to initial spawn pose (no 180m swoop on the first frame).
  session.spawnAtHome();

  // A new career requested from the menu before this reload: start it on this fresh game.
  if (consumeFreshCareer()) {
    session.newCareer(bootSeed);
    syncBikeAppearance(renderer);
    tutorialSignal.value = {
      active: true,
      step: 'alarm',
      agreedFare: 100,
      cash: gm.economy.cash,
      fuelL: gm.economyManager.fuelLevel,
      conditionPct: gm.economyManager.motorcycleCondition,
      rentTarget: BALANCE.LIVING.familyPaymentDay3,
      receipt: null,
    };
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
  let lastSimBattery = Math.round(gm.economyManager.phoneBattery);
  let lastWaitSigKey = '';
  const minimapRoadEventsScratch: Array<{ x: number; z: number }> = [];
  const minimapStreetHailsScratch: Array<{ x: number; z: number }> = [];
  const minimapHazardScratch: { x: number; z: number; kind: 'police' | 'ambush' } = {
    x: 0,
    z: 0,
    kind: 'police',
  };
  const minimapMissionScratch: { x: number; z: number } = { x: 0, z: 0 };
  const minimapMarkersScratch: {
    pickup: { x: number; z: number } | null;
    dropoff: { x: number; z: number } | null;
    stop: { x: number; z: number } | null;
    mission: { x: number; z: number } | null;
    roadEvents: Array<{ x: number; z: number }>;
    streetHails: Array<{ x: number; z: number }>;
    hazard: { x: number; z: number; kind: 'police' | 'ambush' } | null;
  } = {
    pickup: null,
    dropoff: null,
    stop: null,
    mission: null,
    roadEvents: minimapRoadEventsScratch,
    streetHails: minimapStreetHailsScratch,
    hazard: null,
  };

  // Pre-allocated scratch & cache for zero-alloc steady-state syncHud()
  const hudCache = createHudCache();
  const getNearestMissionTargetFn = (poiId: string) => session.getNearestMissionTarget(poiId);
  const pollHudMissionsFn = () => gm.missionManager.getHudMissions(getNearestMissionTargetFn);
  const hudInputScratch: HudSyncInput = {
    now: 0,
    simStepped: false,
    isFirstPerson: false,
    districtId: '',
    canRecoverBike: true,
    gear: 1,
    objectiveKey: '',
    placeKey: '',
    objectiveMin: undefined,
    navKind: '',
    navTextKey: '',
    navDistM: -1,
    reqId: '',
    passengerStatus: 'None',
    passengerNameKey: undefined,
    passengerCharacterId: undefined,
    passengerArchetype: undefined,
    passengerMood: undefined,
    roadEventId: '',
    roadEventKind: '',
    roadEventTitles: undefined,
    activeMissionCount: 0,
    pollMissions: pollHudMissionsFn,
    fare: undefined,
    etaMinutes: undefined,
    nearStation: false,
    chargeSpot: null,
    todayNetEarnings: 0,
    shiftClock: '07:30',
    shiftDay: 1,
    rating: 5.0,
    dialogueSubtitle: null,
    speedKmh: 0,
    fuelL: 6.0,
    fuelMaxL: 8.0,
    conditionPct: 100,
  };

  function syncHud(
    now: number,
    simStepped: boolean,
    activeReq: ReturnType<typeof rideManager.getActiveRequest>,
    view: ReturnType<typeof deriveRideView>
  ): void {
    const activeRoadEv = gm.roadEvents.getFirstActiveEvent();
    let passengerNameKey: string | undefined;
    let passengerCharacterId: string | undefined;
    let passengerArchetype: string | undefined;
    if (activeReq) {
      const activeProfile = session.requests.getProfile(activeReq.passengerId);
      const activeChar = activeReq.characterId ? getCharacter(activeReq.characterId) : undefined;
      passengerNameKey =
        activeReq.passengerNameKey ?? activeProfile?.nameKey ?? activeChar?.nameKey;
      passengerCharacterId = activeReq.characterId ?? activeProfile?.characterId;
      passengerArchetype = activeProfile?.archetype ?? activeChar?.archetype;
    }

    const districtId = roadNetwork.getNodeDistrict(gm.playerNodeId) ?? activeDistrict.districtId;
    const routeEta = activeReq
      ? remainingRouteEtaMin(
          rideManager.currentRoute,
          { x: session.bike.x, z: session.bike.z },
          roadNetwork.getNodesMap()
        )
      : undefined;

    hudInputScratch.now = now;
    hudInputScratch.simStepped = simStepped;
    hudInputScratch.isFirstPerson = renderer ? renderer.cameraRig.mode === 'firstPerson' : false;
    hudInputScratch.districtId = districtId;
    hudInputScratch.canRecoverBike =
      !tutorialSignal.value.active || tutorialSignal.value.step === 'riding';
    hudInputScratch.gear = session.bike.gear;
    const followUp = session.getActiveFollowUp();
    const deliveryTarget = !activeReq && !followUp ? session.getActiveDeliveryTarget() : null;
    if (!activeReq && followUp) {
      hudInputScratch.objectiveKey = 'objective.phone_return';
      hudInputScratch.placeKey = followUp.placeKey;
      hudInputScratch.objectiveMin = undefined;
    } else if (!activeReq && deliveryTarget) {
      hudInputScratch.objectiveKey =
        deliveryTarget.status === 'accepted'
          ? 'objective.delivery_pickup'
          : 'objective.delivery_dropoff';
      hudInputScratch.placeKey = deliveryTarget.placeKey;
      hudInputScratch.objectiveMin = undefined;
    } else {
      hudInputScratch.objectiveKey = view.objectiveKey;
      hudInputScratch.placeKey =
        typeof view.objectiveVars.place === 'string' ? view.objectiveVars.place : '';
      hudInputScratch.objectiveMin =
        typeof view.objectiveVars.min === 'number' ? view.objectiveVars.min : undefined;
    }
    hudInputScratch.navKind = view.instruction ? view.instruction.kind : '';
    hudInputScratch.navTextKey = view.instruction ? view.instruction.textKey : '';
    hudInputScratch.navDistM = view.instruction ? Math.round(view.instruction.distanceM) : -1;
    hudInputScratch.reqId = activeReq ? activeReq.requestId : '';
    hudInputScratch.passengerStatus = view.passenger;
    hudInputScratch.passengerNameKey = passengerNameKey;
    hudInputScratch.passengerCharacterId = passengerCharacterId;
    hudInputScratch.passengerArchetype = passengerArchetype;
    hudInputScratch.passengerMood = activeReq ? rideManager.getPassengerMood() : undefined;
    hudInputScratch.roadEventId = activeRoadEv ? activeRoadEv.id : '';
    hudInputScratch.roadEventKind = activeRoadEv ? activeRoadEv.kind : '';
    hudInputScratch.roadEventTitles = activeRoadEv?.title;
    hudInputScratch.activeMissionCount = gm.story.activeMissions.length;
    hudInputScratch.fare = activeReq ? activeReq.initialFare : deliveryTarget?.basePayout;
    hudInputScratch.etaMinutes = resolveHudEtaMinutes(
      Boolean(activeReq),
      routeEta,
      activeReq?.estimatedDuration
    );
    hudInputScratch.nearStation = session.nearFuelStation();
    hudInputScratch.chargeSpot =
      gm.economyManager.phoneBattery < BALANCE.PHONE.lowBatteryPct
        ? session.nearChargeSpot('home')
          ? 'home'
          : session.nearChargeSpot('teaStall')
            ? 'teaStall'
            : null
        : null;
    hudInputScratch.todayNetEarnings = gm.economy.dailyRevenue - gm.economy.dailyExpenses;
    hudInputScratch.shiftClock = gm.clock.hhmm();
    hudInputScratch.shiftDay = gm.clock.day;
    hudInputScratch.rating = gm.reputationSystem.getAppRating();
    hudInputScratch.dialogueSubtitle = dialogueSubtitleSignal.value;
    hudInputScratch.speedKmh = Math.abs(session.bike.speed) * 3.6;
    hudInputScratch.fuelL = gm.economyManager.fuelLevel;
    hudInputScratch.fuelMaxL = gm.economyManager.maxFuelL();
    hudInputScratch.conditionPct = gm.economyManager.motorcycleCondition;

    const simBattery = Math.round(gm.economyManager.phoneBattery);
    if (simBattery !== lastSimBattery) {
      lastSimBattery = simBattery;
      phoneSignal.value = { ...phoneSignal.value, phoneBattery: simBattery };
    }

    syncHudWithCache(hudCache, hudInputScratch);
  }

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
      const touchThrottle = inputManager.isTouchThrottleActive();
      const touchBrake = inputManager.isTouchBrakeActive();
      const touchSteer = inputManager.getTouchSteer();
      const prevTouchVis = touchFeedbackSignal.value;
      if (
        touchThrottle !== prevTouchVis.throttle ||
        touchBrake !== prevTouchVis.brake ||
        Math.abs(touchSteer - prevTouchVis.steer) > 0.02
      ) {
        touchFeedbackSignal.value = {
          ...prevTouchVis,
          throttle: touchThrottle,
          brake: touchBrake,
          steer: touchSteer,
        };
      }
      const activeReq = rideManager.getActiveRequest();
      const driveView = deriveRideView(rideManager);

      // Autopilot (DEV-only) or inputManager
      let input: BikeInput;

      if (import.meta.env.DEV && autopilot?.isEnabled()) {
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
      if (input.brake > 0.35 && lastBikeBrake <= 0.35 && Math.abs(session.bike.speed) > 3.0) {
        audio.playBrake(input.brake);
      }
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
    audio.setEnginePitch(getBikeDef(gm.economyManager.currentBikeId).audioPitch);
    audio.updateEngine(
      session.bike.speed,
      engineThrottle,
      playing,
      session.bike.gear,
      session.bike.rpmNorm
    );
    audio.setAmbience(0.5, gm.weather, playing);
    if (!playing) audio.stopHorn();

    const activeReq = rideManager.getActiveRequest();
    // T8.1: the one place HUD, minimap and markers read ride state from.
    const view = deriveRideView(rideManager);
    const pNode = activeReq ? roadNetwork.getNode(activeReq.pickupNodeId) : undefined;
    const dNode = activeReq ? roadNetwork.getNode(activeReq.destinationNodeId) : undefined;
    const stopNode =
      view.stopVisible && view.stopNodeId
        ? roadNetwork.getNode(view.stopNodeId)
        : undefined;
    const followUp = session.getActiveFollowUp();
    const followUpNode =
      !activeReq && followUp ? roadNetwork.getNode(followUp.nodeId) : undefined;
    const deliveryTarget = !activeReq && !followUp ? session.getActiveDeliveryTarget() : null;
    const deliveryNode =
      !activeReq && !followUp && deliveryTarget
        ? roadNetwork.getNode(deliveryTarget.nodeId)
        : undefined;
    const activeStopNode = stopNode ?? followUpNode ?? deliveryNode;

    const activeWait = rideManager.getActiveWait();
    const waitKey = activeWait
      ? `${activeWait.kind}|${activeWait.labelKey}|${Math.round(activeWait.remainingSimSec * 20)}`
      : '';
    if (waitKey !== lastWaitSigKey) {
      lastWaitSigKey = waitKey;
      rideWaitSignal.value = activeWait ? { ...activeWait } : null;
    }

    const timeSec = now / 1000;
    const stageState = session.getEncounterStageState();
    const hailStates = session.getStreetHailStates();
    const missionBeacon = session.getActiveMissionBeaconState();
    const missionCharState = session.getMissionCharacterActorState();

    if (renderer) {
      if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, view.pickupVisible);
      else renderer.markers.setPickup(0, 0, false);
      if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, view.dropoffVisible);
      else renderer.markers.setDropoff(0, 0, false);
      if (activeStopNode) {
        renderer.markers.setStop(activeStopNode.x, activeStopNode.z, true);
      } else {
        renderer.markers.setStop(0, 0, false);
      }
      renderer.markers.setMission(
        missionBeacon.worldX,
        missionBeacon.worldZ,
        missionBeacon.visible
      );
      renderer.setPassengerVisible(session.isPassengerOnPillion());
      renderer.updateRidePassenger(session.getPassengerActorState(), timeSec);
      renderer.updateMissionCharacter(missionCharState, timeSec);
      renderer.updateStreetHails(hailStates, timeSec);
      renderer.updateEncounterStage(stageState, timeSec);

      renderer.updatePeople(
        trafficManager.pedestrians.getPedestrians(),
        trafficManager.getAgents(),
        timeSec
      );

      renderer.setBrakeLight(lastBikeBrake > 0.05);
      renderer.syncFloodedSegments(gm.weatherSystem, roadNetwork);
      renderer.syncRoadEvents(gm.roadEvents, roadNetwork);
      renderer.updateWorldEvents(timeSec);
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
        ownedUpgrades: [...gm.economyManager.ownedUpgrades],
      };
    }

    const curScreen = screenSignal.value;
    if (curScreen !== 'title') {
      // Update Minimap
      if (minimap) {
        minimapMarkersScratch.pickup = view.pickupVisible ? (pNode ?? null) : null;
        minimapMarkersScratch.dropoff = view.dropoffVisible ? (dNode ?? null) : null;
        minimapMarkersScratch.stop = activeStopNode ?? null;

        minimapRoadEventsScratch.length = 0;
        gm.roadEvents.forEachActiveEvent((ev) => {
          if (!ev.segmentId) return;
          const seg = roadNetwork.getSegment(ev.segmentId);
          const sN = seg ? roadNetwork.getNode(seg.startNodeId) : undefined;
          const eN = seg ? roadNetwork.getNode(seg.endNodeId) : undefined;
          if (!sN || !eN) return;
          minimapRoadEventsScratch.push({
            x: (sN.x + eN.x) * 0.5,
            z: (sN.z + eN.z) * 0.5,
          });
        });

        minimapStreetHailsScratch.length = 0;
        for (let i = 0; i < hailStates.length; i++) {
          const sh = hailStates[i]!;
          if (sh.active) {
            minimapStreetHailsScratch.push({ x: sh.worldX, z: sh.worldZ });
          }
        }

        if (stageState.kind !== 'none') {
          minimapHazardScratch.x = stageState.worldX;
          minimapHazardScratch.z = stageState.worldZ;
          minimapHazardScratch.kind =
            stageState.kind === 'policeCheckpoint' || stageState.kind === 'policeSignalStop'
              ? 'police'
              : 'ambush';
          minimapMarkersScratch.hazard = minimapHazardScratch;
        } else {
          minimapMarkersScratch.hazard = null;
        }

        if (missionBeacon.visible) {
          minimapMissionScratch.x = missionBeacon.worldX;
          minimapMissionScratch.z = missionBeacon.worldZ;
          minimapMarkersScratch.mission = minimapMissionScratch;
        } else {
          minimapMarkersScratch.mission = null;
        }

        minimap.update(
          { x: session.bike.x, z: session.bike.z, heading: session.bike.heading },
          rideManager.currentRoute ??
            session.getFollowUpRoute() ??
            session.getActiveDeliveryRoute() ??
            session.getActiveMissionRoute(),
          minimapMarkersScratch
        );
      }

      syncHud(now, steps > 0, activeReq, view);

      if (curScreen === 'map') {
        const prevMapPos = mapPlayerPosSignal.value;
        if (
          Math.abs(prevMapPos.x - session.bike.x) > 0.25 ||
          Math.abs(prevMapPos.z - session.bike.z) > 0.25
        ) {
          mapPlayerPosSignal.value = { x: session.bike.x, z: session.bike.z };
        }
        syncMapLiveFromSession(session);
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

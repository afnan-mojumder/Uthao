import type { GameManager, SimSnapshot } from '../sim/GameManager';
import type { Command, CommandResult } from '../core/commands';
import type { RideRequest, TripReceipt, WeatherKind } from '../core/types';
import type { Renderer } from '../render/Renderer';
import type { AutopilotController } from './autopilot';
import type { RideManager } from '../sim/ride/RideManager';
import { Rng, hashSeed } from '../core/rng';
import { generateProfile } from '../sim/passenger/profiles';

export interface DebugApi {
  gm: GameManager;
  renderer?: Renderer;
  rideManager?: RideManager;
  autopilotController?: AutopilotController;
  trafficManager?: import('../sim/traffic/TrafficManager').TrafficManager;
  eventLog: string[];
  lastReceipt?: TripReceipt;
  dispatch: (cmd: Command) => CommandResult;
  snapshot: () => SimSnapshot;
  setSeed: (seed: number) => void;
  teleport: (nodeId: string) => void;
  setTime: (hhmm: string) => void;
  setWeather: (w: WeatherKind) => void;
  autopilot: (on: boolean) => void;
  horn: (pos?: { x: number; z: number }) => void;
  getFps: () => number;
  getDrawCalls: () => number;
  getTriangles: () => number;
  toggleCamera: () => void;
  /** T7.3: true if the chase camera has ended up inside a collider despite
   * CameraRig's anti-clip raycast pull-in. Used by the e2e screenshot check. */
  isCameraClipping: () => boolean;
  spawnBargainer: (fare?: number) => RideRequest;
  /** T7.2: offers and auto-accepts a deterministic ride (first two road nodes),
   * for single-district debug/test boots that disable RequestGenerator. */
  spawnRequest: (fare?: number) => RideRequest;
  /** T7.1: force-starts a specific encounter by id, bypassing normal eligibility. */
  startEncounter: (encounterId: string) => boolean;
  isPaused: () => boolean;
}

declare global {
  interface Window {
    __uthao?: DebugApi;
  }
}

export interface DebugApiOptions {
  renderer?: Renderer;
  autopilot?: AutopilotController;
  rideManager?: RideManager;
  requests?: import('../sim/ride/RequestGenerator').RequestGenerator;
  trafficManager?: import('../sim/traffic/TrafficManager').TrafficManager;
}

/** T7.2: offers and auto-accepts a deterministic ride on the first two nodes
 * of the ride manager's road network. Used by single-district debug/test
 * boots (`autoRequests: false`) in place of the old hardcoded sample ride. */
export function spawnTestRequest(rideManager: RideManager, fare = 120): RideRequest {
  const allNodes = rideManager.roadNetwork.getAllNodes();
  const pNodeId = allNodes[0]?.nodeId ?? 'N1';
  const dNodeId = allNodes[1]?.nodeId ?? 'N2';
  const req: RideRequest = {
    requestId: 'req_debug_spawn',
    passengerId: 'p_debug',
    pickupNodeId: pNodeId,
    destinationNodeId: dNodeId,
    initialFare: fare,
    estimatedDistance: 0.1,
    estimatedDuration: 2,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1.0,
  };
  rideManager.offer(req);
  rideManager.accept(req.requestId);
  // Debug rides skip the haggling: the listed fare is the agreed fare.
  rideManager.agreeFare(fare);
  return req;
}

export function initDebugApi(
  gm: GameManager,
  opts?: DebugApiOptions | Renderer
): void {
  const isDev =
    (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') ||
    (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV));
  const hasDebugParam =
    typeof window !== 'undefined' &&
    window.location !== undefined &&
    window.location.search.includes('debug=1');

  if (!isDev && !hasDebugParam) {
    return;
  }

  const options: DebugApiOptions =
    opts && 'scene' in opts ? { renderer: opts } : (opts ?? {});

  const eventLog: string[] = [];
  let lastReceipt: TripReceipt | undefined;

  gm.bus.on('ride/requested', () => eventLog.push('ride/requested'));
  gm.bus.on('ride/accepted', () => eventLog.push('ride/accepted'));
  gm.bus.on('ride/arrivedPickup', () => eventLog.push('ride/arrivedPickup'));
  gm.bus.on('ride/started', () => eventLog.push('ride/started'));
  gm.bus.on('ride/completed', ({ receipt }) => {
    eventLog.push('ride/completed');
    lastReceipt = receipt;
  });

  window.__uthao = {
    gm,
    renderer: options.renderer,
    rideManager: options.rideManager,
    autopilotController: options.autopilot,
    trafficManager: options.trafficManager,
    eventLog,
    get lastReceipt() {
      return lastReceipt;
    },
    dispatch: (cmd: Command) => gm.dispatch(cmd),
    snapshot: () => gm.snapshot(),
    setSeed: (seed: number) => {
      void seed;
    },
    teleport: (nodeId: string) => {
      gm.waypointNodeId = nodeId;
    },
    setTime: (hhmm: string) => {
      const parts = hhmm.split(':');
      if (parts.length === 2) {
        const h = parseInt(parts[0] ?? '0', 10);
        const m = parseInt(parts[1] ?? '0', 10);
        gm.clock.minutes = (h * 60 + m) % 1440;
      }
    },
    setWeather: (w: WeatherKind) => {
      const prev = gm.weather;
      gm.weather = w;
      gm.weatherSystem.setWeather(w);
      gm.bus.emit('world/weatherChanged', { from: prev, to: w });
    },
    autopilot: (on: boolean) => {
      options.autopilot?.setEnabled(on);
      console.log(`[DebugApi] autopilot: ${on}`);
    },
    horn: (pos?: { x: number; z: number }) => {
      const p = pos ?? { x: 0, z: 0 };
      options.trafficManager?.triggerHorn(p);
    },
    getFps: () => options.renderer?.getFps() ?? 60,
    getDrawCalls: () => options.renderer?.getDrawCalls() ?? 0,
    getTriangles: () => options.renderer?.getTriangles() ?? 0,
    toggleCamera: () => options.renderer?.cameraRig.toggleMode(),
    isCameraClipping: () => options.renderer?.isCameraClipping() ?? false,
    spawnBargainer: (fare = 100) => {
      const allNodes = options.rideManager?.roadNetwork.getAllNodes() ?? [];
      const pNodeId = allNodes[0]?.nodeId ?? 'N1';
      const dNodeId = allNodes[1]?.nodeId ?? 'N2';
      const bargainerProfile = generateProfile('bargainer', new Rng(hashSeed('debugBargainer')), 'p_bargainer');
      bargainerProfile.patience = 0.8; // a patient haggler, so scripted e2e rounds stay on the page
      options.requests?.setProfile(bargainerProfile);
      const req: RideRequest = {
        requestId: 'req_bargain_test',
        passengerId: bargainerProfile.passengerId,
        pickupNodeId: pNodeId,
        destinationNodeId: dNodeId,
        initialFare: fare,
        estimatedDistance: 2.5,
        estimatedDuration: 10,
        requestedArrivalTime: null,
        bookingType: 'app',
        status: 'WaitingForPickup',
        surge: 1.0,
      };
      if (options.rideManager) {
        const rm = options.rideManager;
        // The single-district boot already holds an active test ride; accept() refuses while one is active.
        const busy = rm.getActiveRequest();
        if (busy) rm.cancel(busy.requestId, 'system', 'debugSpawnBargainer');
        rm.enableNegotiation = true;
        rm.offer(req);
        rm.accept(req.requestId);
      }
      return req;
    },
    spawnRequest: (fare = 120) => {
      if (!options.rideManager) {
        throw new Error('spawnRequest requires a rideManager');
      }
      return spawnTestRequest(options.rideManager, fare);
    },
    startEncounter: (encounterId: string) => {
      const instance = gm.eventDirector.forceStart(encounterId, gm.bus);
      if (instance && gm.eventDirector.pauseOnDecisions) {
        gm.paused = true;
      }
      return instance !== null;
    },
    isPaused: () => gm.paused,
  };
}

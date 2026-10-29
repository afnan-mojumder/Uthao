import type { GameManager, SimSnapshot } from '../sim/GameManager';
import type { Command, CommandResult } from '../core/commands';
import type { RideRequest, TripReceipt, WeatherKind } from '../core/types';
import type { Renderer } from '../render/Renderer';
import type { AutopilotController } from './autopilot';
import type { RideManager } from '../sim/ride/RideManager';
import { generateProfile } from '../sim/passenger/profiles';
import { Rng } from '../core/rng';

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
  spawnBargainer: (fare?: number) => RideRequest;
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
  trafficManager?: import('../sim/traffic/TrafficManager').TrafficManager;
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
    spawnBargainer: (fare = 100) => {
      const allNodes = options.rideManager?.roadNetwork.getAllNodes() ?? [];
      const pNodeId = allNodes[0]?.nodeId ?? 'N1';
      const dNodeId = allNodes[1]?.nodeId ?? 'N2';
      const bargainerProfile = generateProfile('bargainer', new Rng(123), 'p_bargainer');
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
        options.rideManager.enableNegotiation = true;
        options.rideManager.offer(req);
        options.rideManager.accept(req.requestId);
      }
      return req;
    },
  };
}

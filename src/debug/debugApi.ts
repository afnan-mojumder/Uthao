import type { GameManager, SimSnapshot } from '../sim/GameManager';
import type { Command, CommandResult } from '../core/commands';
import type { WeatherKind } from '../core/types';

export interface DebugApi {
  gm: GameManager;
  dispatch: (cmd: Command) => CommandResult;
  snapshot: () => SimSnapshot;
  setSeed: (seed: number) => void;
  teleport: (nodeId: string) => void;
  setTime: (hhmm: string) => void;
  setWeather: (w: WeatherKind) => void;
  autopilot: (on: boolean) => void;
}

declare global {
  interface Window {
    __uthao?: DebugApi;
  }
}

export function initDebugApi(gm: GameManager): void {
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

  let autopilotEnabled = false;

  window.__uthao = {
    gm,
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
      gm.bus.emit('world/weatherChanged', { from: prev, to: w });
    },
    autopilot: (on: boolean) => {
      autopilotEnabled = on;
      console.log(`[DebugApi] autopilot: ${autopilotEnabled}`);
    },
  };
}

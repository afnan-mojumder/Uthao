import { BALANCE } from '../../config/balance';
import type { RoadNode } from '../../core/types';

export type SignalPhase = 'green' | 'yellow' | 'red';

export interface TrafficSignalState {
  nodeId: string;
  activePhaseIndex: number;
  phaseTimer: number; // seconds remaining in current phase
  greenPhaseDuration: number;
  yellowPhaseDuration: number;
}

export class SignalController {
  private signals: Map<string, TrafficSignalState> = new Map();

  constructor(signaledNodes: RoadNode[], greenDuration = BALANCE.TRAFFIC.signalGreenTimeSec) {
    for (const node of signaledNodes) {
      if (node.signal) {
        this.signals.set(node.nodeId, {
          nodeId: node.nodeId,
          activePhaseIndex: 0,
          phaseTimer: greenDuration,
          greenPhaseDuration: greenDuration,
          yellowPhaseDuration: 3.0,
        });
      }
    }
  }

  update(dt: number): void {
    for (const signal of this.signals.values()) {
      signal.phaseTimer -= dt;
      if (signal.phaseTimer <= 0) {
        // Toggle between Phase 0 and Phase 1
        signal.activePhaseIndex = signal.activePhaseIndex === 0 ? 1 : 0;
        signal.phaseTimer = signal.greenPhaseDuration;
      }
    }
  }

  /**
   * Returns signal light for an incoming approach at a junction.
   * Phase 0 allows forward/straight approaches, Phase 1 allows cross approaches.
   */
  getSignalStatus(nodeId: string, approachIndex: number): SignalPhase {
    const signal = this.signals.get(nodeId);
    if (!signal) return 'green'; // Unsignaled junction

    const isPhaseA = approachIndex % 2 === 0;
    const isPhaseGreen = (isPhaseA && signal.activePhaseIndex === 0) || (!isPhaseA && signal.activePhaseIndex === 1);

    if (isPhaseGreen) {
      if (signal.phaseTimer < 3.0) return 'yellow';
      return 'green';
    }
    return 'red';
  }

  /**
   * Gap acceptance check at an unsignaled junction.
   * A vehicle can enter the junction if incoming conflicting vehicles are at least minGapSeconds away.
   */
  canAcceptGap(
    distToConflictM: number,
    approachingSpeedMs: number,
    minGapSeconds = 3.5
  ): boolean {
    if (approachingSpeedMs <= 0.5) return true;
    const timeToArrive = distToConflictM / approachingSpeedMs;
    return timeToArrive >= minGapSeconds;
  }
}

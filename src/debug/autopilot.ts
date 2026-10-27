import type { BikeState, BikeInput } from '../physics/bikeModel';
import type { RoadNetwork } from '../sim/road/RoadNetwork';
import { angleDiff, clamp, distance2d } from '../core/math';

export class AutopilotController {
  private network: RoadNetwork;
  private currentPathNodeIds: string[] = [];
  private currentTargetIndex: number = 0;
  private currentTargetNodeId: string | null = null;
  private enabled: boolean = false;

  constructor(network: RoadNetwork) {
    this.network = network;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.clear();
    }
  }

  setDestination(fromX: number, fromZ: number, destNodeId: string): boolean {
    if (this.currentTargetNodeId === destNodeId && this.currentPathNodeIds.length > 0) {
      return true;
    }
    this.currentTargetNodeId = destNodeId;
    this.currentTargetIndex = 0;

    const startNode = this.network.nearestNode(fromX, fromZ);
    if (!startNode) {
      this.currentPathNodeIds = [destNodeId];
      return false;
    }

    if (startNode.nodeId === destNodeId) {
      this.currentPathNodeIds = [destNodeId];
      return true;
    }

    const route = this.network.route(startNode.nodeId, destNodeId, {
      mode: 'motorcycle',
    });

    if (route && route.nodeIds.length > 0) {
      this.currentPathNodeIds = [...route.nodeIds];
      // If we are already past or right at the first node, advance
      if (this.currentPathNodeIds.length > 1) {
        const first = this.network.getNode(this.currentPathNodeIds[0]!);
        if (first && distance2d(fromX, fromZ, first.x, first.z) < 6.0) {
          this.currentTargetIndex = 1;
        }
      }
      return true;
    } else {
      this.currentPathNodeIds = [destNodeId];
      return true;
    }
  }

  clear(): void {
    this.currentPathNodeIds = [];
    this.currentTargetIndex = 0;
    this.currentTargetNodeId = null;
  }

  isFinished(): boolean {
    return (
      this.currentPathNodeIds.length === 0 ||
      this.currentTargetIndex >= this.currentPathNodeIds.length
    );
  }

  step(bike: BikeState): BikeInput {
    if (!this.enabled || this.currentPathNodeIds.length === 0) {
      return { throttle: 0, brake: 0, steer: 0 };
    }

    if (this.currentTargetIndex >= this.currentPathNodeIds.length) {
      if (bike.speed > 0.5) {
        return { throttle: 0, brake: 0.9, steer: 0 };
      }
      return { throttle: 0, brake: 0, steer: 0 };
    }

    const targetNodeId = this.currentPathNodeIds[this.currentTargetIndex];
    const targetNode = this.network.getNode(targetNodeId!);
    if (!targetNode) {
      this.currentTargetIndex++;
      return { throttle: 0, brake: 0, steer: 0 };
    }

    const dist = distance2d(bike.x, bike.z, targetNode.x, targetNode.z);
    const isFinal = this.currentTargetIndex === this.currentPathNodeIds.length - 1;

    // Advance intermediate waypoints when within 8 meters
    if (!isFinal && dist < 8.0) {
      this.currentTargetIndex++;
      return this.step(bike);
    }

    // Steering
    const dx = targetNode.x - bike.x;
    const dz = targetNode.z - bike.z;
    const desiredHeading = Math.atan2(dx, dz);
    const diff = angleDiff(bike.heading, desiredHeading);
    const steer = clamp(diff * 2.5, -1, 1);

    // Speed Control
    let throttle: number;
    let brake: number;

    if (isFinal) {
      if (dist <= 6.0) {
        // Inside arrival zone: full brake to stop
        if (bike.speed > 0.4) {
          brake = 1.0;
          throttle = 0;
        } else {
          brake = 0.2;
          throttle = 0;
        }
      } else if (dist < 16.0) {
        // Final approach: keep speed between 1.0 and 1.8 m/s
        if (bike.speed > 1.8) {
          brake = 0.9;
          throttle = 0;
        } else if (bike.speed < 1.0) {
          throttle = 0.35;
          brake = 0;
        } else {
          throttle = 0.08;
          brake = 0;
        }
      } else if (dist < 30.0) {
        // Initial deceleration zone: ramp down from cruise to ~5 m/s
        if (bike.speed > 5.5) {
          brake = 0.8;
          throttle = 0;
        } else if (bike.speed < 4.0) {
          throttle = 0.4;
          brake = 0;
        } else {
          throttle = 0.15;
          brake = 0;
        }
      } else {
        const targetSpeed = Math.abs(diff) > 0.4 ? 5.0 : 11.0;
        if (bike.speed < targetSpeed) {
          throttle = 0.85;
          brake = 0;
        } else if (bike.speed > targetSpeed + 0.5) {
          brake = 0.3;
          throttle = 0;
        } else {
          throttle = 0.25;
          brake = 0;
        }
      }
    } else {
      const targetSpeed = Math.abs(diff) > 0.4 ? 5.0 : 11.0;
      if (bike.speed < targetSpeed) {
        throttle = 0.85;
        brake = 0;
      } else if (bike.speed > targetSpeed + 0.5) {
        brake = 0.3;
        throttle = 0;
      } else {
        throttle = 0.25;
        brake = 0;
      }
    }

    return { throttle, brake, steer };
  }
}

import {
  createPassengerFsm,
  type PassengerEvent,
} from './passengerFsm';
import type { RoadNetwork } from '../road/RoadNetwork';
import type { EventBus, GameEvents } from '../../core/events';
import type {
  RideRequest,
  Transaction,
  PassengerState,
} from '../../core/types';
import { distance2d } from '../../core/math';
import type { Fsm } from '../../core/fsm';
import type { Route, PickupOptionsResult } from '../road/routing';
import type { Rng } from '../../core/rng';
import { BALANCE } from '../../config/balance';
import { receipt } from '../economy/fuel';

export interface RideManagerOptions {
  roadNetwork: RoadNetwork;
  bus: EventBus<GameEvents>;
}

export class RideManager {
  readonly roadNetwork: RoadNetwork;
  readonly bus: EventBus<GameEvents>;

  private offeredRequests: Map<string, RideRequest> = new Map();
  private activeRequest: RideRequest | null = null;
  private fsm: Fsm<PassengerState, PassengerEvent> | null = null;
  currentRoute: Route | null = null;
  offAppStrikes: number = 0;
  appSuspendedUntilDay: number = 0;
  readonly directContacts: Set<string> = new Set();

  constructor(opts: RideManagerOptions) {
    this.roadNetwork = opts.roadNetwork;
    this.bus = opts.bus;
  }

  getActiveRequest(): RideRequest | null {
    return this.activeRequest;
  }

  getOfferedRequests(): RideRequest[] {
    return Array.from(this.offeredRequests.values());
  }

  offer(request: RideRequest): void {
    this.offeredRequests.set(request.requestId, { ...request });
    this.bus.emit('ride/requested', { request });
  }

  accept(requestId: string, startNodeId?: string): boolean {
    const req = this.offeredRequests.get(requestId);
    if (!req) return false;

    this.activeRequest = { ...req };
    this.fsm = createPassengerFsm(this.activeRequest.status);
    this.currentRoute = this.roadNetwork.route(
      startNodeId ?? req.pickupNodeId,
      req.destinationNodeId,
      { mode: 'motorcycle' }
    );
    this.bus.emit('ride/accepted', { requestId });
    return true;
  }

  pickupOptions(
    req: { pickupNodeId: string },
    riderPos: { x: number; z: number } | string,
    options?: { maxWalkM?: number }
  ): PickupOptionsResult | null {
    return this.roadNetwork.pickupOptions(req, riderPos, options);
  }

  rerouteIfBlocked(blockedSegmentId: string, currentNodeId?: string): Route | null {
    if (!this.activeRequest || !this.currentRoute) {
      return null;
    }
    if (!this.currentRoute.segmentIds.includes(blockedSegmentId)) {
      return null;
    }

    const fromNode = currentNodeId ?? this.activeRequest.pickupNodeId;
    const newRoute = this.roadNetwork.route(fromNode, this.activeRequest.destinationNodeId, {
      mode: 'motorcycle',
      avoid: [blockedSegmentId],
    });

    if (newRoute) {
      this.currentRoute = newRoute;
      return newRoute;
    }
    return null;
  }

  addStrike(currentDay: number): { strikes: number; suspended: boolean } {
    this.offAppStrikes++;
    const suspended = this.offAppStrikes >= BALANCE.OFF_APP.strikesToSuspend;
    if (suspended) {
      this.appSuspendedUntilDay = currentDay + BALANCE.OFF_APP.suspendDays;
      this.bus.emit('story/flag', { key: 'appSuspended', value: true });
      this.bus.emit('story/flag', { key: 'appSuspendedUntilDay', value: this.appSuspendedUntilDay });
    }
    return { strikes: this.offAppStrikes, suspended };
  }

  recordOffAppRide(
    passengerId: string,
    currentDay: number,
    rng: Rng
  ): { detected: boolean; strikes: number; suspended: boolean } {
    this.directContacts.add(passengerId);
    const detected = rng.chance(BALANCE.OFF_APP.policyDetectChance);
    if (detected) {
      const res = this.addStrike(currentDay);
      return { detected: true, strikes: res.strikes, suspended: res.suspended };
    }
    return {
      detected: false,
      strikes: this.offAppStrikes,
      suspended: this.isAppSuspended(currentDay),
    };
  }

  isAppSuspended(currentDay: number): boolean {
    return currentDay < this.appSuspendedUntilDay;
  }

  cancel(
    requestId: string,
    by: 'rider' | 'passenger' | 'system',
    reason: string
  ): void {
    if (this.activeRequest?.requestId === requestId) {
      if (this.fsm && this.fsm.can('abort')) {
        this.fsm.send('abort');
      }
      this.activeRequest.status = 'Cancelled';
      this.activeRequest = null;
    }
    this.offeredRequests.delete(requestId);
    this.bus.emit('ride/cancelled', { requestId, by, reason });
  }

  update(
    bikePose: { x: number; z: number; speed: number },
    _dt: number
  ): void {
    void _dt;
    if (!this.activeRequest || !this.fsm) {
      return;
    }

    const state = this.fsm.state;

    if (state === 'WaitingForPickup') {
      const pickupNode = this.roadNetwork.getNode(
        this.activeRequest.pickupNodeId
      );
      if (pickupNode) {
        const dist = distance2d(
          bikePose.x,
          bikePose.z,
          pickupNode.x,
          pickupNode.z
        );
        if (dist <= 8.0 && bikePose.speed < 2.0) {
          // Arrived at pickup
          this.fsm.send('riderArrived'); // enters 'Negotiating'
          this.activeRequest.status = this.fsm.state;
          this.bus.emit('ride/arrivedPickup', {
            requestId: this.activeRequest.requestId,
          });

          // In M1, negotiation is auto-accept
          this.fsm.send('fareAccepted'); // enters 'OnTrip'
          this.activeRequest.status = this.fsm.state;
          this.bus.emit('ride/started', {
            requestId: this.activeRequest.requestId,
          });
        }
      }
    } else if (state === 'OnTrip') {
      const destNode = this.roadNetwork.getNode(
        this.activeRequest.destinationNodeId
      );
      if (destNode) {
        const dist = distance2d(
          bikePose.x,
          bikePose.z,
          destNode.x,
          destNode.z
        );
        if (dist <= 8.0 && bikePose.speed < 2.0) {
          // Arrived at destination
          this.fsm.send('arrived'); // enters 'Completed'
          this.activeRequest.status = this.fsm.state;

          const tripReceipt = receipt({
            requestId: this.activeRequest.requestId,
            fare: this.activeRequest.initialFare,
            bookingType: this.activeRequest.bookingType,
            durationMin: this.activeRequest.estimatedDuration,
            distanceKm: this.activeRequest.estimatedDistance,
            rating: 5,
          });

          this.bus.emit('ride/completed', {
            requestId: this.activeRequest.requestId,
            receipt: tripReceipt,
          });

          const tx: Transaction = {
            id: `tx_${this.activeRequest.requestId}`,
            day: 1,
            minute: 0,
            kind: 'fare',
            amount: tripReceipt.net,
            requestId: this.activeRequest.requestId,
          };
          this.bus.emit('economy/transaction', { tx });

          this.fsm.send('paidAndRated'); // enters 'Reviewed'
          this.activeRequest.status = this.fsm.state;
          this.activeRequest = null;
        }
      }
    }
  }
}

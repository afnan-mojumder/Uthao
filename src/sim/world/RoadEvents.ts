import type { EventBus, GameEvents } from '../../core/events';
import type { RoadEvent, RoadSegment } from '../../core/types';
import { Rng } from '../../core/rng';
import type { RoadNetwork } from '../road/RoadNetwork';

export type RoadEventKind =
  | 'construction'
  | 'stalled_vehicle'
  | 'market_congestion'
  | 'blocked_intersection'
  | 'diversion'
  | 'closure';

export interface ActiveRoadEvent extends RoadEvent {
  id: string;
  kind: RoadEventKind;
  segmentId: string;
  active: boolean;
  closesSegment: boolean;
  speedCapKmh?: number;
  congestionMultiplier?: number;
  hasWorkers?: boolean;
  diversionSegmentId?: string;
  startMinute: number;
  durationMinutes: number;
  remainingMinutes: number;
  title?: { bn: string; en: string };
}

export interface ScheduledRoadEvent {
  id?: string;
  kind: RoadEventKind;
  segmentId: string;
  startMinute: number;
  durationMinutes: number;
  closesSegment?: boolean;
  speedCapKmh?: number;
  congestionMultiplier?: number;
  hasWorkers?: boolean;
  diversionSegmentId?: string;
  title?: { bn: string; en: string };
}

export interface RoadEventManagerOptions {
  bus?: EventBus<GameEvents>;
  network?: RoadNetwork;
  seed?: number;
}

export class RoadEventManager {
  private readonly bus?: EventBus<GameEvents>;
  private readonly network?: RoadNetwork;
  private readonly rng: Rng;
  private nextEventSeq = 0;

  private activeEvents: Map<string, ActiveRoadEvent> = new Map();
  private scheduledEvents: ScheduledRoadEvent[] = [];

  constructor(opts: RoadEventManagerOptions = {}) {
    this.bus = opts.bus;
    this.network = opts.network;
    this.rng = new Rng(opts.seed ?? 54321);
  }

  /**
   * Adds an active road event directly and notifies listeners.
   */
  addEvent(
    eventDef: Omit<ActiveRoadEvent, 'active' | 'remainingMinutes'> & {
      active?: boolean;
      remainingMinutes?: number;
    }
  ): ActiveRoadEvent {
    const active = eventDef.active ?? true;
    const remaining = eventDef.remainingMinutes ?? eventDef.durationMinutes;

    const event: ActiveRoadEvent = {
      ...eventDef,
      active,
      remainingMinutes: remaining,
    };

    this.activeEvents.set(event.id, event);

    if (this.bus) {
      this.bus.emit('world/roadEvent', {
        event: {
          id: event.id,
          kind: event.kind,
          segmentId: event.segmentId,
          active: event.active,
        },
      });
    }

    return event;
  }

  /**
   * Removes an event by ID.
   */
  removeEvent(id: string): boolean {
    const existing = this.activeEvents.get(id);
    if (!existing) return false;

    this.activeEvents.delete(id);

    if (this.bus) {
      this.bus.emit('world/roadEvent', {
        event: {
          id: existing.id,
          kind: existing.kind,
          segmentId: existing.segmentId,
          active: false,
        },
      });
    }

    return true;
  }

  clearEvents(): void {
    this.activeEvents.clear();
  }

  /**
   * Closes a road segment completely for a duration.
   */
  closeSegment(
    segmentId: string,
    durationMinutes = 60,
    kind: RoadEventKind = 'closure',
    title?: { bn: string; en: string }
  ): ActiveRoadEvent {
    const id = `re_close_${++this.nextEventSeq}_${segmentId}`;
    return this.addEvent({
      id,
      kind,
      segmentId,
      closesSegment: true,
      startMinute: 0,
      durationMinutes,
      title: title ?? {
        bn: 'রাস্তা বন্ধ',
        en: 'Road Closed',
      },
    });
  }

  /**
   * Reopens a segment by removing all events closing it.
   */
  reopenSegment(segmentId: string): boolean {
    let removedAny = false;
    for (const [id, event] of this.activeEvents.entries()) {
      if (event.segmentId === segmentId && event.closesSegment) {
        this.removeEvent(id);
        removedAny = true;
      }
    }
    return removedAny;
  }

  /**
   * Returns an array of segment IDs that are currently closed to traffic.
   */
  getClosedSegmentIds(): string[] {
    const closed = new Set<string>();
    for (const event of this.activeEvents.values()) {
      if (event.active && event.closesSegment) {
        closed.add(event.segmentId);
      }
    }
    return Array.from(closed);
  }

  /**
   * Checks whether a specific segment is currently closed.
   */
  isSegmentClosed(segmentId: string): boolean {
    for (const event of this.activeEvents.values()) {
      if (event.segmentId === segmentId && event.active && event.closesSegment) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets all active road events.
   */
  getActiveEvents(): ActiveRoadEvent[] {
    return Array.from(this.activeEvents.values());
  }

  /**
   * Gets active events for a specific segment.
   */
  getEventsForSegment(segmentId: string): ActiveRoadEvent[] {
    return Array.from(this.activeEvents.values()).filter(
      (e) => e.segmentId === segmentId && e.active
    );
  }

  /**
   * Returns the lowest active speed cap for a segment, or undefined if no cap exists.
   */
  getSpeedCap(segmentId: string): number | undefined {
    let minCap: number | undefined;
    for (const event of this.activeEvents.values()) {
      if (event.segmentId === segmentId && event.active && event.speedCapKmh !== undefined) {
        if (minCap === undefined || event.speedCapKmh < minCap) {
          minCap = event.speedCapKmh;
        }
      }
    }
    return minCap;
  }

  /**
   * Returns the combined congestion multiplier for a segment (1.0 = normal).
   */
  getCongestionMultiplier(segmentId: string): number {
    let multiplier = 1.0;
    for (const event of this.activeEvents.values()) {
      if (event.segmentId === segmentId && event.active && event.congestionMultiplier) {
        multiplier = Math.max(multiplier, event.congestionMultiplier);
      }
    }
    return multiplier;
  }

  /**
   * Schedules a road event to activate at a future game minute.
   */
  scheduleEvent(event: ScheduledRoadEvent): void {
    const id = event.id ?? `re_sched_${++this.nextEventSeq}_${event.segmentId}`;
    this.scheduledEvents.push({ ...event, id });
  }

  /**
   * Advances active and scheduled road events by dtMinutes.
   */
  tick(dtMinutes: number, currentMinute?: number): void {
    // 1. Check scheduled events if currentMinute is provided
    if (currentMinute !== undefined && this.scheduledEvents.length > 0) {
      const remainingScheduled: ScheduledRoadEvent[] = [];
      for (const sched of this.scheduledEvents) {
        const isTime =
          currentMinute >= sched.startMinute &&
          currentMinute < sched.startMinute + sched.durationMinutes;

        if (isTime) {
          this.addEvent({
            id: sched.id!,
            kind: sched.kind,
            segmentId: sched.segmentId,
            closesSegment: sched.closesSegment ?? false,
            speedCapKmh: sched.speedCapKmh,
            congestionMultiplier: sched.congestionMultiplier,
            hasWorkers: sched.hasWorkers,
            diversionSegmentId: sched.diversionSegmentId,
            startMinute: sched.startMinute,
            durationMinutes: sched.durationMinutes,
            remainingMinutes: sched.durationMinutes - (currentMinute - sched.startMinute),
            title: sched.title,
          });
        } else if (currentMinute < sched.startMinute) {
          remainingScheduled.push(sched);
        }
      }
      this.scheduledEvents = remainingScheduled;
    }

    // 2. Decrement remaining minutes on active events
    const toRemove: string[] = [];
    for (const [id, event] of this.activeEvents.entries()) {
      event.remainingMinutes -= dtMinutes;
      if (event.remainingMinutes <= 0) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeEvent(id);
    }
  }

  /**
   * Generates an authentic random Dhaka road event.
   */
  generateRandomEvent(currentMinute = 0): ActiveRoadEvent | null {
    if (!this.network) return null;
    const segments = this.network.getAllSegments();
    if (segments.length === 0) return null;

    const kinds: RoadEventKind[] = [
      'construction',
      'stalled_vehicle',
      'market_congestion',
      'blocked_intersection',
      'diversion',
      'closure',
    ];

    const kind = this.rng.pick(kinds);
    let eligibleSegments: RoadSegment[];

    if (kind === 'market_congestion') {
      eligibleSegments = segments.filter((s) => s.roadType === 'market');
      if (eligibleSegments.length === 0) eligibleSegments = segments;
    } else if (kind === 'diversion' || kind === 'closure') {
      eligibleSegments = segments.filter((s) => !s.divided || s.lanes <= 2);
      if (eligibleSegments.length === 0) eligibleSegments = segments;
    } else {
      eligibleSegments = segments;
    }

    const seg = this.rng.pick(eligibleSegments);
    const id = `re_rand_${++this.nextEventSeq}_${seg.segmentId}`;

    const duration = this.rng.range(30, 180);

    let closesSegment = false;
    let speedCapKmh: number | undefined;
    let congestionMultiplier: number | undefined;
    let hasWorkers: boolean | undefined;
    let title: { bn: string; en: string };

    switch (kind) {
      case 'construction':
        closesSegment = this.rng.next() < 0.4;
        speedCapKmh = 20;
        hasWorkers = true;
        title = {
          bn: 'রাস্তার কাজ চলছে',
          en: 'Road Construction',
        };
        break;
      case 'stalled_vehicle':
        speedCapKmh = 15;
        congestionMultiplier = 1.8;
        title = {
          bn: 'গাড়ি বিকল',
          en: 'Stalled Vehicle',
        };
        break;
      case 'market_congestion':
        speedCapKmh = 10;
        congestionMultiplier = 2.5;
        title = {
          bn: 'বাজারের জ্যাম',
          en: 'Market Congestion',
        };
        break;
      case 'blocked_intersection':
        closesSegment = true;
        title = {
          bn: 'মোড় অবরুদ্ধ',
          en: 'Blocked Intersection',
        };
        break;
      case 'diversion':
        closesSegment = true;
        title = {
          bn: 'রোড ডাইভারশন',
          en: 'Traffic Diversion',
        };
        break;
      case 'closure':
      default:
        closesSegment = true;
        title = {
          bn: 'সাময়িক বন্ধ',
          en: 'Temporary Road Closure',
        };
        break;
    }

    return this.addEvent({
      id,
      kind,
      segmentId: seg.segmentId,
      closesSegment,
      speedCapKmh,
      congestionMultiplier,
      hasWorkers,
      startMinute: currentMinute,
      durationMinutes: duration,
      title,
    });
  }
}

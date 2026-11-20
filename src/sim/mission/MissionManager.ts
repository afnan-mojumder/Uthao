import { EventBus, type GameEvents } from '../../core/events';
import type { MissionDef, EndingDef, Effect } from '../schemas';
import {
  type ObjectiveState,
  createObjectiveState,
  evaluateRideCompleted,
  evaluateTransaction,
  evaluateEncounterResolved,
  evaluateFlagChanged,
  evaluateRelationshipChanged,
  evaluateReachPoi,
} from './objectives';
import type { StoryState, EndingId, DistrictId } from '../../core/types';
import type { EffectContext } from '../events/effects';
import { applyEffect } from '../events/effects';
import { canonicalCharacterId } from '../passenger/PassengerAI';
import type { ReputationSystem } from '../reputation/ReputationSystem';

export interface HudMissionEntry {
  id: string;
  titleKey: string;
  objectiveDescKey: string;
  progress: number;
  target: number;
  targetNameKey?: string;
  targetDistM?: number;
  isSide: boolean;
}

export interface MissionManagerSnapshot {
  visitedDistricts: string[];
  objectiveStates?: Record<string, ObjectiveState[]>;
}

export interface MissionManagerOptions {
  bus: EventBus<GameEvents>;
  missions: MissionDef[];
  endings?: EndingDef[];
  storyState: StoryState;
  getEffectContext?: () => EffectContext;
  reputationSystem?: ReputationSystem;
}

export class MissionManager {
  readonly bus: EventBus<GameEvents>;
  readonly missions: Map<string, MissionDef> = new Map();
  readonly endings: Map<string, EndingDef> = new Map();
  readonly storyState: StoryState;
  private readonly getEffectContext?: () => EffectContext;
  private readonly reputationSystem?: ReputationSystem;

  private activeMissionIds: Set<string> = new Set();
  private completedMissionIds: Set<string> = new Set();
  private objectiveStates: Map<string, Map<string, ObjectiveState>> = new Map();
  private visitedDistricts: Set<string> = new Set();
  private currentDay: number = 1;
  private inRide: boolean = false;
  private currentTripCrashed: boolean = false;

  constructor(opts: MissionManagerOptions) {
    this.bus = opts.bus;
    this.storyState = opts.storyState;
    this.getEffectContext = opts.getEffectContext;
    this.reputationSystem = opts.reputationSystem;

    for (const m of opts.missions) {
      this.missions.set(m.id, m);
    }
    if (opts.endings) {
      for (const e of opts.endings) {
        this.endings.set(e.id, e);
      }
    }

    if (this.storyState.completedMissions) {
      for (const id of this.storyState.completedMissions) {
        this.completedMissionIds.add(id);
      }
    }
    if (this.storyState.activeMissions) {
      for (const id of this.storyState.activeMissions) {
        this.activateMission(id);
      }
    }

    this.setupListeners();
    this.refreshAvailableMissions(this.storyState.currentChapter, 1);
  }

  private getCurrentDay(): number {
    return this.getEffectContext?.()?.gameManager.clock.day ?? this.currentDay;
  }

  private setupListeners(): void {
    this.bus.on('day/started', ({ day }) => {
      this.currentDay = day;
      this.checkFailConditions(day);
      this.refreshAvailableMissions(this.storyState.currentChapter, day);
    });

    this.bus.on('day/ended', ({ day }) => {
      this.currentDay = Math.max(this.currentDay, day);
      this.checkFailConditions(day);
    });

    this.bus.on('ride/started', () => {
      this.inRide = true;
      this.currentTripCrashed = false;
    });

    this.bus.on('ride/cancelled', () => {
      this.inRide = false;
      this.currentTripCrashed = false;
    });

    this.bus.on('bike/collision', ({ severity }) => {
      if (severity === 'crash' && this.inRide) {
        this.currentTripCrashed = true;
      }
    });

    this.bus.on('ride/completed', (ev) => {
      const { receipt, crashed } = ev;
      const didCrash = Boolean(crashed || this.currentTripCrashed);
      this.currentTripCrashed = false;
      this.inRide = false;

      const gm = this.getEffectContext?.()?.gameManager;
      const minute = ev.minute ?? gm?.clock.minutes ?? 0;
      const weather = ev.weather ?? gm?.weather;
      const district = ev.district ?? ev.destinationDistrict ?? ev.pickupDistrict;

      if (ev.pickupDistrict) this.visitedDistricts.add(ev.pickupDistrict);
      if (ev.destinationDistrict) this.visitedDistricts.add(ev.destinationDistrict);
      if (district) this.visitedDistricts.add(district);

      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateRideCompleted(obj, state, {
            receipt,
            passengerCharacterId: ev.passengerCharacterId,
            district,
            pickupDistrict: ev.pickupDistrict,
            destinationDistrict: ev.destinationDistrict,
            zoneTags: ev.zoneTags,
            weather,
            minute,
            crashed: didCrash,
            visitedDistricts: this.visitedDistricts,
          });

          if (changed) {
            this.bus.emit('mission/objectiveUpdated', {
              missionId,
              objectiveId: obj.id,
              progress: state.progress,
            });
          }
        }

        this.checkMissionCompletion(missionId);
      }
    });

    this.bus.on('economy/transaction', ({ tx }) => {
      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateTransaction(obj, state, {
            kind: tx.kind,
            amount: tx.amount,
            expenseId: tx.kind,
          });

          if (changed) {
            this.bus.emit('mission/objectiveUpdated', {
              missionId,
              objectiveId: obj.id,
              progress: state.progress,
            });
          }
        }

        this.checkMissionCompletion(missionId);
      }
    });

    this.bus.on('encounter/resolved', ({ instanceId, choiceId, encounterId }) => {
      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateEncounterResolved(obj, state, {
            // Objectives name definition ids; fall back to the instance only for old emitters.
            encounterId: encounterId ?? instanceId,
            choiceId,
            success: true,
          });

          if (changed) {
            this.bus.emit('mission/objectiveUpdated', {
              missionId,
              objectiveId: obj.id,
              progress: state.progress,
            });
          }
        }

        this.checkMissionCompletion(missionId);
      }
    });

    this.bus.on('story/flag', ({ key, value }) => {
      this.storyState.branchFlags[key] = value;
      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateFlagChanged(obj, state, key, value);
          if (changed) {
            this.bus.emit('mission/objectiveUpdated', {
              missionId,
              objectiveId: obj.id,
              progress: state.progress,
            });
          }
        }

        this.checkMissionCompletion(missionId);
      }
    });

    this.bus.on('reputation/changed', ({ delta }) => {
      if (delta.relationship) {
        const { characterId } = delta.relationship;
        // T7.5 / Ruling 6: ReputationSystem is the sole writer of characterRelationships.
        const current = this.reputationSystem
          ? this.reputationSystem.getRelationship(characterId)
          : (this.storyState.characterRelationships[characterId] ?? 0);

        for (const missionId of this.activeMissionIds) {
          const def = this.missions.get(missionId);
          const objMap = this.objectiveStates.get(missionId);
          if (!def || !objMap) continue;

          for (const obj of def.objectives) {
            const state = objMap.get(obj.id);
            if (!state) continue;

            const changed = evaluateRelationshipChanged(obj, state, characterId, current);
            if (changed) {
              this.bus.emit('mission/objectiveUpdated', {
                missionId,
                objectiveId: obj.id,
                progress: state.progress,
              });
            }
          }

          this.checkMissionCompletion(missionId);
        }
      }
    });
  }

  refreshAvailableMissions(currentChapter: number, currentDay: number): void {
    for (const [id, def] of this.missions) {
      if (def.triggerOnly || this.completedMissionIds.has(id) || this.activeMissionIds.has(id)) {
        continue;
      }

      if (def.chapter <= currentChapter && def.day <= currentDay) {
        const prereqsMet = def.prerequisites.every((req) => this.completedMissionIds.has(req));
        if (prereqsMet) {
          this.activateMission(id);
        }
      }
    }
  }

  /** Evaluates `reach` objectives against the POIs currently within range of the player. */
  checkNearbyPois(nearbyPoiIds: Set<string>): void {
    if (nearbyPoiIds.size === 0 || this.activeMissionIds.size === 0) return;
    for (const missionId of this.activeMissionIds) {
      const def = this.missions.get(missionId);
      const objMap = this.objectiveStates.get(missionId);
      if (!def || !objMap) continue;
      for (const obj of def.objectives) {
        if (obj.type !== 'reach') continue;
        const state = objMap.get(obj.id);
        if (!state) continue;
        if (evaluateReachPoi(obj, state, nearbyPoiIds)) {
          this.bus.emit('mission/objectiveUpdated', {
            missionId,
            objectiveId: obj.id,
            progress: state.progress,
          });
        }
      }
      this.checkMissionCompletion(missionId);
    }
  }

  /** Returns the first incomplete `reach` objective's target POI/kind, if any. */
  getActiveReachTarget(): { missionId: string; poiId: string } | null {
    for (const missionId of this.activeMissionIds) {
      const def = this.missions.get(missionId);
      const objMap = this.objectiveStates.get(missionId);
      if (!def || !objMap) continue;
      for (const obj of def.objectives) {
        if (obj.type !== 'reach') continue;
        const state = objMap.get(obj.id);
        if (state && !state.completed) {
          return { missionId, poiId: obj.poiId };
        }
      }
    }
    return null;
  }

  activateMission(id: string): boolean {
    if (this.activeMissionIds.has(id) || this.completedMissionIds.has(id)) {
      return false;
    }
    const def = this.missions.get(id);
    if (!def) return false;

    this.activeMissionIds.add(id);
    if (!this.storyState.activeMissions.includes(id)) {
      this.storyState.activeMissions.push(id);
    }

    const objMap = new Map<string, ObjectiveState>();
    for (const obj of def.objectives) {
      const state = createObjectiveState(obj);
      // A flag or relationship threshold already satisfied before activation still counts.
      if (obj.type === 'flag' && this.storyState.branchFlags[obj.key] === obj.value) {
        state.progress = 1;
        state.completed = true;
      } else if (obj.type === 'relationship') {
        const current = this.reputationSystem
          ? this.reputationSystem.getRelationship(obj.characterId)
          : (this.storyState.characterRelationships[obj.characterId] ?? 0);
        evaluateRelationshipChanged(obj, state, obj.characterId, current);
      }
      objMap.set(obj.id, state);
    }
    this.objectiveStates.set(id, objMap);

    this.bus.emit('mission/activated', { missionId: id });
    if (def.objectives.length > 0) this.checkMissionCompletion(id);
    return true;
  }

  private checkMissionCompletion(missionId: string): void {
    const def = this.missions.get(missionId);
    const objMap = this.objectiveStates.get(missionId);
    if (!def || !objMap) return;

    const allDone = def.objectives.every((obj) => {
      if (obj.optional) return true;
      const state = objMap.get(obj.id);
      return state && state.completed;
    });

    if (allDone) {
      this.completeMission(missionId);
    }
  }

  private advanceChapterForMission(missionId: string): void {
    if (missionId === 'm1_household') {
      this.storyState.currentChapter = Math.max(this.storyState.currentChapter, 2);
    } else if (missionId === 'm2_evening_rush') {
      this.storyState.currentChapter = Math.max(this.storyState.currentChapter, 3);
    } else if (missionId === 'm3_hospital_run') {
      this.storyState.currentChapter = Math.max(this.storyState.currentChapter, 4);
    } else if (missionId === 'm4_home_safe') {
      this.storyState.currentChapter = Math.max(this.storyState.currentChapter, 5);
    } else if (missionId === 'm5_linked_jobs') {
      this.storyState.currentChapter = Math.max(this.storyState.currentChapter, 6);
    } else if (missionId === 'm6_decision') {
      this.storyState.branchFlags['campaign_completed'] = true;
    }
  }

  private unlockNextMissions(def: MissionDef): void {
    const day = this.getCurrentDay();
    for (const nextId of def.unlocks) {
      const nextDef = this.missions.get(nextId);
      if (!nextDef || nextDef.day <= day) {
        this.activateMission(nextId);
      }
    }
  }

  completeMission(missionId: string): void {
    const def = this.missions.get(missionId);
    if (!def) return;

    this.activeMissionIds.delete(missionId);
    this.storyState.activeMissions = this.storyState.activeMissions.filter((id) => id !== missionId);

    this.completedMissionIds.add(missionId);
    if (!this.storyState.completedMissions.includes(missionId)) {
      this.storyState.completedMissions.push(missionId);
    }

    if (def.rewards && def.rewards.length > 0) {
      this.applyEffects(def.rewards);
    }

    this.bus.emit('mission/completed', { missionId });

    this.advanceChapterForMission(missionId);
    this.unlockNextMissions(def);
  }

  private checkFailConditions(day: number): void {
    for (const missionId of Array.from(this.activeMissionIds)) {
      const def = this.missions.get(missionId);
      if (!def || !def.failConditions || def.failConditions.length === 0) continue;

      // E.g., if mission must be completed by day X
      for (const fc of def.failConditions) {
        if (fc.type === 'earnNet' && fc.byDay && day > fc.byDay) {
          const objMap = this.objectiveStates.get(missionId);
          const allRequiredDone = def.objectives.every((o) => {
            if (o.optional) return true;
            const st = objMap?.get(o.id);
            return Boolean(st?.completed);
          });
          if (!allRequiredDone) {
            this.failMission(missionId, def.onFail);
            break;
          }
        }
      }
    }
  }

  private failMission(missionId: string, onFail?: Effect[]): void {
    this.activeMissionIds.delete(missionId);
    this.storyState.activeMissions = this.storyState.activeMissions.filter((id) => id !== missionId);

    // Record as completed/resolved in story state so progression doesn't permanently stall
    this.completedMissionIds.add(missionId);
    if (!this.storyState.completedMissions.includes(missionId)) {
      this.storyState.completedMissions.push(missionId);
    }

    if (onFail && onFail.length > 0) {
      this.applyEffects(onFail);
    }

    this.advanceChapterForMission(missionId);
    const def = this.missions.get(missionId);
    if (def) {
      this.unlockNextMissions(def);
    }
  }

  private applyEffects(effects: Effect[]): void {
    if (this.getEffectContext) {
      const ctx = this.getEffectContext();
      for (const eff of effects) {
        applyEffect(eff, ctx);
      }
    } else {
      for (const eff of effects) {
        if (eff.type === 'flag') {
          this.storyState.branchFlags[eff.key] = eff.value;
          this.bus.emit('story/flag', { key: eff.key, value: eff.value });
        } else if (eff.type === 'relationship') {
          const characterId = canonicalCharacterId(eff.characterId);
          this.bus.emit('reputation/changed', {
            delta: { relationship: { characterId, delta: eff.delta } },
          });
        } else if (eff.type === 'localTrust') {
          this.bus.emit('reputation/changed', {
            delta: { localTrust: eff.delta },
          });
        } else if (eff.type === 'meter') {
          this.reputationSystem?.applyMeter(
            eff.meter,
            eff.delta,
            eff.reasonKey,
            eff.subjectId
          );
        }
      }
    }
  }

  checkEnding(endingId: string): boolean {
    const ending = this.endings.get(endingId);
    if (!ending) return false;

    // Check conditions or flag eligibility
    this.bus.emit('ending/reached', { endingId: endingId as EndingId });
    return true;
  }

  getActiveMissions(): MissionDef[] {
    return Array.from(this.activeMissionIds)
      .map((id) => this.missions.get(id))
      .filter((m): m is MissionDef => m !== undefined);
  }

  getCompletedMissions(): string[] {
    return Array.from(this.completedMissionIds);
  }


  getUnlockedDistricts(chapter?: number): DistrictId[] {
    const ch = chapter ?? this.storyState.currentChapter;
    if (ch <= 1) {
      return ['mirpara'];
    }
    if (ch === 2) {
      return ['mirpara', 'fulgate', 'motinagar'];
    }
    if (ch === 3) {
      return ['mirpara', 'fulgate', 'motinagar', 'dhanbagh'];
    }
    if (ch === 4) {
      return ['mirpara', 'fulgate', 'motinagar', 'dhanbagh', 'puranpara'];
    }
    if (ch === 5) {
      return ['mirpara', 'fulgate', 'motinagar', 'dhanbagh', 'puranpara', 'gulbari', 'mohakhal'];
    }
    return [
      'mirpara',
      'fulgate',
      'motinagar',
      'dhanbagh',
      'puranpara',
      'gulbari',
      'mohakhal',
      'testloop',
    ];
  }

  getObjectiveStates(missionId: string): ObjectiveState[] {
    const objMap = this.objectiveStates.get(missionId);
    if (!objMap) return [];
    return Array.from(objMap.values());
  }

  isMissionActive(id: string): boolean {
    return this.activeMissionIds.has(id);
  }

  isMissionCompleted(id: string): boolean {
    return this.completedMissionIds.has(id);
  }

  /** Allocation-free lookup for the first incomplete `rideWith` characterId on active missions. */
  getFirstPendingRideWithCharacterId(): string | null {
    for (const missionId of this.activeMissionIds) {
      const def = this.missions.get(missionId);
      const objMap = this.objectiveStates.get(missionId);
      if (!def || !objMap) continue;
      for (const obj of def.objectives) {
        if (obj.type !== 'rideWith') continue;
        const state = objMap.get(obj.id);
        if (state && !state.completed) {
          return obj.characterId;
        }
      }
    }
    return null;
  }

  /** Returns characterIds required by incomplete `rideWith` objectives on active missions. */
  getPendingRideWithCharacterIds(): string[] {
    const result: string[] = [];
    for (const missionId of this.activeMissionIds) {
      const def = this.missions.get(missionId);
      const objMap = this.objectiveStates.get(missionId);
      if (!def || !objMap) continue;
      for (const obj of def.objectives) {
        if (obj.type !== 'rideWith') continue;
        const state = objMap.get(obj.id);
        if (state && !state.completed && !result.includes(obj.characterId)) {
          result.push(obj.characterId);
        }
      }
    }
    return result;
  }

  getVisitedDistricts(): string[] {
    return Array.from(this.visitedDistricts);
  }

  snapshot(): MissionManagerSnapshot {
    const objectiveStates: Record<string, ObjectiveState[]> = {};
    for (const [missionId, objMap] of this.objectiveStates) {
      objectiveStates[missionId] = Array.from(objMap.values()).map((s) => ({ ...s }));
    }
    return {
      visitedDistricts: Array.from(this.visitedDistricts),
      objectiveStates,
    };
  }

  applySnapshot(snap?: MissionManagerSnapshot): void {
    this.visitedDistricts.clear();
    if (!snap) return;
    for (const d of snap.visitedDistricts ?? []) {
      this.visitedDistricts.add(d);
    }
    if (snap.objectiveStates) {
      for (const [missionId, states] of Object.entries(snap.objectiveStates)) {
        const objMap = this.objectiveStates.get(missionId);
        if (!objMap) continue;
        for (const st of states) {
          if (objMap.has(st.id)) {
            objMap.set(st.id, { ...st });
          }
        }
      }
    }
  }

  /** Resets manager tracking on a fresh career so completed triggerOnly missions can unlock again on new careers. */
  resetCareer(): void {
    this.activeMissionIds.clear();
    this.completedMissionIds.clear();
    this.objectiveStates.clear();
    this.visitedDistricts.clear();
    this.currentDay = 1;
    this.inRide = false;
    this.currentTripCrashed = false;
  }

  /** Re-synchronizes active/completed sets from `storyState` after snapshot restore. */
  syncFromStoryState(): void {
    this.activeMissionIds.clear();
    this.completedMissionIds.clear();
    this.objectiveStates.clear();
    this.visitedDistricts.clear();
    this.inRide = false;
    this.currentTripCrashed = false;
    for (const id of this.storyState.completedMissions ?? []) {
      this.completedMissionIds.add(id);
    }
    for (const id of this.storyState.activeMissions ?? []) {
      this.activateMission(id);
    }
  }

  /** Builds structured HUD summaries for the primary main mission and any active side missions. */
  getHudMissions(
    getNearestTarget?: (poiId: string) => { nameKey: string; distanceM: number } | null
  ): { main: HudMissionEntry | null; side: HudMissionEntry[] } {
    let main: HudMissionEntry | null = null;
    const side: HudMissionEntry[] = [];

    for (const missionId of this.activeMissionIds) {
      const def = this.missions.get(missionId);
      const states = this.objectiveStates.get(missionId);
      if (!def || def.objectives.length === 0) continue;

      const nextObj =
        def.objectives.find((o) => !states?.get(o.id)?.completed) ?? def.objectives[0]!;
      const st = states?.get(nextObj.id);
      const reachTarget =
        nextObj.type === 'reach' && getNearestTarget ? getNearestTarget(nextObj.poiId) : null;
      const isSide = Boolean(def.triggerOnly || def.id.startsWith('side_'));

      const entry: HudMissionEntry = {
        id: def.id,
        titleKey: def.titleKey,
        objectiveDescKey: nextObj.descKey,
        progress: st?.progress ?? 0,
        target: st?.target ?? 1,
        targetNameKey: reachTarget?.nameKey,
        targetDistM: reachTarget?.distanceM,
        isSide,
      };

      if (isSide) {
        side.push(entry);
      } else if (!main) {
        main = entry;
      }
    }

    return { main, side };
  }
}

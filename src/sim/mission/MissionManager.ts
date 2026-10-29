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
} from './objectives';
import type { StoryState, EndingId } from '../../core/types';
import type { EffectContext } from '../events/effects';
import { applyEffect } from '../events/effects';

export interface MissionManagerOptions {
  bus: EventBus<GameEvents>;
  missions: MissionDef[];
  endings?: EndingDef[];
  storyState: StoryState;
  getEffectContext?: () => EffectContext;
}

export class MissionManager {
  readonly bus: EventBus<GameEvents>;
  readonly missions: Map<string, MissionDef> = new Map();
  readonly endings: Map<string, EndingDef> = new Map();
  readonly storyState: StoryState;
  private readonly getEffectContext?: () => EffectContext;

  private activeMissionIds: Set<string> = new Set();
  private completedMissionIds: Set<string> = new Set();
  private objectiveStates: Map<string, Map<string, ObjectiveState>> = new Map();
  private visitedDistricts: Set<string> = new Set();

  constructor(opts: MissionManagerOptions) {
    this.bus = opts.bus;
    this.storyState = opts.storyState;
    this.getEffectContext = opts.getEffectContext;

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

  private setupListeners(): void {
    this.bus.on('day/started', ({ day }) => {
      this.refreshAvailableMissions(this.storyState.currentChapter, day);
    });

    this.bus.on('day/ended', ({ day }) => {
      this.checkFailConditions(day);
      if (day >= 6) {
        this.checkEnding('ending_v1_first_week');
      }
    });

    this.bus.on('ride/completed', ({ receipt }) => {
      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateRideCompleted(obj, state, {
            receipt,
            minute: 0,
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

    this.bus.on('encounter/resolved', ({ instanceId, choiceId }) => {
      for (const missionId of this.activeMissionIds) {
        const def = this.missions.get(missionId);
        const objMap = this.objectiveStates.get(missionId);
        if (!def || !objMap) continue;

        for (const obj of def.objectives) {
          const state = objMap.get(obj.id);
          if (!state) continue;

          const changed = evaluateEncounterResolved(obj, state, {
            encounterId: instanceId,
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
        const { characterId, delta: relDelta } = delta.relationship;
        const current = (this.storyState.characterRelationships[characterId] ?? 0) + relDelta;
        this.storyState.characterRelationships[characterId] = current;

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
      if (this.completedMissionIds.has(id) || this.activeMissionIds.has(id)) {
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

  activateMission(id: string): boolean {
    const def = this.missions.get(id);
    if (!def) return false;

    this.activeMissionIds.add(id);
    if (!this.storyState.activeMissions.includes(id)) {
      this.storyState.activeMissions.push(id);
    }

    const objMap = new Map<string, ObjectiveState>();
    for (const obj of def.objectives) {
      objMap.set(obj.id, createObjectiveState(obj));
    }
    this.objectiveStates.set(id, objMap);

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

    for (const nextId of def.unlocks) {
      this.activateMission(nextId);
    }
  }

  private checkFailConditions(day: number): void {
    for (const missionId of Array.from(this.activeMissionIds)) {
      const def = this.missions.get(missionId);
      if (!def || !def.failConditions || def.failConditions.length === 0) continue;

      // E.g., if mission must be completed by day X
      for (const fc of def.failConditions) {
        if (fc.type === 'earnNet' && fc.byDay && day > fc.byDay) {
          const objMap = this.objectiveStates.get(missionId);
          const earnObj = def.objectives.find((o) => o.type === 'earnNet');
          const state = earnObj && objMap ? objMap.get(earnObj.id) : null;
          if (!state || !state.completed) {
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
          const current = (this.storyState.characterRelationships[eff.characterId] ?? 0) + eff.delta;
          this.storyState.characterRelationships[eff.characterId] = current;
          this.bus.emit('reputation/changed', {
            delta: { relationship: { characterId: eff.characterId, delta: eff.delta } },
          });
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
}

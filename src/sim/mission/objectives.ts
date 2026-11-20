import type { MissionObjective } from '../schemas';
import type { TripReceipt, WeatherKind } from '../../core/types';

export interface ObjectiveState {
  id: string;
  progress: number;
  target: number;
  completed: boolean;
  rawProgress?: number;
}

export function createObjectiveState(objective: MissionObjective): ObjectiveState {
  let target: number;
  switch (objective.type) {
    case 'earnNet':
      target = objective.amount;
      break;
    case 'payExpense':
      target = objective.amount ?? 1;
      break;
    case 'completeRides':
      target = objective.count;
      break;
    case 'relationship':
      target = objective.min;
      break;
    default:
      target = 1;
  }

  return {
    id: objective.id,
    progress: 0,
    target,
    completed: false,
  };
}

export function evaluateRideCompleted(
  objective: MissionObjective,
  state: ObjectiveState,
  payload: {
    receipt: TripReceipt;
    passengerCharacterId?: string;
    district?: string;
    pickupDistrict?: string;
    destinationDistrict?: string;
    zoneTags?: string[];
    weather?: WeatherKind;
    minute: number;
    crashed?: boolean;
    visitedDistricts?: Set<string>;
  }
): boolean {
  if (state.completed) return false;

  let changed = false;

  if (objective.type === 'completeRides') {
    let match = true;
    if (objective.district) {
      const matchesDistrict =
        payload.district === objective.district ||
        payload.destinationDistrict === objective.district ||
        payload.pickupDistrict === objective.district;
      if (!matchesDistrict) {
        match = false;
      }
    }
    if (objective.zoneTag && !payload.zoneTags?.includes(objective.zoneTag)) {
      match = false;
    }
    if (objective.weather && payload.weather !== objective.weather) {
      match = false;
    }
    if (objective.beforeMinute !== undefined && payload.minute > objective.beforeMinute) {
      match = false;
    }
    if (objective.noCrash && payload.crashed) {
      match = false;
    }

    if (match) {
      const prevProgress = state.progress;
      state.progress = Math.min(state.target, state.progress + 1);
      const districtsOk =
        !objective.distinctDistricts ||
        (payload.visitedDistricts?.size ?? 0) >= objective.distinctDistricts;
      if (state.progress >= state.target && districtsOk) {
        state.completed = true;
        changed = true;
      } else if (state.progress !== prevProgress) {
        changed = true;
      }
    }
  } else if (objective.type === 'rideWith') {
    if (payload.passengerCharacterId === objective.characterId) {
      state.progress = 1;
      state.completed = true;
      changed = true;
    }
  }

  return changed;
}

export function evaluateTransaction(
  objective: MissionObjective,
  state: ObjectiveState,
  payload: {
    kind: string;
    amount: number;
    expenseId?: string;
  }
): boolean {
  if (state.completed) return false;

  let changed = false;

  if (objective.type === 'earnNet') {
    const isTransferOrNonOperating =
      payload.kind === 'savings' ||
      payload.kind === 'debt' ||
      payload.kind === 'family' ||
      payload.kind === 'rent' ||
      payload.kind === 'event';
    if (!isTransferOrNonOperating && Number.isFinite(payload.amount) && payload.amount !== 0) {
      const prevProgress = state.progress;
      const nextRaw = (state.rawProgress ?? state.progress) + payload.amount;
      state.rawProgress = nextRaw;
      state.progress = Math.max(0, Math.min(state.target, nextRaw));
      if (state.rawProgress >= state.target) {
        state.completed = true;
        changed = true;
      } else if (state.progress !== prevProgress) {
        changed = true;
      }
    }
  } else if (objective.type === 'payExpense') {
    const matchesTarget = payload.expenseId === objective.expenseId || payload.kind === objective.expenseId;
    if (payload.amount < 0 && matchesTarget) {
      if (objective.amount !== undefined) {
        const prevProgress = state.progress;
        state.progress = Math.min(state.target, state.progress + -payload.amount);
        if (state.progress >= state.target) {
          state.completed = true;
          changed = true;
        } else if (state.progress !== prevProgress) {
          changed = true;
        }
      } else {
        state.progress = 1;
        state.completed = true;
        changed = true;
      }
    }
  } else if (objective.type === 'buy') {
    if (payload.kind === 'upgrade' || payload.kind === 'bike') {
      state.progress = 1;
      state.completed = true;
      changed = true;
    }
  }

  return changed;
}

export function evaluateEncounterResolved(
  objective: MissionObjective,
  state: ObjectiveState,
  payload: {
    encounterId: string;
    choiceId: string;
    success?: boolean;
  }
): boolean {
  if (state.completed) return false;

  let changed = false;

  if (objective.type === 'choose') {
    if (payload.encounterId === objective.encounterId) {
      if (!objective.choiceIds || objective.choiceIds.includes(payload.choiceId)) {
        state.progress = 1;
        state.completed = true;
        changed = true;
      }
    }
  } else if (objective.type === 'survive') {
    // Refusing or cancelling is not surviving: only the listed choices count.
    const choiceOk = !objective.choiceIds || objective.choiceIds.includes(payload.choiceId);
    if (payload.encounterId === objective.encounterId && payload.success !== false && choiceOk) {
      state.progress = 1;
      state.completed = true;
      changed = true;
    }
  }

  return changed;
}

export function evaluateFlagChanged(
  objective: MissionObjective,
  state: ObjectiveState,
  key: string,
  value: boolean | number | string
): boolean {
  if (state.completed) return false;

  if (objective.type === 'flag' && objective.key === key && objective.value === value) {
    state.progress = 1;
    state.completed = true;
    return true;
  }

  return false;
}

export function evaluateRelationshipChanged(
  objective: MissionObjective,
  state: ObjectiveState,
  characterId: string,
  relationshipLevel: number
): boolean {
  if (state.completed) return false;

  if (objective.type === 'relationship' && objective.characterId === characterId) {
    state.progress = relationshipLevel;
    if (relationshipLevel >= objective.min) {
      state.completed = true;
      return true;
    }
  }

  return false;
}

export function evaluateReachPoi(
  objective: MissionObjective,
  state: ObjectiveState,
  nearbyPoiIds: Set<string>
): boolean {
  if (state.completed || objective.type !== 'reach') return false;
  if (nearbyPoiIds.has(objective.poiId)) {
    state.progress = 1;
    state.completed = true;
    return true;
  }
  return false;
}

import type { MissionObjective } from '../schemas';
import type { TripReceipt, WeatherKind } from '../../core/types';

export interface ObjectiveState {
  id: string;
  progress: number;
  target: number;
  completed: boolean;
}

export function createObjectiveState(objective: MissionObjective): ObjectiveState {
  let target: number;
  switch (objective.type) {
    case 'earnNet':
      target = objective.amount;
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
    if (objective.district && payload.district !== objective.district) {
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
      if (objective.distinctDistricts && payload.visitedDistricts) {
        state.progress = payload.visitedDistricts.size;
        if (state.progress >= objective.distinctDistricts) {
          state.completed = true;
          changed = true;
        }
      } else {
        state.progress = Math.min(state.target, state.progress + 1);
        if (state.progress >= state.target) {
          state.completed = true;
        }
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
    if (payload.amount > 0) {
      state.progress = Math.min(state.target, state.progress + payload.amount);
      if (state.progress >= state.target) {
        state.completed = true;
      }
      changed = true;
    }
  } else if (objective.type === 'payExpense') {
    if (payload.expenseId === objective.expenseId || payload.kind === objective.expenseId) {
      state.progress = 1;
      state.completed = true;
      changed = true;
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
    if (payload.encounterId === objective.encounterId && payload.success !== false) {
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

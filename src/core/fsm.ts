export interface Fsm<S extends string, E extends string> {
  readonly state: S;
  send(event: E): S;
  can(event: E): boolean;
}

function isProduction(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  const meta = import.meta as unknown as { env?: { PROD?: boolean } };
  return Boolean(meta?.env?.PROD);
}

export function createFsm<S extends string, E extends string>(
  table: Record<S, Partial<Record<E, S>>>,
  initial: S
): Fsm<S, E> {
  let currentState: S = initial;

  return {
    get state() {
      return currentState;
    },
    can(event: E): boolean {
      const stateTransitions = table[currentState];
      return stateTransitions ? stateTransitions[event] !== undefined : false;
    },
    send(event: E): S {
      const stateTransitions = table[currentState];
      const nextState = stateTransitions?.[event];
      if (nextState === undefined) {
        if (isProduction()) {
          return currentState;
        }
        throw new Error(
          `Illegal FSM transition: cannot handle event '${event}' in state '${currentState}'`
        );
      }
      currentState = nextState;
      return currentState;
    },
  };
}

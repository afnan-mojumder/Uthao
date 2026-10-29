export type Command =
  | { type: 'acceptRequest'; requestId: string }
  | { type: 'declineRequest'; requestId: string }
  | { type: 'counterOffer'; amount: number }
  | { type: 'acceptOffer' }
  | { type: 'proposePickupAdjust'; nodeId: string }
  | { type: 'refuseAlley' }
  | { type: 'proposeOffApp'; amount: number }
  | { type: 'cancelRide'; reason?: string }
  | { type: 'chooseEncounterOption'; instanceId: string; choiceId: string }
  | { type: 'buyFuel'; liters: number }
  | { type: 'repair'; item: string }
  | { type: 'buyUpgrade'; upgradeId: string }
  | { type: 'payExpense'; expenseId: string }
  | { type: 'chargePhone'; location?: 'home' | 'teaStall'; cost?: number }
  | { type: 'delayRent' }
  | { type: 'askAdvance'; from: 'mintu' | 'ma'; amount: number }
  | { type: 'endShift' }
  | { type: 'sleep' }
  | { type: 'setWaypoint'; nodeId: string | null }
  | { type: 'pause' }
  | { type: 'resume' };

export interface CommandResult {
  success: boolean;
  reason?: string;
  data?: unknown;
}

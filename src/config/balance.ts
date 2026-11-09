export const BALANCE = {
  FARE: {
    base: 25,
    perKm: 20,
    perMin: 1.5,
    minFare: 50,
    roundTo: 5,
    maxCounterMultiple: 5,
  },
  SURGE: {
    rush: 1.25,
    rain: 1.35,
    heavyRain: 1.5,
    lateNight: 1.2,
    cap: 1.6,
  },
  COMMISSION_APP: 0.15,
  OFF_APP: {
    commission: 0,
    policyDetectChance: 0.03,
    // ponytail: T8.6 placeholder, non-payment chance = (1 - paymentReliability) * nonPayFactor, capped.
    nonPayFactor: 1.5,
    nonPayMaxChance: 0.5,
    strikesToSuspend: 3,
    suspendDays: 2,
  },
  TRIP: {
    // Balancing placeholder: NoShow chance at pickup = (1 - paymentReliability) * this.
    noShowMaxChance: 0.3,
    // T8.4: passenger mood lost per metre they are asked to walk to a relocated pickup.
    walkMoodLossPerM: 0.002,
    maxRelocateWalkM: 300,
  },
  NAV: {
    // T8.4: more than this far from the route for this long counts as a missed turn.
    offRouteM: 25,
    offRouteSec: 2,
    noRouteNoticeSec: 8,
  },
  PHONE: {
    // T8.4: charging is a real action: you must be at the spot, and it takes game time.
    chargeRangeM: 25,
    chargeWaitMin: { home: 45, teaStall: 20 },
    lowBatteryPct: 20,
  },
  FUEL: {
    pricePerL: 130,
    tankL: 8,
    startL: 1.2,
    kmPerL: {
      old100: 40,
      used125: 45,
      new150: 42,
    },
    idleLPerGameHour: 0.3,
    engineTuneBonus: 0.15,
    // T8.3 live burn modifiers (multiplicative on the per-km burn).
    loadPerKg: 0.002, // 70 kg passenger -> +14%
    passengerKg: 70,
    roughnessMult: 0.3, // at roughness 1 (worst surface)
    throttleStressMult: 0.5, // at throttleStress 1 (hard launch from standstill)
    wornMult: 0.25, // at condition 0
    idleSpeedMs: 1.5, // below this a ride/throttle counts as idling
    // Empty tank: the bike can only be pushed.
    pushSpeedMs: 1.4,
    pushAccel: 0.8,
    stationRangeM: 40, // map metres from a fuel POI node
    lowL: 1.0, // HUD low-fuel warning
    rescueBelowL: 0.5, // rescue is only offered below this
    rescue: { liters: 1.0, cost: 100, waitMin: 20 }, // cost lands as debt when cash is short
  },
  WEAR: {
    conditionPerKm: 0.4,
    perfPenaltyBelow: 40,
    oilEveryKm: 60,
    oilCost: 350,
    // T8.3 breakdowns: warn first, only risk a stall once warned.
    warnBelow: 35,
    breakdownBelow: 25,
    breakdownPerKmAtZero: 0.4, // per virtual km at condition 0, linear up to breakdownBelow
    breakdownStallSec: 8,
    wornVmaxMult: 0.92, // below perfPenaltyBelow
  },
  PUNCTURE: {
    basePerKm: 0.004,
    poorSurfaceMult: 2,
    floodedMult: 3,
    goodTiresMult: 0.5,
    repairFamiliar: 150,
    repairUnfamiliar: 250,
  },
  LIVING: {
    foodPerDay: 150,
    phoneDataPerDay: 30,
    rentDueDays: [7, 14, 20],
    rentAmount: 4000,
    familyPaymentDay3: 1200,
    startCash: 600,
    // Total family advances allowed over a career. Advances are not repaid
    // in game, so this is the cap on the debt they can create.
    advanceCap: 2000,
  },
  NEGOTIATION: {
    k0: 0.3,
    a: 8,
    b: 1.2,
    c: 1.0,
    d: 0.6,
    e: 1.5,
    /** H: weight of interaction history (-1..1) in the acceptance logit. */
    h: 0.8,
    /** Agreed fare this far above fair counts as overcharging for the H history. */
    overchargeMargin: 0.25,
    patienceDecayPerRound: 0.25,
  },
  TRAFFIC: {
    idm: {
      a: 1.5,
      b: 2.0,
      s0: 2.0,
      T: 1.2,
      delta: 4.0,
    },
    lod: {
      near: 120,
      mid: 300,
      far: 600,
    },
    signalGreenTimeSec: 30,
    spawnMinDistM: 80,
  },
  ARCHETYPES: {
    bargainer: { budgetFactor: 0.75, openingFactor: 0.8 },
    commuter: { budgetFactor: 1.0, openingFactor: 0.95 },
    careful: { budgetFactor: 0.95, openingFactor: 0.95 },
    regular: { budgetFactor: 0.9, openingFactor: 0.9 },
    risky: { budgetFactor: 1.3, openingFactor: 1.1 },
    // ponytail: T8.6 placeholders, tuned in T11.3 against the bot harness.
    student: { budgetFactor: 0.75, openingFactor: 0.85 },
    office: { budgetFactor: 1.1, openingFactor: 0.95 },
    urgent: { budgetFactor: 1.3, openingFactor: 1.0 },
    traveler: { budgetFactor: 1.0, openingFactor: 0.9 },
    unreliable: { budgetFactor: 0.8, openingFactor: 0.9 },
    family: { budgetFactor: 1.0, openingFactor: 0.9 },
  },
  BIKE: {
    old100: {
      vmax: 22, // m/s (~79 km/h)
      accel: 2.75, // m/s^2 (0 -> 11 m/s in 4.0s)
      brakeDecelDry: 6.0, // m/s^2 (stopping distance from 11 m/s: 11^2 / (2 * 6) = 10.08m ≈ 10.1m)
      brakeDecelWet: 4.4, // m/s^2 (wet stops ~36% longer than dry; PLAYTEST band 30-40%)
      steerMaxDegAt0: 35,
      steerMaxDegAtVmax: 8,
      leanMaxDeg: 35,
      dryLateralGrip: 1.0,
      wetLateralGrip: 0.7,
      passengerAccelMult: 0.9,
      conditionPenaltyThreshold: 40,
      conditionPenaltyMult: 0.75,
    },
    used125: {
      vmax: 25, // m/s (90 km/h)
      accel: 3.3, // m/s^2 (0 -> 11 m/s in 3.3s)
      brakeDecelDry: 6.8, // m/s^2
      brakeDecelWet: 4.9, // m/s^2 (wet stops ~39% longer than dry)
      steerMaxDegAt0: 35,
      steerMaxDegAtVmax: 8,
      leanMaxDeg: 35,
      dryLateralGrip: 1.05,
      wetLateralGrip: 0.75,
      passengerAccelMult: 0.92,
      conditionPenaltyThreshold: 40,
      conditionPenaltyMult: 0.75,
    },
    new150: {
      vmax: 28, // m/s (~101 km/h)
      accel: 3.8, // m/s^2 (0 -> 11 m/s in 2.9s)
      brakeDecelDry: 7.5, // m/s^2
      brakeDecelWet: 5.5, // m/s^2
      steerMaxDegAt0: 35,
      steerMaxDegAtVmax: 8,
      leanMaxDeg: 35,
      dryLateralGrip: 1.15,
      wetLateralGrip: 0.85,
      passengerAccelMult: 0.95,
      conditionPenaltyThreshold: 40,
      conditionPenaltyMult: 0.75,
    },
  },
  UPGRADES: {
    tires: 3000,
    brakes: 2500, // -20% stopping distance
    ledLight: 1500,
    engineTune: 4000,
    luggageCarrier: 1200,
    phone: 6000,
    toolkit: 2000,
  },
  BIKES: {
    used125: 20000,
    new150: 45000,
  },
  GOALS: {
    workshopDeposit: 25000,
    betterBike: 20000,
  },
  RATING: {
    start: 5.0,
    rollingWindow: 50,
    latePenaltyPer5Min: 0.5,
    nearMissPenalty: 0.3,
    carefulNearMissMult: 2.0,
    bumpPenalty: 1.0,
    crashRating: 1.0,
    helpfulChoiceBonus: 0.3,
    lowRatingThreshold: 4.0,
    lowRatingRequestRateMult: 0.7,
    warningThreshold: 3.5,
    suspensionThreshold: 3.0,
  },
  TIP: {
    baseChance: 0.1,
    ratingSlope: 0.3,
    minAmount: 10,
    maxAmount: 40,
    /** Tip size as a share of the fare, clamped to min/max. */
    fareShare: 0.1,
  },
  DISPUTE: {
    /** Share of the fare the platform settles when the passenger disputes the ride. */
    fareKept: 0.5,
  },
  TRUST: {
    localTrustStart: 30,
    localTrustMin: 0,
    localTrustMax: 100,
    relationshipMin: -100,
    relationshipMax: 100,
  },
  BOT: {
    shiftMinutes: 600,
    reckless: {
      speedMultiplier: 1.35,
      nearMissRatePerKm: 0.25,
      crashChancePerRide: 0.05,
      repairCostMin: 350,
      repairCostMax: 500,
      crashDelayMin: 15,
    },
    tip: {
      minMoodForTip: 0.75,
      tipPercentage: 0.12,
      minTip: 10,
    },
  },
};

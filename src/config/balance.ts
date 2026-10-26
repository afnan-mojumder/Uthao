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
    strikesToSuspend: 3,
    suspendDays: 2,
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
  },
  WEAR: {
    conditionPerKm: 0.4,
    perfPenaltyBelow: 40,
    oilEveryKm: 60,
    oilCost: 350,
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
  },
  NEGOTIATION: {
    k0: 0.3,
    a: 8,
    b: 1.2,
    c: 1.0,
    d: 0.6,
    e: 1.5,
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
  },
  BIKE: {
    old100: {
      vmax: 22, // m/s (~79 km/h)
      accel: 2.75, // m/s^2 (0 -> 11 m/s in 4.0s)
      brakeDecelDry: 6.0, // m/s^2 (stopping distance from 11 m/s: 11^2 / (2 * 6) = 10.08m ≈ 10.1m)
      brakeDecelWet: 4.2, // m/s^2
      steerMaxDegAt0: 35,
      steerMaxDegAtVmax: 8,
      leanMaxDeg: 35,
      dryLateralGrip: 1.0,
      wetLateralGrip: 0.7,
      passengerAccelMult: 0.9,
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

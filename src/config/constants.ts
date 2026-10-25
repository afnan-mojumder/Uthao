export const SIM_DT = 1 / 60; // 60 Hz fixed sim step
export const MAX_SIM_STEPS_PER_FRAME = 5;
export const MAX_FRAME_DT = 0.25; // 250ms clamp to prevent huge jumps after tab pause
export const TIME_SCALE = 20; // 1 real second = 20 game seconds
export const DISTANCE_SCALE = 3; // 1 map metre = 3 virtual metres

export const PERFORMANCE_BUDGETS = {
  mobile: {
    minFps: 30,
    maxDrawCalls: 150,
    maxTriangles: 300000,
    maxHeapMb: 300,
  },
  desktop: {
    minFps: 60,
  },
};

export const LOD_RADII = {
  near: 120, // full + colliders
  mid: 300, // visual only
  far: 450, // density only
};

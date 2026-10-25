import { GameManager, runFrame } from './sim/GameManager';
import { Renderer } from './render/Renderer';
import { initDebugApi } from './debug/debugApi';
import { SIM_DT } from './config/constants';
import {
  createDefaultBikeSpec,
  createDefaultBikeState,
  stepBike,
} from './physics/bikeModel';

console.log('Uthao booting...');

const gm = new GameManager({
  seed: 42,
  mode: 'career',
  data: {},
});

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
let renderer: Renderer | undefined;

if (canvas) {
  renderer = Renderer.init(canvas, 'medium');
}

initDebugApi(gm, renderer);

// Simple default bike state for test scene
const bikeSpec = createDefaultBikeSpec();
let bikeState = createDefaultBikeState();
const env = {
  wet: false,
  surface: 1.0,
  hasPassenger: false,
  conditionPct: 100,
};

let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  runFrame(gm, dt);

  // Steer bike around test loop if moving
  bikeState = stepBike(
    bikeState,
    { throttle: 0.2, brake: 0, steer: 0 },
    bikeSpec,
    env,
    SIM_DT
  );

  if (renderer) {
    renderer.setBikeState(bikeState);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

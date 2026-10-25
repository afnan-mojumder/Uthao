import { GameManager, runFrame } from './sim/GameManager';
import { initDebugApi } from './debug/debugApi';

console.log('Uthao booting...');

const gm = new GameManager({
  seed: 42,
  mode: 'career',
  data: {},
});

initDebugApi(gm);

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
let ctx: CanvasRenderingContext2D | null = null;

if (canvas) {
  ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();
}

let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  runFrame(gm, dt);

  if (ctx && canvas) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#333';
    ctx.font = '14px monospace';
    ctx.fillText(`Clock: ${gm.clock.hhmm()} | Day: ${gm.clock.day} | Ticks: ${gm.ticks}`, 20, 70);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

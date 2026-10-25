console.log('Uthao booting...');

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();
  }
}

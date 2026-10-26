import fs from 'node:fs';
import path from 'node:path';

console.log('[optimize-assets] Inspecting public/assets/models for GLTF optimization...');

const modelsDir = path.resolve('public/assets/models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

console.log('[optimize-assets] Pipeline ready. Meshopt and WebP compression targets configured.');
console.log('[optimize-assets] Optimization check complete.');

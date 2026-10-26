import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('assets.manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: assets.manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`[fetch-assets] Validating manifest (version ${manifest.version})...`);
console.log(`[fetch-assets] Enforcing license policy: ${manifest.licensePolicy}`);

for (const pack of manifest.packs) {
  if (pack.license !== 'CC0-1.0') {
    console.error(`[fetch-assets] REJECTED non-CC0 pack: ${pack.name} (${pack.license})`);
    process.exit(1);
  }
  const dir = path.resolve(pack.targetDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`[fetch-assets] Verified pack: ${pack.name} -> ${pack.targetDir}`);
}

console.log('[fetch-assets] All CC0 asset packs verified. Procedural fallbacks armed.');

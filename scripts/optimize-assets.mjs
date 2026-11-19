import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  flatten,
  quantize,
  meshopt,
  textureCompress,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MAX_RAW_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_GZ_TOTAL_BYTES = 1_200_000; // < 1.2 MB (and < 1,200 KiB)

async function main() {
  const manifestPath = path.resolve('assets.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('[optimize-assets] Error: assets.manifest.json not found');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.licensePolicy !== 'CC0-1.0') {
    console.error(`[optimize-assets] REJECTED licensePolicy: ${manifest.licensePolicy}`);
    process.exit(1);
  }

  const modelsDir = path.resolve('public/assets/models');
  const audioDir = path.resolve('public/assets/audio');
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  const models = Array.isArray(manifest.models) ? manifest.models : [];
  const audioEntries = Array.isArray(manifest.audio) ? manifest.audio : [];
  const expectedModelPaths = new Set();
  const expectedAudioPaths = new Set();

  let totalSrcBytes = 0;
  let totalRawBytes = 0;
  let totalGzBytes = 0;

  console.log(`[optimize-assets] Optimizing ${models.length} curated CC0 GLB models...`);

  for (const entry of models) {
    if (entry.license !== 'CC0-1.0') {
      console.error(`[optimize-assets] REJECTED non-CC0 model: ${entry.id} (${entry.license})`);
      process.exit(1);
    }

    const srcPath = path.resolve('assets-src', entry.source);
    if (!fs.existsSync(srcPath)) {
      console.error(
        `[optimize-assets] Missing source GLB for '${entry.id}': ${srcPath}. Run 'node scripts/fetch-assets.mjs' first.`
      );
      process.exit(1);
    }

    const outPath = path.resolve('public', entry.url.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    expectedModelPaths.add(outPath);

    const srcBytes = fs.statSync(srcPath).size;
    totalSrcBytes += srcBytes;

    const doc = await io.read(srcPath);
    await doc.transform(
      dedup(),
      prune(),
      flatten(),
      quantize(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [512, 512],
        quality: 80,
      })
    );

    const hasMeshopt = doc
      .getRoot()
      .listExtensionsUsed()
      .some((ext) => ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
    if (!hasMeshopt) {
      console.warn(`[optimize-assets] Warning: ${entry.id} did not emit EXT_meshopt_compression`);
    }

    const glbBytes = await io.writeBinary(doc);
    fs.writeFileSync(outPath, glbBytes);

    const rawSize = glbBytes.byteLength;
    const gzSize = zlib.gzipSync(glbBytes).byteLength;
    totalRawBytes += rawSize;
    totalGzBytes += gzSize;

    console.log(
      `  - ${entry.id.padEnd(28)} ${(srcBytes / 1024).toFixed(1).padStart(6)} KB -> ${(rawSize / 1024).toFixed(1).padStart(5)} KB raw | ${(gzSize / 1024).toFixed(1).padStart(5)} KB gz`
    );
  }

  // Remove any stale GLBs in public/assets/models not referenced by the manifest
  for (const file of fs.readdirSync(modelsDir)) {
    const full = path.join(modelsDir, file);
    if (file.endsWith('.glb') && !expectedModelPaths.has(full)) {
      fs.rmSync(full, { force: true });
    }
  }

  for (const entry of audioEntries) {
    if (entry.license !== 'CC0-1.0') {
      console.error(`[optimize-assets] REJECTED non-CC0 audio: ${entry.id} (${entry.license})`);
      process.exit(1);
    }
    const srcPath = path.resolve('assets-src', entry.source);
    if (!fs.existsSync(srcPath)) {
      console.error(
        `[optimize-assets] Missing source audio for '${entry.id}': ${srcPath}. Run 'node scripts/fetch-assets.mjs' first.`
      );
      process.exit(1);
    }
    const outPath = path.resolve('public', entry.url.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    expectedAudioPaths.add(outPath);

    const buf = fs.readFileSync(srcPath);
    if (buf.subarray(0, 4).toString('ascii') !== 'OggS') {
      console.error(`[optimize-assets] Invalid Ogg header in ${srcPath}`);
      process.exit(1);
    }
    fs.writeFileSync(outPath, buf);
  }

  for (const file of fs.readdirSync(audioDir)) {
    const full = path.join(audioDir, file);
    if (file.endsWith('.ogg') && !expectedAudioPaths.has(full)) {
      fs.rmSync(full, { force: true });
    }
  }

  console.log(
    `[optimize-assets] Total models (${models.length}): ${(totalSrcBytes / 1024).toFixed(1)} KB src -> ${(totalRawBytes / 1024).toFixed(1)} KB raw | ${(totalGzBytes / 1024).toFixed(1)} KB gz`
  );

  if (totalRawBytes >= MAX_RAW_TOTAL_BYTES) {
    console.error(
      `[optimize-assets] FAILED: raw model catalog (${totalRawBytes} bytes) exceeds 2 MB budget (${MAX_RAW_TOTAL_BYTES} bytes)`
    );
    process.exit(1);
  }
  if (totalGzBytes >= MAX_GZ_TOTAL_BYTES) {
    console.error(
      `[optimize-assets] FAILED: gzipped model catalog (${totalGzBytes} bytes) exceeds 1.2 MB budget (${MAX_GZ_TOTAL_BYTES} bytes)`
    );
    process.exit(1);
  }

  console.log('[optimize-assets] Optimization complete. Size budgets satisfied.');
}

main().catch((err) => {
  console.error('[optimize-assets] Fatal error:', err);
  process.exit(1);
});

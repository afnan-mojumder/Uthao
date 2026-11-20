import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const USER_AGENT = 'Mozilla/5.0';
const FORCE = process.argv.includes('--force');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function curlText(url, extraHeaders = []) {
  const args = ['-fsSL', '-A', USER_AGENT];
  for (const h of extraHeaders) {
    args.push('-H', h);
  }
  args.push(url);
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function curlDownload(url, outPath, referer) {
  const tmpPath = `${outPath}.part`;
  try {
    const args = ['-fsSL', '-A', USER_AGENT];
    if (referer) args.push('-H', `Referer: ${referer}`);
    args.push('-o', tmpPath, url);
    execFileSync('curl', args, { stdio: 'inherit' });
    const fd = fs.openSync(tmpPath, 'r');
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
      throw new Error(`Downloaded payload is not a valid ZIP archive (magic: ${magic.toString('hex')})`);
    }
    fs.renameSync(tmpPath, outPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

function findLicenseFile(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /^license(\.txt|\.md)?$/i.test(entry.name)) {
      return full;
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findLicenseFile(path.join(dir, entry.name));
      if (nested) return nested;
    }
  }
  return null;
}

function resolveKenneyDownloadUrl(packUrl, slug) {
  const html = curlText(packUrl);
  if (/cf-turnstile|g-recaptcha|hcaptcha|verify you are human/i.test(html)) {
    throw new Error(`Anti-bot/CAPTCHA challenge encountered at ${packUrl}`);
  }
  const match = html.match(/data-download-id=['"]([0-9a-f]+)['"]/i);
  const downloadId = match ? match[1] : Buffer.from(`assets/${slug}`, 'utf8').toString('hex');
  const linkResp = curlText(`https://kenney.nl/download-link/${downloadId}`, [
    `Referer: ${packUrl}`,
  ]);
  const parsed = JSON.parse(linkResp);
  if (!parsed || typeof parsed.url !== 'string' || !parsed.url.startsWith('http')) {
    throw new Error(`Invalid download-link JSON response for ${packUrl}: ${linkResp}`);
  }
  return parsed.url;
}

function main() {
  const manifestPath = path.resolve('assets.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('[fetch-assets] Error: assets.manifest.json not found');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.licensePolicy !== 'CC0-1.0') {
    console.error(`[fetch-assets] REJECTED licensePolicy: ${manifest.licensePolicy}`);
    process.exit(1);
  }

  console.log(`[fetch-assets] Validating manifest (version ${manifest.version})...`);
  console.log(`[fetch-assets] Enforcing license policy: ${manifest.licensePolicy}`);

  const archivesDir = path.resolve('assets-src/_archives');
  fs.mkdirSync(archivesDir, { recursive: true });

  for (const pack of manifest.packs) {
    if (pack.license !== 'CC0-1.0') {
      console.error(`[fetch-assets] REJECTED non-CC0 pack: ${pack.name} (${pack.license})`);
      process.exit(1);
    }

    const slug = pack.slug || new URL(pack.url).pathname.replace(/^\/assets\//, '');
    const archivePath = path.join(archivesDir, `${slug}.zip`);
    const extractDir = path.resolve(pack.sourceDir || path.join('assets-src', slug));

    let cachedValid = false;
    if (!FORCE && fs.existsSync(archivePath)) {
      const actual = sha256File(archivePath);
      if (pack.sha256) {
        if (actual === pack.sha256) {
          cachedValid = true;
          console.log(`[fetch-assets] Cache hit (SHA-256 verified): ${slug}.zip`);
        } else {
          console.warn(`[fetch-assets] Cached ${slug}.zip SHA-256 mismatch; re-downloading...`);
        }
      } else {
        cachedValid = true;
        console.log(`[fetch-assets] Cache hit: ${slug}.zip (sha256=${actual})`);
      }
    }

    if (!cachedValid) {
      console.log(`[fetch-assets] Resolving official download URL for ${pack.name} (${pack.url})...`);
      const signedUrl = resolveKenneyDownloadUrl(pack.url, slug);
      console.log(`[fetch-assets] Downloading ${slug}.zip...`);
      curlDownload(signedUrl, archivePath, pack.url);
    }

    const finalHash = sha256File(archivePath);
    if (pack.sha256 && finalHash !== pack.sha256) {
      console.error(
        `[fetch-assets] SHA-256 verification FAILED for ${slug}.zip: expected ${pack.sha256}, got ${finalHash}`
      );
      process.exit(1);
    }
    console.log(`[fetch-assets] ${slug}.zip SHA-256: ${finalHash}`);

    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('unzip', ['-oq', archivePath, '-d', extractDir], { stdio: 'inherit' });

    const licenseFile = findLicenseFile(extractDir);
    if (!licenseFile) {
      console.error(`[fetch-assets] Missing License.txt in extracted pack ${pack.name} (${extractDir})`);
      process.exit(1);
    }
    const licenseText = fs.readFileSync(licenseFile, 'utf8');
    if (!/CC0|Creative Commons Zero/i.test(licenseText)) {
      console.error(`[fetch-assets] Non-CC0 license detected in ${licenseFile}`);
      process.exit(1);
    }
    console.log(`[fetch-assets] Verified CC0 license (${path.relative(process.cwd(), licenseFile)}) for ${pack.name}`);
  }

  console.log('[fetch-assets] All CC0 asset packs fetched and verified in assets-src/.');
  generateDhakaAudioSoundscape();
}

const SAMPLE_RATE = 22050;

function makePrng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWavBuffer(samples, sampleRate = SAMPLE_RATE) {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buf.writeInt16LE(int16, 44 + i * 2);
  }
  return buf;
}

function synthesizeEngineLoop() {
  // Seamless 1.0s 110 Hz single-cylinder 4-stroke motorcycle pulse loop
  const dur = 1.0;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const f0 = 110; // exact integer cycles in 1.0s
  const rand = makePrng(0x101);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const phase = 2 * Math.PI * f0 * t;
    const sub = Math.sin(phase * 0.5) * 0.38;
    const fund = Math.sin(phase) * 0.32;
    const h2 = Math.sin(phase * 2 + 0.3) * 0.18;
    const h3 = Math.sin(phase * 3 + 0.7) * 0.09;
    const combustionEnv = 0.65 + 0.35 * Math.max(0, Math.sin(phase * 0.5));
    const chug = (rand() * 2 - 1) * 0.06 * combustionEnv;
    const raw = (sub + fund + h2 + h3) * combustionEnv + chug;
    lp = lp * 0.78 + raw * 0.22;
    out[i] = lp * 0.85;
  }
  return out;
}

function synthesizeHornSample() {
  // 0.65s dual-tone Dhaka commuter motorcycle horn (440 Hz + 554.37 Hz with odd harmonics)
  const dur = 0.65;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const f1 = 440;
  const f2 = 554.37;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.015);
    const release = Math.min(1, (dur - t) / 0.04);
    const env = attack * release;
    const w1 = Math.sin(2 * Math.PI * f1 * t) + 0.3 * Math.sin(2 * Math.PI * f1 * 3 * t);
    const w2 = Math.sin(2 * Math.PI * f2 * t) + 0.25 * Math.sin(2 * Math.PI * f2 * 2 * t);
    out[i] = Math.tanh((w1 + w2) * 0.45) * env * 0.75;
  }
  return out;
}

function synthesizeRainLoop(heavy) {
  // Seamless 1.6s monsoon rain bed with cross-faded loop edges and droplet patters
  const dur = 1.6;
  const n = Math.floor(SAMPLE_RATE * dur);
  const raw = new Float32Array(n);
  const rand = makePrng(heavy ? 0x202 : 0x201);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.96 * b0 + white * 0.18;
    b1 = 0.82 * b1 + white * 0.28;
    b2 = 0.45 * b2 + white * 0.54;
    const pink = b0 + b1 + b2;
    const hp = white - b0 * 0.65;
    const dropProb = heavy ? 0.008 : 0.0025;
    const drop = rand() < dropProb ? (rand() * 2 - 1) * (heavy ? 0.75 : 0.45) : 0;
    raw[i] = (heavy ? pink * 0.32 + hp * 0.28 : hp * 0.24 + pink * 0.12) + drop;
  }
  // Crossfade loop seam
  const fade = Math.floor(SAMPLE_RATE * 0.08);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    raw[i] = raw[i] * a + raw[n - fade + i] * (1 - a);
  }
  return raw;
}

function synthesizeDhakaStreetLoop() {
  // Seamless 2.0s Dhaka urban murmur: distant CNG rumble, rickshaw bell ting, traffic hum
  const dur = 2.0;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const rand = makePrng(0x303);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const white = rand() * 2 - 1;
    lp = lp * 0.93 + white * 0.07;
    // Distant CNG 3-wheeler hum (68 Hz + 136 Hz)
    const cng = Math.sin(2 * Math.PI * 68 * t) * 0.14 + Math.sin(2 * Math.PI * 136 * t) * 0.07;
    // Soft distant rickshaw bell chime around t=0.55s and t=1.35s
    let bell = 0;
    for (const bt of [0.55, 1.35]) {
      const dt = t - bt;
      if (dt >= 0 && dt < 0.22) {
        bell += Math.sin(2 * Math.PI * 2480 * dt) * Math.exp(-dt * 22) * 0.08;
      }
    }
    const edge = Math.sin(Math.PI * Math.min(1, Math.min(t / 0.06, (dur - t) / 0.06)));
    out[i] = (lp * 0.55 + cng + bell) * (0.85 + 0.15 * edge) * 0.65;
  }
  return out;
}

function synthesizePhoneRing() {
  // 0.55s Uthao rider app dual-chime notification (A5 -> D6 -> F#6)
  const dur = 0.55;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const notes = [
    { start: 0.0, len: 0.16, freq: 880 },
    { start: 0.15, len: 0.18, freq: 1174.66 },
    { start: 0.31, len: 0.22, freq: 1479.98 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const note of notes) {
      const dt = t - note.start;
      if (dt >= 0 && dt < note.len) {
        const env = Math.min(1, dt / 0.008) * Math.exp(-dt * 11);
        s += (Math.sin(2 * Math.PI * note.freq * dt) + 0.25 * Math.sin(2 * Math.PI * note.freq * 2 * dt)) * env;
      }
    }
    out[i] = Math.max(-0.9, Math.min(0.9, s * 0.45));
  }
  return out;
}

function synthesizeCashChime() {
  // 0.6s Taka payout register chime (B5 -> E6 metallic bell + coin shimmer)
  const dur = 0.6;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const notes = [
    { start: 0.0, len: 0.22, freq: 987.77 },
    { start: 0.11, len: 0.48, freq: 1318.51 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const note of notes) {
      const dt = t - note.start;
      if (dt >= 0 && dt < note.len) {
        const env = Math.min(1, dt / 0.005) * Math.exp(-dt * 8.5);
        s +=
          (Math.sin(2 * Math.PI * note.freq * dt) +
            0.35 * Math.sin(2 * Math.PI * note.freq * 2.01 * dt) +
            0.15 * Math.sin(2 * Math.PI * note.freq * 3.02 * dt)) *
          env;
      }
    }
    out[i] = Math.max(-0.9, Math.min(0.9, s * 0.42));
  }
  return out;
}

function synthesizeThunder() {
  // 1.4s monsoon thunder crack + rolling low-frequency rumble
  const dur = 1.4;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const rand = makePrng(0x808);
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const white = rand() * 2 - 1;
    lp1 = lp1 * 0.92 + white * 0.08;
    lp2 = lp2 * 0.975 + lp1 * 0.025;
    const crackEnv = t < 0.12 ? Math.exp(-t * 28) * 0.7 : 0;
    const rumbleEnv =
      Math.exp(-Math.max(0, t - 0.08) * 2.6) * (0.65 + 0.35 * Math.sin(2 * Math.PI * 3.2 * t));
    const subBoom = Math.sin(2 * Math.PI * (58 - t * 18) * t) * Math.exp(-t * 3.1) * 0.45;
    out[i] = Math.tanh((white * crackEnv + lp1 * rumbleEnv * 1.6 + lp2 * 2.2 + subBoom) * 0.9) * 0.85;
  }
  return out;
}

function encodeAudioFormats(inputPath, outBaseName, audioDir) {
  const webmOut = path.join(audioDir, `${outBaseName}.webm`);
  const mp3Out = path.join(audioDir, `${outBaseName}.mp3`);
  const oggOut = path.join(audioDir, `${outBaseName}.ogg`);

  if (FORCE || !fs.existsSync(webmOut)) {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '24000',
        '-c:a',
        'libopus',
        '-b:a',
        '24k',
        '-fflags',
        '+bitexact',
        '-flags:a',
        '+bitexact',
        webmOut,
      ],
      { stdio: 'inherit' }
    );
  }

  if (FORCE || !fs.existsSync(mp3Out)) {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '22050',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '32k',
        '-fflags',
        '+bitexact',
        '-flags:a',
        '+bitexact',
        mp3Out,
      ],
      { stdio: 'inherit' }
    );
  }

  if (FORCE || !fs.existsSync(oggOut)) {
    if (inputPath.endsWith('.ogg')) {
      fs.copyFileSync(inputPath, oggOut);
    } else {
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-loglevel',
          'error',
          '-i',
          inputPath,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '22050',
          '-c:a',
          'libvorbis',
          '-q:a',
          '1',
          '-fflags',
          '+bitexact',
          '-flags:a',
          '+bitexact',
          oggOut,
        ],
        { stdio: 'inherit' }
      );
    }
  }
}

function generateDhakaAudioSoundscape() {
  const audioDir = path.resolve('public/assets/audio');
  const tmpWavDir = path.resolve('assets-src/_synth_wav');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(tmpWavDir, { recursive: true });

  console.log('[fetch-assets] Building Dhaka CC0 sample-backed audio soundscape (.webm, .mp3, .ogg)...');

  // 1. Copy/transcode Kenney CC0 source clips when present
  const kenneyClips = [
    { name: 'ui_click', src: path.resolve('assets-src/ui-audio/Audio/click1.ogg') },
    { name: 'ui_switch', src: path.resolve('assets-src/ui-audio/Audio/switch1.ogg') },
    { name: 'impact_light', src: path.resolve('assets-src/impact-sounds/Audio/impactGeneric_light_000.ogg') },
    { name: 'impact_metal', src: path.resolve('assets-src/impact-sounds/Audio/impactMetal_medium_000.ogg') },
    { name: 'impact', src: path.resolve('assets-src/impact-sounds/Audio/impactMetal_heavy_000.ogg') },
  ];

  for (const clip of kenneyClips) {
    if (fs.existsSync(clip.src)) {
      encodeAudioFormats(clip.src, clip.name, audioDir);
    }
  }

  // 2. Synthesize deterministic CC0 Dhaka soundscape clips
  const synthSpecs = [
    { name: 'engine', samples: synthesizeEngineLoop() },
    { name: 'horn', samples: synthesizeHornSample() },
    { name: 'rain_light', samples: synthesizeRainLoop(false) },
    { name: 'rain_heavy', samples: synthesizeRainLoop(true) },
    { name: 'dhaka_street', samples: synthesizeDhakaStreetLoop() },
    { name: 'phone_ring', samples: synthesizePhoneRing() },
    { name: 'cash', samples: synthesizeCashChime() },
    { name: 'thunder', samples: synthesizeThunder() },
  ];

  for (const spec of synthSpecs) {
    const wavPath = path.join(tmpWavDir, `${spec.name}.wav`);
    fs.writeFileSync(wavPath, buildWavBuffer(spec.samples));
    encodeAudioFormats(wavPath, spec.name, audioDir);
  }

  console.log('[fetch-assets] Dhaka CC0 audio soundscape ready in public/assets/audio/.');
}

main();

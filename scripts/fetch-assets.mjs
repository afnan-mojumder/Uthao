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
}

main();

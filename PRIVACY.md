# Privacy Policy — Uthao (উঠাও)

**Effective Date:** November 20, 2026

**Uthao (`উঠাও`)** is a 100% client-side, static browser simulation game. We respect your privacy and designed the game so that **zero personal data ever leaves your device**.

## 1. Zero Data Collection & Zero Tracking

- **No Analytics or Telemetry:** Uthao does not include Google Analytics, Meta Pixel, crash-reporting beacons, behavioral tracking scripts, or third-party advertising SDKs.
- **No Accounts or Servers:** Uthao does not require registration, login, email addresses, phone numbers, or cloud accounts. All simulation logic runs locally in your browser via WebGL2 and Web Audio.
- **No Third-Party Font or CDN Requests:** All fonts (`Hind Siliguri` WOFF2), 3D models, portraits, and audio samples are self-hosted within the static bundle. Your browser makes zero background requests to Google Fonts or external asset CDNs when playing.

## 2. Local Storage (`localStorage`) & Offline Caching

To let you save your 20-day career, customize controls, and play offline, Uthao stores data **exclusively on your own device**:

- **Career Saves (`uthao_save_slot_*`):** Stores your in-game day, cash, motorcycle condition, mission progress, and karma meters in your browser's `window.localStorage`.
- **Game Settings & Keybindings (`uthao_settings`, `uthao_bindings_v1`):** Stores your preferred language (`বাংলা` / `English`), graphics quality, audio volume levels, accessibility toggles, and custom keyboard/controller bindings in `window.localStorage`.
- **Service Worker Cache (Optional PWA):** Caches static game scripts, self-hosted fonts, and 3D/audio assets in the browser's Cache Storage API so the game loads quickly and works offline.

You can clear all saved data at any time by deleting save slots in the in-game **Save / Load** menu or by clearing site data in your browser settings.

## 3. Optional Device Permissions & Sharing

- **Screen Wake Lock (`navigator.wakeLock`):** While actively riding in a shift, Uthao requests a temporary Screen Wake Lock on supported mobile browsers so your screen does not dim mid-ride. The lock is automatically released when you pause or switch tabs.
- **Device Orientation (Tilt Steering):** Only used locally for steering if you explicitly enable **Tilt Steering (Mobile)** in **Game Settings**. Sensor readings are processed in-memory at 60 Hz and are never recorded or transmitted.
- **Scorecard Sharing (`ShareCard`):** When you click **Share Scorecard** at the end of a shift or campaign, the scorecard PNG image is rendered locally on an HTML5 `<canvas>`. It is only downloaded to your device, copied to your clipboard, or passed to your operating system's native Web Share sheet at your explicit command.

## 4. Contact & Source Code

Questions or privacy inquiries can be directed to the project maintainers via the repository issue tracker.

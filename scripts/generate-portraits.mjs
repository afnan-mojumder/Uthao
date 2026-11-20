import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.resolve('public/assets/portraits');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Stylized, cohesive 128x128 SVG portraits rendered to crisp WebP via sharp.
// Palette matches Uthao Dhaka night/twilight UI theme with expressive character details.

function wrapSvg(bgStart, bgEnd, accent, innerSvg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="68%">
      <stop offset="0%" stop-color="${bgStart}" />
      <stop offset="100%" stop-color="${bgEnd}" />
    </radialGradient>
    <linearGradient id="rim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.7" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#bg)" />
  <circle cx="64" cy="64" r="61" fill="none" stroke="url(#rim)" stroke-width="3" />
  ${innerSvg}
</svg>`;
}

const PORTRAIT_SVGS = {
  // 10 Named Recurring Characters
  char_ma: wrapSvg('#1e3a5f', '#0f172a', '#f59e0b', `
    <!-- Teal & Gold Saree Anchal / Headscarf drape -->
    <path d="M22 128 C22 86, 106 86, 106 128 Z" fill="#0d9488" />
    <path d="M28 128 C34 94, 94 94, 100 128 Z" fill="#115e59" />
    <path d="M32 48 C30 22, 98 22, 96 48 C102 74, 96 105, 86 128 L42 128 C32 105, 26 74, 32 48 Z" fill="#0f766e" stroke="#f59e0b" stroke-width="2.5" />
    <!-- Silver-streaked dark hair bun -->
    <ellipse cx="64" cy="36" rx="22" ry="12" fill="#334155" />
    <path d="M44 38 Q64 28 84 38" stroke="#94a3b8" stroke-width="2.5" fill="none" />
    <!-- Face -->
    <ellipse cx="64" cy="60" rx="21" ry="24" fill="#d99b66" />
    <!-- Red Bindi -->
    <circle cx="64" cy="49" r="2.6" fill="#dc2626" />
    <!-- Warm gold-rimmed reading glasses -->
    <circle cx="55" cy="58" r="6.5" fill="none" stroke="#fbbf24" stroke-width="2" />
    <circle cx="73" cy="58" r="6.5" fill="none" stroke="#fbbf24" stroke-width="2" />
    <line x1="61.5" y1="58" x2="66.5" y2="58" stroke="#fbbf24" stroke-width="2" />
    <!-- Gentle eyes & warm maternal smile -->
    <circle cx="55" cy="58" r="2" fill="#1e293b" />
    <circle cx="73" cy="58" r="2" fill="#1e293b" />
    <path d="M49 52 Q55 49 60 52" stroke="#475569" stroke-width="1.8" fill="none" />
    <path d="M68 52 Q73 49 79 52" stroke="#475569" stroke-width="1.8" fill="none" />
    <path d="M56 71 Q64 77 72 71" stroke="#7c2d12" stroke-width="2.2" fill="none" stroke-linecap="round" />
  `),

  char_mintu: wrapSvg('#3b2314', '#0f172a', '#fb923c', `
    <!-- Checked Gamcha towel on shoulder over green tee -->
    <path d="M20 128 C22 86, 106 86, 108 128 Z" fill="#16a34a" />
    <path d="M28 96 Q44 92 52 128 L26 128 Z" fill="#dc2626" />
    <path d="M30 104 L48 104 M32 114 L50 114" stroke="#fef08a" stroke-width="2" />
    <!-- Neck & Face -->
    <rect x="56" y="76" width="16" height="16" rx="6" fill="#c68642" />
    <ellipse cx="64" cy="58" rx="21" ry="24" fill="#d08b4c" />
    <!-- Tousled wavy street-smart hair -->
    <path d="M41 52 C38 28, 56 22, 68 25 C82 22, 90 34, 87 52 C83 41, 74 37, 64 38 C52 37, 45 42, 41 52 Z" fill="#1e293b" />
    <!-- Expressive brows, grin & light stubble -->
    <path d="M49 50 Q55 47 60 50" stroke="#0f172a" stroke-width="2.2" fill="none" />
    <path d="M68 50 Q73 47 79 50" stroke="#0f172a" stroke-width="2.2" fill="none" />
    <circle cx="55" cy="56" r="2.4" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.4" fill="#0f172a" />
    <path d="M54 69 Q64 78 74 69 Z" fill="#ffffff" stroke="#7c2d12" stroke-width="1.8" />
    <!-- Steaming tea cup badge motif -->
    <rect x="86" y="96" width="16" height="18" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="2" />
    <path d="M90 92 Q92 86 90 82 M96 92 Q98 86 96 82" stroke="#fde68a" stroke-width="1.8" fill="none" stroke-linecap="round" />
  `),

  char_kamal: wrapSvg('#1e293b', '#090d16', '#38bdf8', `
    <!-- Mechanic navy work overalls & grease rag -->
    <path d="M18 128 C22 86, 106 86, 110 128 Z" fill="#1d4ed8" />
    <rect x="44" y="96" width="40" height="32" rx="4" fill="#1e3a8a" stroke="#60a5fa" stroke-width="1.5" />
    <!-- Neck & Square Jaw Face -->
    <rect x="55" y="76" width="18" height="16" fill="#b8763e" />
    <rect x="43" y="36" width="42" height="46" rx="18" fill="#c47f46" />
    <!-- Mechanic cap / bandana -->
    <path d="M42 44 C42 26, 86 26, 86 44 Z" fill="#f59e0b" />
    <rect x="41" y="42" width="46" height="5" rx="2" fill="#b45309" />
    <!-- Thick mustache & beard -->
    <path d="M44 66 C44 84, 84 84, 84 66 L78 66 C74 75, 54 75, 50 66 Z" fill="#1e293b" />
    <path d="M52 67 Q64 62 76 67" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round" />
    <!-- Steady eyes -->
    <circle cx="54" cy="55" r="2.4" fill="#0f172a" />
    <circle cx="74" cy="55" r="2.4" fill="#0f172a" />
    <!-- Wrench emblem on pocket -->
    <path d="M88 104 L98 114 M96 102 A4 4 0 1 0 90 108" stroke="#93c5fd" stroke-width="2.5" fill="none" stroke-linecap="round" />
  `),

  char_nabila: wrapSvg('#1e1b4b', '#0f172a', '#a855f7', `
    <!-- University maroon/violet kurta & backpack straps -->
    <path d="M22 128 C25 88, 103 88, 106 128 Z" fill="#7e22ce" />
    <path d="M36 96 L42 128 M92 96 L86 128" stroke="#1e293b" stroke-width="6" stroke-linecap="round" />
    <path d="M48 92 Q64 106 80 92" stroke="#facc15" stroke-width="3" fill="none" />
    <!-- Long dark hair & side braid -->
    <path d="M38 48 C36 22, 92 22, 90 48 C94 72, 92 96, 84 114 L44 114 C36 96, 34 72, 38 48 Z" fill="#0f172a" />
    <!-- Face -->
    <ellipse cx="64" cy="58" rx="19" ry="22" fill="#e09f67" />
    <path d="M44 46 Q64 34 84 48 C80 32, 48 32, 44 46 Z" fill="#0f172a" />
    <!-- Smart round student glasses -->
    <circle cx="56" cy="57" r="6" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
    <circle cx="72" cy="57" r="6" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
    <line x1="62" y1="57" x2="66" y2="57" stroke="#e2e8f0" stroke-width="1.8" />
    <circle cx="56" cy="57" r="2.2" fill="#0f172a" />
    <circle cx="72" cy="57" r="2.2" fill="#0f172a" />
    <path d="M58 70 Q64 75 70 70" stroke="#9a3412" stroke-width="2" fill="none" stroke-linecap="round" />
  `),

  char_tanvir: wrapSvg('#0f2942', '#090d16', '#38bdf8', `
    <!-- Crisp corporate suit, white collar & sky tie -->
    <path d="M20 128 C22 86, 106 86, 108 128 Z" fill="#1e293b" />
    <polygon points="52,88 64,114 76,88" fill="#f8fafc" />
    <polygon points="61,94 67,94 69,124 64,128 59,124" fill="#0284c7" />
    <!-- Neck & Face -->
    <rect x="56" y="75" width="16" height="15" fill="#d2925b" />
    <ellipse cx="64" cy="57" rx="20" ry="23" fill="#dc9b64" />
    <!-- Neat side-parted corporate haircut -->
    <path d="M44 48 C42 26, 84 24, 85 46 C78 36, 56 36, 44 48 Z" fill="#0f172a" />
    <!-- Focused eyebrows & watch-checking expression -->
    <line x1="49" y1="49" x2="60" y2="51" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
    <line x1="79" y1="49" x2="68" y2="51" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M57 70 Q64 72 71 70" stroke="#7c2d12" stroke-width="2" fill="none" stroke-linecap="round" />
    <!-- Bluetooth earpiece -->
    <rect x="82" y="57" width="4" height="9" rx="2" fill="#38bdf8" />
  `),

  char_rahim: wrapSvg('#1f2937', '#0f172a', '#22c55e', `
    <!-- Traditional white Panjabi & embroidered vest -->
    <path d="M20 128 C24 86, 104 86, 108 128 Z" fill="#f1f5f9" />
    <path d="M32 94 L48 128 L24 128 Z M96 94 L80 128 L104 128 Z" fill="#15803d" />
    <line x1="64" y1="90" x2="64" y2="124" stroke="#94a3b8" stroke-width="2" />
    <!-- Face -->
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#c98850" />
    <!-- White prayer cap (Tupi) -->
    <path d="M43 44 C43 27, 85 27, 85 44 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />
    <path d="M45 41 L83 41" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3" />
    <!-- Full white/silver beard -->
    <path d="M44 62 C44 92, 84 92, 84 62 C78 74, 50 74, 44 62 Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5" />
    <!-- Wise crinkly eyes & gentle smile -->
    <path d="M49 51 Q55 48 60 51" stroke="#e2e8f0" stroke-width="2.2" fill="none" />
    <path d="M68 51 Q73 48 79 51" stroke="#e2e8f0" stroke-width="2.2" fill="none" />
    <circle cx="55" cy="56" r="2.2" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.2" fill="#0f172a" />
    <path d="M57 69 Q64 74 71 69" stroke="#64748b" stroke-width="2" fill="none" stroke-linecap="round" />
  `),

  char_ferdousi: wrapSvg('#31102f', '#0f172a', '#f472b6', `
    <!-- Rose/magenta shalwar Suit & protective shawl -->
    <path d="M20 128 C24 86, 104 86, 108 128 Z" fill="#be185d" />
    <path d="M34 88 Q64 110 94 88 L102 128 L26 128 Z" fill="#9d174d" />
    <!-- Neat hair with side clip -->
    <path d="M39 50 C37 22, 91 22, 89 50 C92 70, 88 86, 82 94 L46 94 C40 86, 36 70, 39 50 Z" fill="#1e293b" />
    <ellipse cx="64" cy="58" rx="20" ry="22" fill="#dfa068" />
    <rect x="43" y="42" width="8" height="3" rx="1.5" fill="#f472b6" transform="rotate(-20 43 42)" />
    <!-- Caring yet vigilant motherly eyes -->
    <path d="M49 51 Q55 48 60 51" stroke="#1e293b" stroke-width="2" fill="none" />
    <path d="M68 51 Q73 48 79 51" stroke="#1e293b" stroke-width="2" fill="none" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M57 70 Q64 74 71 70" stroke="#881337" stroke-width="2.2" fill="none" stroke-linecap="round" />
    <!-- Small child silhouette badge at bottom-right -->
    <circle cx="94" cy="106" r="10" fill="#e09f67" stroke="#f9a8d4" stroke-width="1.5" />
    <path d="M85 103 C85 93, 103 93, 103 103 Z" fill="#0f172a" />
    <circle cx="91" cy="106" r="1.4" fill="#0f172a" />
    <circle cx="97" cy="106" r="1.4" fill="#0f172a" />
  `),

  char_jamil: wrapSvg('#18181b', '#09090b', '#f59e0b', `
    <!-- High-collar dark leather jacket -->
    <path d="M18 128 C20 82, 108 82, 110 128 Z" fill="#18181b" stroke="#3f3f46" stroke-width="2" />
    <polygon points="38,82 54,116 42,128 28,96" fill="#27272a" />
    <polygon points="90,82 74,116 86,128 100,96" fill="#27272a" />
    <!-- Face -->
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#bf8049" />
    <!-- Slicked back night-hustler hair -->
    <path d="M43 48 C41 24, 87 24, 85 48 C79 34, 49 34, 43 48 Z" fill="#09090b" />
    <!-- Tinted aviator sunglasses -->
    <rect x="46" y="50" width="16" height="11" rx="3" fill="#09090b" stroke="#f59e0b" stroke-width="1.8" />
    <rect x="66" y="50" width="16" height="11" rx="3" fill="#09090b" stroke="#f59e0b" stroke-width="1.8" />
    <line x1="62" y1="53" x2="66" y2="53" stroke="#f59e0b" stroke-width="1.8" />
    <line x1="49" y1="53" x2="55" y2="58" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.7" />
    <line x1="69" y1="53" x2="75" y2="58" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.7" />
    <!-- Sharp goatee & smirk -->
    <path d="M57 72 L71 69" stroke="#451a03" stroke-width="2.2" stroke-linecap="round" />
    <path d="M58 76 L64 81 L70 76" stroke="#18181b" stroke-width="2.5" fill="none" />
  `),

  char_morshed: wrapSvg('#064e3b', '#0f172a', '#22c55e', `
    <!-- DMP Traffic Police teal/olive uniform shirt & reflective vest -->
    <path d="M18 128 C22 86, 106 86, 110 128 Z" fill="#0f766e" />
    <path d="M36 92 L46 128 L34 128 L26 96 Z M92 92 L82 128 L94 128 L102 96 Z" fill="#a3e635" />
    <rect x="36" y="88" width="14" height="5" rx="2" fill="#eab308" />
    <rect x="78" y="88" width="14" height="5" rx="2" fill="#eab308" />
    <!-- Face -->
    <ellipse cx="64" cy="60" rx="20" ry="22" fill="#c8844b" />
    <!-- Police Peaked Cap with badge -->
    <path d="M38 42 C40 22, 88 22, 90 42 Z" fill="#1e3a8a" />
    <path d="M36 42 Q64 49 92 42 L88 47 Q64 53 40 47 Z" fill="#0f172a" />
    <circle cx="64" cy="33" r="4" fill="#fbbf24" />
    <!-- Authoritative mustache & stern eyes -->
    <line x1="48" y1="52" x2="59" y2="53" stroke="#0f172a" stroke-width="2.5" />
    <line x1="80" y1="52" x2="69" y2="53" stroke="#0f172a" stroke-width="2.5" />
    <circle cx="54" cy="58" r="2.3" fill="#0f172a" />
    <circle cx="74" cy="58" r="2.3" fill="#0f172a" />
    <path d="M52 69 Q64 64 76 69" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round" />
  `),

  char_bablu: wrapSvg('#431407', '#0f172a', '#f97316', `
    <!-- Bright bazaar vendor kurta & woven basket rim -->
    <path d="M18 128 C22 86, 106 86, 110 128 Z" fill="#ea580c" />
    <path d="M32 92 Q64 108 96 92" stroke="#fed7aa" stroke-width="3" fill="none" stroke-dasharray="5,3" />
    <!-- Face -->
    <ellipse cx="64" cy="58" rx="21" ry="23" fill="#c57f44" />
    <!-- Headscarf / tied bazaar band -->
    <path d="M42 45 C44 26, 84 26, 86 45 Z" fill="#16a34a" />
    <path d="M41 43 Q64 48 87 43" stroke="#facc15" stroke-width="3.5" fill="none" />
    <!-- Cheerful wide smile & friendly eyes -->
    <circle cx="55" cy="56" r="2.5" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.5" fill="#0f172a" />
    <path d="M52 67 Q64 71 76 67" stroke="#1e293b" stroke-width="3" fill="none" stroke-linecap="round" />
    <path d="M55 71 Q64 79 73 71" stroke="#7c2d12" stroke-width="2.4" fill="none" stroke-linecap="round" />
  `),

  // 11 Passenger Archetypes
  bargainer: wrapSvg('#1e293b', '#0f172a', '#f59e0b', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#b45309" />
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#d28e54" />
    <path d="M44 46 C44 25, 84 25, 84 46 C76 37, 52 37, 44 46 Z" fill="#1e293b" />
    <!-- Raised bargaining eyebrow & calculating expression -->
    <path d="M48 48 Q55 44 60 49" stroke="#0f172a" stroke-width="2.4" fill="none" />
    <line x1="68" y1="51" x2="79" y2="50" stroke="#0f172a" stroke-width="2.4" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M56 70 Q64 73 72 68" stroke="#7c2d12" stroke-width="2.2" fill="none" stroke-linecap="round" />
    <circle cx="96" cy="102" r="13" fill="#f59e0b" stroke="#fef3c7" stroke-width="2" />
    <text x="96" y="107" text-anchor="middle" font-size="14" font-weight="bold" fill="#0f172a">৳</text>
  `),

  commuter: wrapSvg('#0f2942', '#0f172a', '#38bdf8', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#0369a1" />
    <polygon points="54,88 64,110 74,88" fill="#e0f2fe" />
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#d5945c" />
    <path d="M44 47 C43 25, 85 25, 84 47 C77 36, 51 36, 44 47 Z" fill="#0f172a" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M56 70 Q64 74 72 70" stroke="#7c2d12" stroke-width="2" fill="none" />
    <!-- Messenger bag strap -->
    <line x1="38" y1="90" x2="78" y2="128" stroke="#0f172a" stroke-width="6" />
  `),

  careful: wrapSvg('#064e3b', '#0f172a', '#22c55e', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#15803d" />
    <!-- Safety helmet worn by cautious passenger -->
    <path d="M38 56 C36 22, 92 22, 90 56 L86 70 L42 70 Z" fill="#22c55e" stroke="#bbf7d0" stroke-width="2" />
    <ellipse cx="64" cy="60" rx="18" ry="20" fill="#d99b66" />
    <rect x="44" y="47" width="40" height="15" rx="5" fill="#38bdf8" fill-opacity="0.3" stroke="#e2e8f0" stroke-width="1.5" />
    <circle cx="56" cy="56" r="2.2" fill="#0f172a" />
    <circle cx="72" cy="56" r="2.2" fill="#0f172a" />
    <path d="M57 69 Q64 73 71 69" stroke="#7c2d12" stroke-width="2" fill="none" />
  `),

  regular: wrapSvg('#1e3a5f', '#0f172a', '#38bdf8', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#2563eb" />
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#cf8d55" />
    <path d="M44 47 C43 26, 85 26, 84 47 C76 37, 52 37, 44 47 Z" fill="#1e293b" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M54 68 Q64 76 74 68" stroke="#7c2d12" stroke-width="2.3" fill="none" stroke-linecap="round" />
  `),

  risky: wrapSvg('#3f1d24', '#090d16', '#ef4444', `
    <path d="M20 128 C22 84, 106 84, 108 128 Z" fill="#1f2937" />
    <!-- Hoodie silhouette & dark visor shades -->
    <path d="M34 58 C32 20, 96 20, 94 58 C96 82, 88 96, 82 104 L46 104 C40 96, 32 82, 34 58 Z" fill="#111827" stroke="#ef4444" stroke-width="1.8" />
    <ellipse cx="64" cy="60" rx="18" ry="21" fill="#c28149" />
    <rect x="47" y="51" width="34" height="10" rx="3" fill="#09090b" stroke="#ef4444" stroke-width="1.6" />
    <line x1="57" y1="71" x2="71" y2="69" stroke="#451a03" stroke-width="2.2" stroke-linecap="round" />
  `),

  student: wrapSvg('#2e1065', '#0f172a', '#a855f7', `
    <path d="M22 128 C25 88, 103 88, 106 128 Z" fill="#6d28d9" />
    <path d="M36 94 L42 128 M92 94 L86 128" stroke="#0f172a" stroke-width="6" />
    <ellipse cx="64" cy="58" rx="19" ry="22" fill="#dca069" />
    <path d="M44 48 C42 24, 86 24, 84 48 C76 36, 52 36, 44 48 Z" fill="#0f172a" />
    <circle cx="56" cy="56" r="5.5" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
    <circle cx="72" cy="56" r="5.5" fill="none" stroke="#e2e8f0" stroke-width="1.8" />
    <line x1="61.5" y1="56" x2="66.5" y2="56" stroke="#e2e8f0" stroke-width="1.8" />
    <circle cx="56" cy="56" r="2.1" fill="#0f172a" />
    <circle cx="72" cy="56" r="2.1" fill="#0f172a" />
    <path d="M57 69 Q64 75 71 69" stroke="#7c2d12" stroke-width="2" fill="none" />
  `),

  office: wrapSvg('#172554', '#0f172a', '#60a5fa', `
    <path d="M20 128 C24 86, 104 86, 108 128 Z" fill="#1e3a8a" />
    <polygon points="52,88 64,114 76,88" fill="#ffffff" />
    <polygon points="61,94 67,94 68,124 64,128 60,124" fill="#dc2626" />
    <ellipse cx="64" cy="57" rx="20" ry="23" fill="#d6955d" />
    <path d="M44 47 C43 25, 85 25, 84 47 C77 36, 51 36, 44 47 Z" fill="#1e293b" />
    <circle cx="55" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.3" fill="#0f172a" />
    <path d="M57 70 L71 70" stroke="#7c2d12" stroke-width="2.2" stroke-linecap="round" />
  `),

  urgent: wrapSvg('#450a0a', '#0f172a', '#ef4444', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#dc2626" />
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#d99962" />
    <path d="M44 46 C42 24, 86 24, 84 46 C76 36, 52 36, 44 46 Z" fill="#0f172a" />
    <!-- Urgent wide eyes & sweat drop -->
    <circle cx="55" cy="56" r="2.8" fill="#0f172a" />
    <circle cx="73" cy="56" r="2.8" fill="#0f172a" />
    <path d="M80 46 Q84 53 80 56 Q76 53 80 46 Z" fill="#38bdf8" />
    <ellipse cx="64" cy="71" rx="5" ry="3.5" fill="#7f1d1d" />
  `),

  traveler: wrapSvg('#14532d', '#0f172a', '#4ade80', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#15803d" />
    <!-- Traveler sun hat / cap & shoulder strap -->
    <ellipse cx="64" cy="40" rx="30" ry="7" fill="#d97706" />
    <path d="M44 40 C44 23, 84 23, 84 40 Z" fill="#f59e0b" />
    <ellipse cx="64" cy="59" rx="19" ry="21" fill="#d4935b" />
    <circle cx="56" cy="57" r="2.3" fill="#0f172a" />
    <circle cx="72" cy="57" r="2.3" fill="#0f172a" />
    <path d="M57 70 Q64 74 71 70" stroke="#7c2d12" stroke-width="2" fill="none" />
  `),

  unreliable: wrapSvg('#3b0764', '#0f172a', '#eab308', `
    <path d="M22 128 C25 86, 103 86, 106 128 Z" fill="#4c1d95" />
    <ellipse cx="64" cy="58" rx="20" ry="23" fill="#cfa06c" />
    <!-- Messy asymmetric hair & sideways glance -->
    <path d="M40 48 C38 22, 88 26, 86 48 C78 35, 50 40, 40 48 Z" fill="#1e293b" />
    <circle cx="58" cy="56" r="2.3" fill="#0f172a" />
    <circle cx="76" cy="56" r="2.3" fill="#0f172a" />
    <path d="M56 71 Q64 68 72 72" stroke="#7c2d12" stroke-width="2.2" fill="none" stroke-linecap="round" />
  `),

  family: wrapSvg('#134e4a', '#0f172a', '#2dd4bf', `
    <!-- Parent + child duo silhouette -->
    <path d="M16 128 C20 86, 88 86, 92 128 Z" fill="#0d9488" />
    <ellipse cx="54" cy="56" rx="18" ry="21" fill="#d6955d" />
    <path d="M36 46 C36 25, 72 25, 72 46 C65 36, 43 36, 36 46 Z" fill="#0f172a" />
    <circle cx="48" cy="55" r="2.1" fill="#0f172a" />
    <circle cx="62" cy="55" r="2.1" fill="#0f172a" />
    <path d="M49 67 Q55 72 61 67" stroke="#7c2d12" stroke-width="2" fill="none" />
    <!-- Child alongside -->
    <path d="M68 128 C70 100, 110 100, 112 128 Z" fill="#f59e0b" />
    <circle cx="90" cy="78" r="13" fill="#e0a36e" />
    <path d="M77 74 C77 60, 103 60, 103 74 Z" fill="#0f172a" />
    <circle cx="86" cy="78" r="1.8" fill="#0f172a" />
    <circle cx="94" cy="78" r="1.8" fill="#0f172a" />
    <path d="M86 84 Q90 88 94 84" stroke="#7c2d12" stroke-width="1.8" fill="none" />
  `),
};

async function main() {
  for (const [id, svg] of Object.entries(PORTRAIT_SVGS)) {
    const outPath = path.join(OUT_DIR, `${id}.webp`);
    await sharp(Buffer.from(svg))
      .resize(128, 128)
      .webp({ quality: 90 })
      .toFile(outPath);
  }
  console.log(`Generated ${Object.keys(PORTRAIT_SVGS).length} WebP portraits in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

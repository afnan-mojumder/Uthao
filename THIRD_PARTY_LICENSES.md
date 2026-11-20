# Third-Party Licenses & Attributions

Uthao (`উঠাও`) builds upon open-source software, open fonts, and public-domain (CC0 1.0) creative assets. All third-party components and their licenses are listed below.

---

## 1. Runtime Software Libraries

### Three.js (`three` v0.186.1)
- **Author:** Mr.doob and Three.js Contributors
- **License:** MIT License
- **Source:** https://github.com/mrdoob/three.js

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

### Preact (`preact` v11.0.2) & `@preact/signals` (v2.11.3)
- **Author:** Jason Miller and Preact Contributors
- **License:** MIT License
- **Source:** https://github.com/preactjs/preact / https://github.com/preactjs/signals

```text
The MIT License (MIT)

Copyright (c) 2015-present Jason Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

### Zod (`zod` v4.6.7)
- **Author:** Colin McDonnell
- **License:** MIT License
- **Source:** https://github.com/colinhacks/zod

```text
MIT License

Copyright (c) 2020 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## 2. Typography (`public/fonts/hind-siliguri-*.woff2`)

### Hind Siliguri (`400`, `500`, `600`, `700`)
- **Foundry / Designer:** Indian Type Foundry (ITF) — Jyotish Sonowal & Manishasha
- **License:** SIL Open Font License, Version 1.1 (`OFL-1.1`)
- **Source:** https://github.com/itfoundry/hind-siliguri

```text
Copyright 2015 Indian Type Foundry (info@indiantypefoundry.com)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is available with a FAQ at: https://openfontlicense.org

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the conditions of the SIL Open Font License 1.1.
```

---

## 3. 3D Models & Audio Samples (`public/assets/models/`, `public/assets/audio/`)

### Kenney Asset Packs (CC0 1.0 Universal)
- **Creator:** Kenney (Kenney Vleugels — https://kenney.nl)
- **License:** Creative Commons Zero v1.0 Universal (`CC0-1.0` — Public Domain Dedication)
- **Packs Used (verified via `assets.manifest.json` & `scripts/fetch-assets.mjs`):**
  1. **Kenney City Kit (Commercial)** — https://kenney.nl/assets/city-kit-commercial (`building_commercial_*`)
  2. **Kenney City Kit (Suburban)** — https://kenney.nl/assets/city-kit-suburban (`building_residential_*`, `prop_tree_*`)
  3. **Kenney City Kit (Roads)** — https://kenney.nl/assets/city-kit-roads (`prop_streetlight*`, `prop_traffic_light`, `prop_utility_pole`, `prop_barrier`, `prop_cone`, `prop_sign_highway`, `prop_dumpster`)
  4. **Kenney Car Kit** — https://kenney.nl/assets/car-kit (`vehicle_sedan`, `vehicle_hatchback`, `vehicle_taxi`, `vehicle_suv`, `vehicle_van`, `vehicle_delivery`, `vehicle_truck`)
  5. **Kenney UI Audio** — https://kenney.nl/assets/ui-audio (`ui_click`, `ui_switch`)
  6. **Kenney Impact Sounds** — https://kenney.nl/assets/impact-sounds (`impact_light`, `impact_metal`, `impact`)

### First-Party Procedural Dhaka 3D Geometry & Synthesized Soundscape
- **Dhaka Procedural 3D Models (`src/render/vehicles.ts`, `src/render/dhakaProps.ts`):** Custom procedural Three.js geometry for Dhaka motorcycles (`Runner Dayang 100cc`, `Bajaj Discover 125cc`, `Yamaha FZS 150cc`), green CNG auto-rickshaws, colorful cycle rickshaws, Dhaka city buses, tea stalls (`টং দোকান`), fuel canopies, garage shutters, footbridges, rooftop water tanks, overhead utility cables, and Bangla shop signboards. Licensed under the root `MIT License`.
- **Dhaka Synthesized Soundscape (`scripts/fetch-assets.mjs`, `src/audio/AudioManager.ts`):** Deterministically synthesized CC0-1.0 / MIT audio loops and chimes (`engine`, `horn`, `rain_light`, `rain_heavy`, `dhaka_street`, `phone_ring`, `cash`, `thunder`) plus real-time Web Audio DSP synthesis.

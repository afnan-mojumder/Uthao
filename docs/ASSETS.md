# Asset Registry & Pipeline

## 1. CC0 External Packs (Manifest-Driven)
All external downloaded models and sounds strictly adhere to **CC0-1.0 (Public Domain)** licensing.

| Asset Pack | Source / Author | Licence | Usage |
|---|---|---|---|
| **City Kit (Roads)** | Kenney (kenney.nl) | CC0-1.0 | Road junctions, asphalt textures, street boundaries |
| **City Kit (Commercial)** | Kenney (kenney.nl) | CC0-1.0 | Commercial storefronts, brick low-poly buildings |
| **City Kit (Suburban)** | Kenney (kenney.nl) | CC0-1.0 | Residential alleys, residential boundary walls |
| **Car Kit** | Kenney (kenney.nl) | CC0-1.0 | Ambient sedan and hatchback traffic |
| **UI Audio** | Kenney (kenney.nl) | CC0-1.0 | Button clicks, phone tap sounds, menu transitions |
| **Impact Sounds** | Kenney (kenney.nl) | CC0-1.0 | Bump and collision audio |
| **OpenGameArt Ambience** | OpenGameArt CC0 | CC0-1.0 | Dhaka street buzz, monsoon rain loop, horns |

---

## 2. Bangladesh-Specific Procedural Models
To preserve authentic Dhaka street ambience and guarantee zero-dependency crash immunity, the following models are built procedurally in `src/render/vehicles.ts` and `src/render/props.ts`:

- **Motorcycle (`MotorcycleMesh`)**: Player's bike, pillion passenger attachment, fork steering and lean kinematics.
- **CNG Auto-Rickshaw (`createCNGMesh`)**: Dhaka green 3-wheeler with yellow skirt, front slope, wireframe iron safety cages.
- **Cycle Rickshaw (`createRickshawMesh`)**: Manual 3-wheeler tricycle with rear carriage, bright canvas hood canopy, and folk rickshaw art backplate.
- **Local Bus (`createBusMesh`)**: 8m commuter bus with colourful Dhaka route stripes, roof luggage rack, and destination banner board.
- **Tea Stall / Tong Dokan (`createTeaStallMesh`)**: Corrugated iron roof, bamboo posts, wooden counter, aluminum kettle, and roadside bench.
- **Fuel Station Canopy (`createFuelCanopyMesh`)**: Green overhead canopy with support pillars and dual pump dispensers.
- **Mechanic Garage Shutter (`createGarageShutterMesh`)**: Brick workshop frame, corrugated blue-grey roll-up shutter, and Kamal bhai signboard.
- **Footbridge (`createFootbridgeMesh`)**: Overhead pedestrian overpass spanning road traffic with safety mesh railings and stair towers.
- **Rooftop Water Tank (`createRooftopWaterTankMesh`)**: Black cylindrical Gazi-style water tank on concrete roof pilings.
- **Overhead Wires (`createOverheadWiresMesh`)**: Tangled black cable bundles draped across utility poles.
- **Shop Signboards (`createShopSignboardMesh`)**: Street storefront display banners in Dhaka commercial aesthetics.

---

## 3. Pipeline Automation
- **Manifest**: `assets.manifest.json` defines all packs and required procedural fallbacks.
- **Fetch**: `node scripts/fetch-assets.mjs` validates the manifest and verifies CC0 licensing.
- **Optimize**: `node scripts/optimize-assets.mjs` manages Meshopt and WebP compression targets.
- **Zero-Crash Guarantee**: `loadModel(id)` in `src/render/assets.ts` guarantees that any missing or un-downloaded model gracefully falls back to its procedural counterpart.

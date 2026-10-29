import fs from 'node:fs';
import path from 'node:path';
import {
  DistrictSchema,
  ArchetypesDataSchema,
  EncounterDefSchema,
  WorldDataSchema,
  MissionDefSchema,
  EndingDefSchema,
} from '../src/sim/schemas.ts';

// Validate dialogue files
const dialogueDir = path.resolve('data/dialogue');
const dicts = { bn: {}, en: {} };
if (fs.existsSync(dialogueDir)) {
  const langs = ['bn', 'en'];

  for (const lang of langs) {
    const langDir = path.join(dialogueDir, lang);
    if (fs.existsSync(langDir)) {
      const files = fs.readdirSync(langDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(langDir, file);
          try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            Object.assign(dicts[lang], content);
          } catch (err) {
            console.error(`Invalid JSON in ${filePath}:`, err);
            process.exit(1);
          }
        }
      }
    }
  }

  // Verify missing bn keys compared to en
  const enKeys = Object.keys(dicts.en);
  const missingBnKeys = enKeys.filter((k) => typeof dicts.bn[k] === 'undefined');
  if (missingBnKeys.length > 0) {
    console.error(`Missing bn dialogue keys (${missingBnKeys.length}):`, missingBnKeys);
    process.exit(1);
  }
}

// Validate district files
const districtsDir = path.resolve('data/districts');
if (fs.existsSync(districtsDir)) {
  const files = fs.readdirSync(districtsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(districtsDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const result = DistrictSchema.safeParse(raw);
        if (!result.success) {
          console.error(`Schema validation failed for ${filePath}:`, result.error.format());
          process.exit(1);
        }

        const district = result.data;

        // Check 1: Every string key exists in bn + en
        for (const poi of district.pois) {
          if (typeof dicts.en[poi.nameKey] === 'undefined') {
            console.error(`District ${filePath}: POI nameKey '${poi.nameKey}' missing in en dialogue`);
            process.exit(1);
          }
          if (typeof dicts.bn[poi.nameKey] === 'undefined') {
            console.error(`District ${filePath}: POI nameKey '${poi.nameKey}' missing in bn dialogue`);
            process.exit(1);
          }
        }

        // Check 2: Every POI on a pickupPractical segment
        for (const poi of district.pois) {
          const onPractical = district.segments.some(
            (s) => (s.startNodeId === poi.nodeId || s.endNodeId === poi.nodeId) && s.pickupPractical
          );
          if (!onPractical) {
            console.error(`District ${filePath}: POI ${poi.id} (${poi.nodeId}) is not on any pickupPractical segment`);
            process.exit(1);
          }
        }

        // Check 3: Every divided road has a U-turn node every <= 400 m
        const dividedSegs = district.segments.filter((s) => s.divided);
        if (dividedSegs.length > 0) {
          const uturnNodeIds = new Set(
            district.nodes
              .filter((n) => n.kind === 'uturn' || (n.tags && n.tags.includes('uturn')))
              .map((n) => n.nodeId)
          );
          const nodeMap = new Map(district.nodes.map((n) => [n.nodeId, n]));

          for (const seg of dividedSegs) {
            const sNode = nodeMap.get(seg.startNodeId);
            const eNode = nodeMap.get(seg.endNodeId);
            if (!sNode || !eNode) continue;
            const midX = (sNode.x + eNode.x) / 2;
            const midZ = (sNode.z + eNode.z) / 2;

            let nearestDist = Infinity;
            for (const uId of uturnNodeIds) {
              const uNode = nodeMap.get(uId);
              if (uNode) {
                const d = Math.hypot(uNode.x - midX, uNode.z - midZ);
                if (d < nearestDist) nearestDist = d;
              }
            }
            if (nearestDist > 400) {
              console.error(
                `District ${filePath}: divided segment ${seg.segmentId} is ${nearestDist.toFixed(1)}m from nearest U-turn (max 400m)`
              );
              process.exit(1);
            }
          }
        }

        // Check 4: Graph strongly connected for motorcycles (excluding inaccessible)
        const motoSegs = district.segments.filter((s) => s.motorcycleAccessible);
        if (motoSegs.length > 0) {
          const adj = new Map();
          const revAdj = new Map();
          const accessibleNodes = new Set();

          for (const s of motoSegs) {
            accessibleNodes.add(s.startNodeId);
            accessibleNodes.add(s.endNodeId);
            if (!adj.has(s.startNodeId)) adj.set(s.startNodeId, []);
            if (!adj.has(s.endNodeId)) adj.set(s.endNodeId, []);
            if (!revAdj.has(s.startNodeId)) revAdj.set(s.startNodeId, []);
            if (!revAdj.has(s.endNodeId)) revAdj.set(s.endNodeId, []);

            adj.get(s.startNodeId).push(s.endNodeId);
            revAdj.get(s.endNodeId).push(s.startNodeId);

            if (!s.oneWay) {
              adj.get(s.endNodeId).push(s.startNodeId);
              revAdj.get(s.startNodeId).push(s.endNodeId);
            }
          }

          const startNode = accessibleNodes.values().next().value;
          if (startNode) {
            // Forward BFS
            const visited = new Set();
            const queue = [startNode];
            visited.add(startNode);
            while (queue.length > 0) {
              const curr = queue.shift();
              for (const next of (adj.get(curr) || [])) {
                if (!visited.has(next)) {
                  visited.add(next);
                  queue.push(next);
                }
              }
            }

            // Backward BFS
            const revVisited = new Set();
            const revQueue = [startNode];
            revVisited.add(startNode);
            while (revQueue.length > 0) {
              const curr = revQueue.shift();
              for (const next of (revAdj.get(curr) || [])) {
                if (!revVisited.has(next)) {
                  revVisited.add(next);
                  revQueue.push(next);
                }
              }
            }

            if (visited.size !== accessibleNodes.size || revVisited.size !== accessibleNodes.size) {
              console.error(
                `District ${filePath}: motorcycle road network is not strongly connected! ` +
                  `Reachable forward: ${visited.size}/${accessibleNodes.size}, reachable backward: ${revVisited.size}/${accessibleNodes.size}`
              );
              process.exit(1);
            }
          }
        }
      } catch (err) {
        console.error(`Failed reading district ${filePath}:`, err);
        process.exit(1);
      }
    }
  }
}

// Validate world.json file
const worldPath = path.resolve('data/world.json');
if (fs.existsSync(worldPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(worldPath, 'utf-8'));
    const result = WorldDataSchema.safeParse(raw);
    if (!result.success) {
      console.error(`Schema validation failed for ${worldPath}:`, result.error.format());
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed reading world ${worldPath}:`, err);
    process.exit(1);
  }
}

// Validate archetypes file
const archetypesPath = path.resolve('data/archetypes.json');
if (fs.existsSync(archetypesPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(archetypesPath, 'utf-8'));
    const result = ArchetypesDataSchema.safeParse(raw);
    if (!result.success) {
      console.error(`Schema validation failed for ${archetypesPath}:`, result.error.format());
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed reading archetypes ${archetypesPath}:`, err);
    process.exit(1);
  }
}

// Validate encounters
const encountersDir = path.resolve('data/encounters');
if (fs.existsSync(encountersDir)) {
  const files = fs.readdirSync(encountersDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(encountersDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!Array.isArray(raw)) {
          console.error(`Expected array of encounters in ${filePath}`);
          process.exit(1);
        }
        for (const enc of raw) {
          const res = EncounterDefSchema.safeParse(enc);
          if (!res.success) {
            console.error(`Encounter schema error in ${filePath} (${enc?.id}):`, res.error.format());
            process.exit(1);
          }
          if (typeof dicts.en[enc.lineKey] === 'undefined') {
            console.error(`Encounter ${enc.id} in ${filePath}: lineKey '${enc.lineKey}' missing in en dialogue`);
            process.exit(1);
          }
          if (typeof dicts.bn[enc.lineKey] === 'undefined') {
            console.error(`Encounter ${enc.id} in ${filePath}: lineKey '${enc.lineKey}' missing in bn dialogue`);
            process.exit(1);
          }
          for (const choice of enc.choices) {
            if (typeof dicts.en[choice.labelKey] === 'undefined') {
              console.error(`Encounter ${enc.id} choice ${choice.id} in ${filePath}: labelKey '${choice.labelKey}' missing in en dialogue`);
              process.exit(1);
            }
            if (typeof dicts.bn[choice.labelKey] === 'undefined') {
              console.error(`Encounter ${enc.id} choice ${choice.id} in ${filePath}: labelKey '${choice.labelKey}' missing in bn dialogue`);
              process.exit(1);
            }
          }
        }
      } catch (err) {
        console.error(`Failed reading encounter file ${filePath}:`, err);
        process.exit(1);
      }
    }
  }
}

// Validate upgrades.json
const upgradesPath = path.resolve('data/upgrades.json');
if (fs.existsSync(upgradesPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(upgradesPath, 'utf-8'));
    if (!Array.isArray(raw)) {
      console.error(`Expected array of upgrades in ${upgradesPath}`);
      process.exit(1);
    }
    for (const upg of raw) {
      if (typeof dicts.en[upg.nameKey] === 'undefined') {
        console.error(`Upgrade ${upg.id}: nameKey '${upg.nameKey}' missing in en dialogue`);
        process.exit(1);
      }
      if (typeof dicts.bn[upg.nameKey] === 'undefined') {
        console.error(`Upgrade ${upg.id}: nameKey '${upg.nameKey}' missing in bn dialogue`);
        process.exit(1);
      }
      if (typeof dicts.en[upg.descKey] === 'undefined') {
        console.error(`Upgrade ${upg.id}: descKey '${upg.descKey}' missing in en dialogue`);
        process.exit(1);
      }
      if (typeof dicts.bn[upg.descKey] === 'undefined') {
        console.error(`Upgrade ${upg.id}: descKey '${upg.descKey}' missing in bn dialogue`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`Failed reading upgrades file ${upgradesPath}:`, err);
    process.exit(1);
  }
}

// Validate missions: schema, dialogue keys, and no mission must require an upgrade
const missionsDir = path.resolve('data/missions');
if (fs.existsSync(missionsDir)) {
  const files = fs.readdirSync(missionsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(missionsDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const missions = Array.isArray(raw) ? raw : [raw];
        for (const m of missions) {
          const res = MissionDefSchema.safeParse(m);
          if (!res.success) {
            console.error(`Mission schema error in ${filePath} (${m?.id}):`, res.error.format());
            process.exit(1);
          }

          if (typeof dicts.en[m.titleKey] === 'undefined') {
            console.error(`Mission ${m.id} in ${filePath}: titleKey '${m.titleKey}' missing in en dialogue`);
            process.exit(1);
          }
          if (typeof dicts.bn[m.titleKey] === 'undefined') {
            console.error(`Mission ${m.id} in ${filePath}: titleKey '${m.titleKey}' missing in bn dialogue`);
            process.exit(1);
          }
          if (typeof dicts.en[m.descKey] === 'undefined') {
            console.error(`Mission ${m.id} in ${filePath}: descKey '${m.descKey}' missing in en dialogue`);
            process.exit(1);
          }
          if (typeof dicts.bn[m.descKey] === 'undefined') {
            console.error(`Mission ${m.id} in ${filePath}: descKey '${m.descKey}' missing in bn dialogue`);
            process.exit(1);
          }

          for (const obj of m.objectives) {
            if (typeof dicts.en[obj.descKey] === 'undefined') {
              console.error(`Mission ${m.id} objective ${obj.id}: descKey '${obj.descKey}' missing in en dialogue`);
              process.exit(1);
            }
            if (typeof dicts.bn[obj.descKey] === 'undefined') {
              console.error(`Mission ${m.id} objective ${obj.id}: descKey '${obj.descKey}' missing in bn dialogue`);
              process.exit(1);
            }
            if (obj.type === 'buy' && obj.target === 'upgrade') {
              console.error(`Mission ${m.id} objective ${obj.id} in ${filePath} illegally requires an upgrade!`);
              process.exit(1);
            }
          }
        }
      } catch (err) {
        console.error(`Failed reading mission file ${filePath}:`, err);
        process.exit(1);
      }
    }
  }
}

// Validate endings.json
const endingsPath = path.resolve('data/endings.json');
if (fs.existsSync(endingsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(endingsPath, 'utf-8'));
    if (!Array.isArray(raw)) {
      console.error(`Expected array of endings in ${endingsPath}`);
      process.exit(1);
    }
    for (const ending of raw) {
      const res = EndingDefSchema.safeParse(ending);
      if (!res.success) {
        console.error(`Ending schema error in ${endingsPath} (${ending?.id}):`, res.error.format());
        process.exit(1);
      }
      if (typeof dicts.en[ending.titleKey] === 'undefined') {
        console.error(`Ending ${ending.id}: titleKey '${ending.titleKey}' missing in en dialogue`);
        process.exit(1);
      }
      if (typeof dicts.bn[ending.titleKey] === 'undefined') {
        console.error(`Ending ${ending.id}: titleKey '${ending.titleKey}' missing in bn dialogue`);
        process.exit(1);
      }
      if (typeof dicts.en[ending.descKey] === 'undefined') {
        console.error(`Ending ${ending.id}: descKey '${ending.descKey}' missing in en dialogue`);
        process.exit(1);
      }
      if (typeof dicts.bn[ending.descKey] === 'undefined') {
        console.error(`Ending ${ending.id}: descKey '${ending.descKey}' missing in bn dialogue`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`Failed reading endings file ${endingsPath}:`, err);
    process.exit(1);
  }
}

console.log('Data validation passed.');

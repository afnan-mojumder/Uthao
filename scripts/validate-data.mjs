import fs from 'node:fs';
import path from 'node:path';
import { DistrictSchema, ArchetypesDataSchema } from '../src/sim/schemas.ts';

// Validate dialogue files
const dialogueDir = path.resolve('data/dialogue');
if (fs.existsSync(dialogueDir)) {
  const langs = ['bn', 'en'];
  const dicts = { bn: {}, en: {} };

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
      } catch (err) {
        console.error(`Failed reading district ${filePath}:`, err);
        process.exit(1);
      }
    }
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

console.log('Data validation passed.');

import fs from 'node:fs';
import path from 'node:path';
import { DistrictSchema } from '../src/sim/schemas.ts';

// Validate dialogue files
const dialogueDir = path.resolve('data/dialogue');
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
            JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          } catch (err) {
            console.error(`Invalid JSON in ${filePath}:`, err);
            process.exit(1);
          }
        }
      }
    }
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

console.log('Data validation passed.');

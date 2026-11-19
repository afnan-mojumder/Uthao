import js from '@eslint/js';
import tsPlugin from 'typescript-eslint';
import globals from 'globals';

export default tsPlugin.config(
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'assets-src/**', 'test-results/**', 'playwright-report/**', '.remember/**', '.claude/**'],
  },
  {
    files: ['scripts/**', '*.config.{js,ts,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**', 'tests/**'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/sim/**', 'src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Rapier WASM was replaced by deterministic spatial-hash PhysicsWorld (P1.1).
          paths: [
            {
              name: 'three',
              message: 'Sim purity: core and sim modules must not import three.',
            },
            {
              name: 'preact',
              message: 'Sim purity: core and sim modules must not import preact.',
            },
          ],
          patterns: [
            {
              group: ['three/*', 'preact/*'],
              message: 'Sim purity: core and sim modules must not import UI or rendering packages.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'All randomness in core and sim must go through core/rng.ts, not Math.random().',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'Sim purity: core and sim modules must not access window.',
        },
        {
          name: 'document',
          message: 'Sim purity: core and sim modules must not access document.',
        },
      ],
    },
  }
);

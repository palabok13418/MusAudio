const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.vercel/**',
      '**/.netlify/**',
      '**/.wrangler/**',
      '**/*.min.js',
      '**/*.ts',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'warn',
    },
  },
  {
    files: ['api/**/*.js', 'netlify/functions/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
      },
    },
  },
  prettier,
];

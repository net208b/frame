import next from 'eslint-config-next';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat ESLint configuration.
 *
 * eslint-config-next 16 ships flat-config arrays, so the three presets are
 * spread directly rather than wrapped in FlatCompat.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'docs/prototype/**',
      'supabase/**',
    ],
  },

  ...next,
  ...coreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // An unused variable is usually a leftover, but a deliberately ignored
      // argument is legitimate — allow the underscore convention for it.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // The codebase is strictly typed on purpose; `any` erases that.
      '@typescript-eslint/no-explicit-any': 'error',

      // Image weight is a cost and a performance problem here, not a style
      // preference: the whole image pipeline exists to avoid raw <img>.
      '@next/next/no-img-element': 'error',

      // Accessibility rules are requirements in this project, not advice.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
    },
  },

  {
    // Migrations and seeds are SQL; the demo dataset is intentionally large.
    files: ['src/lib/data/demo/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    // The data layer is plain server-side TypeScript with no React in it.
    // `useLive()` in repository.ts selects the demo or the live implementation;
    // the hook rule matches it on the `use` prefix alone and is wrong here.
    // Scoped to this directory so a real hook mistake elsewhere still fails.
    files: ['src/lib/data/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];

export default config;

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignore build output and deploy worktrees — linting the minified production
  // bundle in docs/ produced thousands of meaningless errors.
  globalIgnores([
    'dist/**',
    'docs/**',
    // Stray build output committed to the repo root by an old deploy — minified
    // bundles, not source. (These dirs ideally get removed from git entirely.)
    'assets/**',
    'test/**',
    '.deploy-master-worktree/**',
    '.gh-pages-test-worktree/**',
    '.superpowers/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Allow the `const { omit, ...rest } = obj` pattern used to strip fields
      // (e.g. dropping image/timestamp before persisting) without flagging the
      // intentionally-unused sibling.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
])

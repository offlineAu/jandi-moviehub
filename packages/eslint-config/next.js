import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from './base.js';

/** ESLint flat config for the Next.js app. */
export default tseslint.config(...base, {
  languageOptions: { globals: { ...globals.browser } },
  plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
});

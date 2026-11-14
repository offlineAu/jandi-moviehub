import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import base from './base.js';

/** ESLint flat config for the Next.js app. */
export default tseslint.config(...base, {
  languageOptions: { globals: { ...globals.browser } },
  plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Accessibility is enforced in CI by axe; this catches regressions at lint time instead.
    ...jsxA11y.flatConfigs.recommended.rules,
    // Single-purpose forms (login, room creation) intentionally move focus to their first field
    // so the user can type straight away. Inside a Radix dialog this is wrong — the dialog
    // manages focus itself — so `autoFocus` is only used on page-level forms.
    'jsx-a11y/no-autofocus': 'off',
    // Captions come from the provider's subtitle track and are toggled in the player's own
    // menu; the streams are not `<video>` elements with sibling `<track>` files.
    'jsx-a11y/media-has-caption': 'off',
    // These roles carry information that is only reachable by focusing them: a tooltip trigger
    // (img), a scrollable rail that must be keyboard-scrollable (region), a live status readout
    // and a group of collaborators (group). WCAG 2.1.1 requires them to be focusable.
    'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['img', 'region', 'status', 'group'] }],
    // Keyboard and focus handlers belong on labelled, focusable containers (a scrollable rail,
    // a chart you read with the arrow keys, the video player). Mouse handlers on a
    // non-interactive element are still an error, and `click-events-have-key-events` still
    // requires a keyboard equivalent for every click handler.
    'jsx-a11y/no-noninteractive-element-interactions': [
      'error',
      { handlers: ['onClick', 'onMouseDown', 'onMouseUp', 'onDoubleClick'] },
    ],
  },
});

import base from '@jandi/eslint-config/base';

export default [
  ...base,
  {
    // Constructor-injected classes are needed at runtime for Nest's decorator metadata,
    // so the parser must know metadata is emitted (keeps consistent-type-imports correct).
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
  },
];

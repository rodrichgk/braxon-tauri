/* Pulls Vitest's global APIs (describe/it/expect/vi/…) and jest-dom's custom
   matchers into the type system. `vitest.config.ts` sets `globals: true`, and
   tsconfig.json's `include: ["src"]` picks this file up, so test files don't
   need to import the globals or the matcher augmentation. */

/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

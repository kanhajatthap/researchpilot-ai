// Vitest setup file.
//
// The previous content imported `@testing-library/jest-dom`, which is not a
// dependency of this project. The test suite runs in the plain `node`
// environment (see vitest.config.ts) and only exercises server-side logic, so
// no DOM matchers are required. Keeping this file free of optional imports
// lets `npm test` run without extra dev dependencies.
export {};

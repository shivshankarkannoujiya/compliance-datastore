/** @type {import('jest').Config} */
const base = { preset: 'ts-jest', testEnvironment: 'node' };

module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.module.ts'],
  projects: [
    { ...base, displayName: 'unit', roots: ['<rootDir>/src', '<rootDir>/test'], testMatch: ['**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      roots: ['<rootDir>/test/integration'],
      testMatch: ['**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.ts',
      setupFiles: ['<rootDir>/test/integration/env.ts'],
    },
  ],
};

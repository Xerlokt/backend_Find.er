import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {},
  // setup.ts is imported directly in each integration test file (see tests/integration/*)
  globalSetup: '<rootDir>/tests/jest.global-setup.ts',
  setupFiles: ['<rootDir>/tests/jest.setup-env.ts'],
  testTimeout: 30000,
}

export default config

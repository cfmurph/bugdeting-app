/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^csv-parse/sync$': '<rootDir>/node_modules/csv-parse/dist/cjs/sync.cjs',
  },
  transformIgnorePatterns: ['/node_modules/(?!drizzle-orm/)'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
    '^.+\\.js$': 'babel-jest',
  },
};

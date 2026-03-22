/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
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

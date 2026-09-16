import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from 'jest'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

const swcTransform: Config['transform'] = {
  '^.+\\.ts$': ['@swc/jest', {}],
}

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      rootDir,
      testMatch: ['<rootDir>/src/test/unit/**/*.test.ts'],
      transform: swcTransform,
    },
    {
      displayName: 'e2e',
      rootDir,
      testMatch: ['<rootDir>/src/test/e2e/**/*.test.ts'],
      transform: swcTransform,
    },
  ],
}

export default config

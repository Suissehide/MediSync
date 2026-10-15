import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from 'jest'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

const swcTransform: Config['transform'] = {
  '^.+\\.ts$': [
    '@swc/jest',
    { module: { type: 'commonjs', ignoreDynamic: true } },
  ],
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
      // Le budget d'un test e2e (30 s) est pose la, par `jest.setTimeout`, et non par
      // `testTimeout` ici : mesure faite, Jest ne propage pas `testTimeout` d'un projet a ses
      // hooks. Voir le commentaire de ce fichier, qui porte la mesure et la raison du budget.
      setupFilesAfterEnv: ['<rootDir>/src/test/e2e/setup/budget.ts'],
    },
  ],
}

export default config

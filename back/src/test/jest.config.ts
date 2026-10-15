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
      // Le defaut de Jest est 5 s, HOOKS COMPRIS, et un `beforeAll` e2e vide la base, monte
      // l'application et seme ses fixtures. Mesure sur une machine chargee (load average 9,
      // WebStorm et Chrome ouverts) : trois executions completes d'affilee ont rendu 15, 28
      // puis 50 echecs, tous « Exceeded timeout of 5000 ms for a hook » dans des `beforeAll`,
      // sur des suites sans rapport entre elles ; les memes, relancees seules, passent 55/55.
      // Ce n'est donc pas la logique qui echoue, c'est l'horloge — meme diagnostic que le
      // budget d'attente du front (`front/src/test/setup.ts`). Un test e2e qui s'approcherait
      // vraiment de 30 s est un test a regarder, pas un reglage a relever.
      testTimeout: 30000,
    },
  ],
}

export default config

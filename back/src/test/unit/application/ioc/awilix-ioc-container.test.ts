import { AwilixIocContainer } from '../../../../main/application/ioc/awilix/awilix-ioc-container'
import { PinoLogger } from '../../../../main/infra/logger/pino/pino-logger'
import type { Config } from '../../../../main/types/application/config'

// task-5-re-review-3.md (re-revue du tour 5) : "établis toi-même l'inventaire complet". Ce test
// ne vient d'aucune liste — trouve en balayant tous les appels `logger.*` de `src/main`
// (`grep -rn "logger\.\(debug\|error\|warn\|info\|trace\)" src/main`) : `awilix-ioc-container.ts`
// journalise `recordToString(config)` a `debug`, qui recopie TOUTES les cles de la config,
// `jwtSecret`/`jwtRefreshSecret`/`cookieSecret` compris — les secrets qui signent les cookies de
// session. Contrairement aux autres fuites de ce tour, ce n'est pas une erreur qui s'echappe :
// c'est la config qui est journalisee telle quelle, secrets compris, des le demarrage, a
// `LOG_LEVEL=DEBUG`.
const buildConfig = (): Config => ({
  baseDir: '/tmp',
  isDevelopment: false,
  host: '127.0.0.1',
  corsOrigin: 'http://localhost:4270',
  frontUrl: 'http://localhost:4270',
  jwtSecret: 'SECRET-JWT-MARKER',
  jwtRefreshSecret: 'SECRET-REFRESH-MARKER',
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  cookieSecret: 'SECRET-COOKIE-MARKER',
  logLevel: 'debug',
  port: 0,
  mockServerPort: 4000,
  isTestRunning: true,
})

describe('AwilixIocContainer – la config journalisee au demarrage ne porte aucun secret', () => {
  it('ne journalise jamais jwtSecret / jwtRefreshSecret / cookieSecret en clair, sur aucun canal', () => {
    // Tous les canaux de PinoLogger, pas seulement `debug` (task-5-re-review-4.md, I1) : un
    // `logger.info(...)` ajoute apres la ligne masquee, portant les trois secrets en clair,
    // passait au vert tant que seul `debug` etait espionne — l'assertion ne regardait que la
    // ligne qui commence par "Loaded config:", jamais les autres canaux.
    const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const
    const calls: string[] = []
    const record = (message: string) => calls.push(message)
    const spies = LOG_LEVELS.map((level) =>
      jest.spyOn(PinoLogger.prototype, level).mockImplementation(record),
    )

    // eslint-disable-next-line no-new
    new AwilixIocContainer(buildConfig())

    const configLine = calls.find((line) => line.startsWith('Loaded config:'))
    expect(configLine).toBeDefined()
    expect(configLine).not.toContain('SECRET-JWT-MARKER')
    expect(configLine).not.toContain('SECRET-REFRESH-MARKER')
    expect(configLine).not.toContain('SECRET-COOKIE-MARKER')

    // Et sur AUCUNE ligne, tous canaux confondus.
    for (const line of calls) {
      expect(line).not.toContain('SECRET-JWT-MARKER')
      expect(line).not.toContain('SECRET-REFRESH-MARKER')
      expect(line).not.toContain('SECRET-COOKIE-MARKER')
    }

    for (const spy of spies) {
      spy.mockRestore()
    }
  })
})

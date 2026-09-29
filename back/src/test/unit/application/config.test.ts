import { loadConfig } from '../../../main/application/config'

// Env minimal mais complet : `LOG_LEVEL` doit toujours etre present (loadConfig appelle
// `envConfig.logLevel.toLowerCase()` sans filet), et `FRONT_URL` est le seul champ du schema sans
// `.default(...)`. Le reste porte un defaut cote Zod, mais on le fixe quand meme pour ne jamais
// dependre d'un `process.env` ambiant pendant les tests.
const envValide: Record<string, string> = {
  FRONT_URL: 'http://localhost:4270',
  CORS_ORIGIN: 'http://localhost:4270',
  HOST: '127.0.0.1',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  COOKIE_SECRET: 'test-cookie-secret',
  LOG_LEVEL: 'info',
  PORT: '3000',
  MOCK_SERVER_PORT: '4000',
  LOG_RETENTION_MONTHS: '12',
}

describe('loadConfig, LOG_RETENTION_MONTHS', () => {
  // Task 8, etape 1 (Review Focus n°3) : une purge tourne seule, a intervalle regulier, sans
  // personne pour regarder son resultat -- une retention absurde doit donc faire echouer le
  // DEMARRAGE, jamais laisser la purge planifiee interpreter zero (ou une valeur non numerique)
  // litteralement au premier passage, ce qui viderait les deux journaux.
  it.each([['0'], ['-3'], ['douze']])(
    'refuse de demarrer avec une retention absurde (%s)',
    (valeur) => {
      expect(() =>
        loadConfig({ ...envValide, LOG_RETENTION_MONTHS: valeur }),
      ).toThrow()
    },
  )

  it('demarre avec la retention explicite fournie', () => {
    const config = loadConfig({ ...envValide, LOG_RETENTION_MONTHS: '6' })

    expect(config.logRetentionMonths).toBe(6)
  })

  it('defaut a douze mois quand LOG_RETENTION_MONTHS est absent', () => {
    const { LOG_RETENTION_MONTHS: _omise, ...sansRetention } = envValide

    const config = loadConfig(sansRetention)

    expect(config.logRetentionMonths).toBe(12)
  })
})

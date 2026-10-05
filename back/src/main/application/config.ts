import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config as configDotenv } from 'dotenv'
import type { SignOptions } from 'jsonwebtoken'
import { levels } from 'pino'
import { z } from 'zod/v4'

import baseDir from '../base-dir'
import type { ConfigEnvVars } from '../types/application/config'
import { pickFromDict, toCamelCase } from '../utils/helper'

const isDevelopment = process.env.NODE_ENV === 'development'
const isTestRunning = process.env.JEST_RUNNING === 'true'
const envLocalPath = join(baseDir, '.env.local')
const envLocalExists = existsSync(envLocalPath)
if (envLocalExists) {
  configDotenv({
    debug: isDevelopment,
    encoding: 'utf8',
    path: envLocalPath,
  })
}
configDotenv({
  debug: isDevelopment,
  encoding: 'utf8',
  path: join(baseDir, '.env'),
})
const configSchema = z.object({
  baseDir: z.string(),
  isDevelopment: z.boolean(),
  host: z.string().optional(),
  corsOrigin: z.string().optional(),
  frontUrl: z.string(),

  jwtSecret: z.string().default('medisync-jwt'),
  jwtRefreshSecret: z.string().default('medisync-refresh'),
  jwtExpiresIn: z.custom<SignOptions['expiresIn']>().default('15m'),
  jwtRefreshExpiresIn: z.custom<SignOptions['expiresIn']>().default('7d'),

  cookieSecret: z.string().default('medisync-cookie'),

  logLevel: z.enum(['silent', ...Object.values(levels.labels)]).default('info'),
  port: z
    .string()
    .default('0')
    .transform((val) => Number.parseInt(val, 10)),
  mockServerPort: z
    .string()
    .default('4000')
    .transform((val) => Number.parseInt(val, 10)),
  isTestRunning: z.boolean().default(false),

  // Retention des deux journaux de tracabilite (ActivityLog, PatientAccessLog) : entier
  // strictement positif, defaut douze mois. Une purge planifiee tourne seule, sans
  // personne pour regarder son resultat (application/starter.ts) ; une valeur absurde (zero,
  // negative, non numerique) doit donc faire echouer le DEMARRAGE plutot que de laisser la purge
  // interpreter zero mois litteralement au premier passage planifie (ce qui viderait les deux
  // journaux). `.pipe` verifie APRES le parsing : `Number.parseInt('douze', 10)` rend `NaN`, que
  // `z.number()` refuse deja nommement (jamais un entier valide) ; `0`/`-3` echouent sur
  // `.positive()`.
  logRetentionMonths: z
    .string()
    .default('12')
    .transform((val) => Number.parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // Pas de SMTP_HOST = envoi d'e-mails désactivé (les liens restent copiables par l'admin).
  smtpHost: z.string().optional(),
  // `|| défaut` : une variable de compose non renseignée arrive en chaîne vide, pas absente.
  smtpPort: z
    .string()
    .optional()
    .transform((val) => Number.parseInt(val || '587', 10)),
  smtpSecure: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z
    .string()
    .optional()
    .transform((val) => val || 'MediSync <no-reply@medisync.local>'),
})
const envVarNames = [
  'CORS_ORIGIN',
  'HOST',
  'FRONT_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'COOKIE_SECRET',
  'LOG_LEVEL',
  'PORT',
  'MOCK_SERVER_PORT',
  'LOG_RETENTION_MONTHS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
]

// `env` optionnel : `process.env` par defaut, pour que tout appelant de
// production (starter.ts, e2e/setup/app.ts) continue de fonctionner sans argument. Injectable
// pour eprouver une retention absurde sans jamais toucher au `process.env` reel du process de
// test (config.test.ts).
const loadConfig = (env: NodeJS.Dict<string> = process.env) => {
  const envConfig = pickFromDict<ConfigEnvVars>(env, envVarNames, toCamelCase)
  envConfig.logLevel = envConfig.logLevel.toLowerCase()
  const configData = {
    ...envConfig,
    baseDir,
    isDevelopment,
    isTestRunning,
  }
  return configSchema.parse(configData)
}

export { loadConfig, configSchema }

import type { z } from 'zod'
import type { configSchema } from '../../application/config'

export type Config = z.infer<typeof configSchema>

export type ConfigEnvVars = Omit<Config, 'baseDir' | 'isDevelopment'>

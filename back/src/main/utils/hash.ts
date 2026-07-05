import crypto from 'node:crypto'

// Paramètres PBKDF2 alignés sur les recommandations OWASP (SHA-512).
// L'ancien coût (1000) reste accepté en lecture pour ne pas invalider les
// mots de passe déjà stockés ; tout nouveau hash utilise le coût courant.
const KEY_LENGTH = 64
const DIGEST = 'sha512'
const CURRENT_ITERATIONS = 210_000
const LEGACY_ITERATIONS = 1000

function derive(password: string, salt: string, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
}

function safeEqualHex(candidate: Buffer, expectedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== candidate.length) {
    return false
  }
  return crypto.timingSafeEqual(candidate, expected)
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = derive(password, salt, CURRENT_ITERATIONS).toString('hex')

  return { hash, salt }
}

export function verifyPassword({
  password,
  salt,
  hash,
}: {
  password: string
  salt: string
  hash: string
}) {
  // Chemin courant (coût OWASP).
  if (safeEqualHex(derive(password, salt, CURRENT_ITERATIONS), hash)) {
    return true
  }
  // Repli pour les hash historiques (coût 1000). À terme, ré-hacher au login.
  return safeEqualHex(derive(password, salt, LEGACY_ITERATIONS), hash)
}

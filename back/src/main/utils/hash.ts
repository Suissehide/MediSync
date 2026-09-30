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

// Jeton aléatoire encodé en base64url (URL-safe, sans padding) : sert de jeton d'accès (lien de
// première connexion / réinitialisation). Le jeton lui-même n'est JAMAIS
// stocké ; seule son empreinte (`sha256Hex`, ci-dessous) rejoint la base.
export function randomToken(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString('base64url')
}

// Empreinte d'un jeton d'accès : irréversible, c'est elle que la table `AccessLink` stocke — la
// table ne doit jamais suffire à fabriquer un accès (voir prisma/schema.prisma, modèle
// `AccessLink`).
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

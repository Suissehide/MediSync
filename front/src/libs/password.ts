// Miroir de `back/.../schemas/password.schema.ts` : 8 caractères et les quatre types.
export const PASSWORD_RULES =
  'Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.'

export function passwordError(value: string): string | undefined {
  if (!value) {
    return 'Le mot de passe est nécessaire'
  }
  if (value.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères'
  }
  if (!/[a-z]/.test(value)) {
    return 'Le mot de passe doit contenir une minuscule'
  }
  if (!/[A-Z]/.test(value)) {
    return 'Le mot de passe doit contenir une majuscule'
  }
  if (!/\d/.test(value)) {
    return 'Le mot de passe doit contenir un chiffre'
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Le mot de passe doit contenir un caractère spécial'
  }
  return undefined
}

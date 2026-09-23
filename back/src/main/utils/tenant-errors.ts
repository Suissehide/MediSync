// Aucun tenant posé alors qu'une opération en exige un.
class TenantContextMissingError extends Error {
  constructor(detail: string) {
    super(`Tenant context missing: ${detail}`)
    this.name = 'TenantContextMissingError'
  }
}

// Une requête Prisma sur un modèle de tenant ne porte pas le filtre attendu.
class TenantScopeMissingError extends Error {
  readonly model: string
  readonly operation: string
  readonly field: string

  constructor(model: string, operation: string, field: string) {
    super(`Tenant scope missing: ${model}.${operation} without ${field}`)
    this.name = 'TenantScopeMissingError'
    this.model = model
    this.operation = operation
    this.field = field
  }
}

export { TenantContextMissingError, TenantScopeMissingError }

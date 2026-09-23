import { queryOptions } from '@tanstack/react-query'

import { AuthApi } from '@/api/auth.api.ts'
import { AUTH } from '@/constants/process.constant.ts'

// Hors tenant : cette requete ne porte aucun prefixe et survit donc au vidage
// de cache du changement de contexte — elle en est meme la source, puisque
// les gardes valident contre l'arbre des appartenances qu'elle renvoie.
export const meQueryOptions = queryOptions({
  queryKey: [AUTH.ME],
  queryFn: AuthApi.me,
  staleTime: 30_000,
})

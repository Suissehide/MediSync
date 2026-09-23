import { queryOptions } from '@tanstack/react-query'

import { AuthApi } from '@/api/auth.api.ts'
import { AUTH } from '@/constants/process.constant.ts'

// Hors tenant : cette requete ne porte aucun prefixe de tenant, mais le
// vidage de cache du changement de contexte (tache 10) vide tout le cache
// sans regarder les cles — elle est donc videe comme le reste, pas
// epargnee. Sans consequence : `beforeLoad` de `_authenticated` la relance
// explicitement a chaque entree dans l'arbre protege, contexte compris.
export const meQueryOptions = queryOptions({
  queryKey: [AUTH.ME],
  queryFn: AuthApi.me,
  staleTime: 30_000,
})

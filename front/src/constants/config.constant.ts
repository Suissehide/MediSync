import { useAuthStore } from '../store/useAuthStore.ts'

export const environment = import.meta.env.VITE_ENVIRONMENT || 'development'
export const apiUrl = import.meta.env.VITE_API_BASE_URL

const requireContext = () => {
  const context = useAuthStore.getState().context
  if (!context) {
    throw new Error('Aucun contexte établissement/service')
  }
  return context
}

// Préfixes calculés à l'appel, jamais au chargement du module : le contexte
// n'existe pas encore quand les modules sont importés.
export const tenantApiUrl = () => {
  const { establishmentId, serviceId } = requireContext()
  if (serviceId === null) {
    throw new Error(
      'Contexte sans service : cet appel appartient à un écran de service',
    )
  }
  return `${apiUrl}/e/${establishmentId}/s/${serviceId}`
}

export const establishmentApiUrl = () =>
  `${apiUrl}/e/${requireContext().establishmentId}/admin`

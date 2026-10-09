import { useAuthStore } from '@/store/useAuthStore.ts'
import { accessibleCouples } from '@/utils/tenant-context.ts'

// Nom du service de l'adresse courante, parmi ceux auxquels l'utilisateur a accès.
export const useServiceName = (establishmentId: string, serviceId: string) => {
  const user = useAuthStore((state) => state.user)
  return (
    accessibleCouples(user).find(
      (c) =>
        c.establishment.id === establishmentId && c.service.id === serviceId,
    )?.service.name ?? 'Service'
  )
}

import type { User } from '../../../types/auth.ts'
import SoignantFilterSection from './soignantFilter.section.tsx'

interface SidebarSoignantProps {
  user?: User | null
}

function SidebarSoignant({ user }: SidebarSoignantProps) {
  return (
    <SoignantFilterSection
      isAdmin={user?.role === 'ADMIN'}
      title={<p>Soignants</p>}
    />
  )
}

export default SidebarSoignant

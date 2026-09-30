import { createFileRoute } from '@tanstack/react-router'

import { AccountSearchPanel } from '@/components/custom/superAdmin/accountSearchPanel.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'

// « la recherche d'un compte, qui répond à
// "untel ne voit plus ses patients", avec réémission de lien ». Écran hors
// de tout tenant : voir `../super-admin.tsx`. Toute la logique vit dans
// `AccountSearchPanel`, testée isolément (`accountSearchPanel.test.tsx`) —
// ce fichier ne fait que la poser dans le cadre de l'écran.
export const Route = createFileRoute('/_authenticated/super-admin/users')({
  component: SuperAdminUsers,
})

function SuperAdminUsers() {
  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Rechercher un compte
        </h1>
        <AccountSearchPanel />
      </div>
    </DashboardLayout>
  )
}

export default SuperAdminUsers

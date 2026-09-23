import { createFileRoute } from '@tanstack/react-router'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'

export const Route = createFileRoute('/_authenticated/_admin/settings/user')({
  component: UserList,
})

// Écran obsolète : la gestion des utilisateurs par rôle global n'existe
// plus (tâche 17, socle multi-tenant). Il sera remplacé par l'écran des
// membres d'établissement/service en tâche 18.
function UserList() {
  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Membres
        </h1>
        <p className="text-text-light">
          Cet écran sera bientôt remplacé par la gestion des membres.
        </p>
      </div>
    </DashboardLayout>
  )
}

export default UserList

import { createFileRoute, redirect } from '@tanstack/react-router'

import { getUserColumns } from '../../columns/user.column.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
import { useAllUsersQuery, useUserMutations } from '../../queries/useUser.ts'
import type { User } from '../../types/auth.ts'

export const Route = createFileRoute('/settings/user')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  shouldReload({ context }) {
    return !context.authState.isAuthenticated
  },
  component: UserList,
})

function UserList() {
  const { users } = useAllUsersQuery()
  const { updateUser, deleteUser } = useUserMutations()

  const handleUpdateUser = (user: User) => {
    updateUser.mutate(user)
  }

  const handleDeleteUser = (id: string) => {
    deleteUser.mutate(id)
  }

  const columns = getUserColumns({
    onEdit: handleUpdateUser,
    onDelete: handleDeleteUser,
  })

  return (
    <DashboardLayout>
      <h2 className="mt-2 flex gap-2 items-center px-4 mb-4 text-text text-lg font-semibold">
        Liste des utilisateurs
      </h2>

      <div>
        <ReactTable<User>
          data={users ?? []}
          columns={columns}
          filterId="user"
        />
      </div>
    </DashboardLayout>
  )
}

export default UserList

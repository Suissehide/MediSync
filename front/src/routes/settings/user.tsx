import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
import { getUserColumns } from '../../columns/user.column.tsx'
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
      <div>
        <ReactTable
          data={users ?? []}
          columns={columns}
          filterId="user"
          title={'Liste des utilisateurs'}
        />
      </div>
    </DashboardLayout>
  )
}

export default UserList

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getUserColumns } from '../../../../columns/user.column.tsx'
import DeleteUserForm from '../../../../components/custom/popup/deleteUserForm.tsx'
import EditUserForm from '../../../../components/custom/popup/editUserForm.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import ReactTable from '../../../../components/table/reactTable.tsx'
import { useAllUsersQuery } from '../../../../queries/useUser.ts'
import type { User } from '../../../../types/auth.ts'

export const Route = createFileRoute('/_authenticated/_admin/settings/user')({
  component: UserList,
})

function UserList() {
  const { users } = useAllUsersQuery()
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const handleOpenEditUser = (user: User) => {
    setSelectedUser(user)
    setIsEditOpen(true)
  }

  const handleOpenDeleteUser = (user: User) => {
    setSelectedUser(user)
    setIsDeleteOpen(true)
  }

  const columns = getUserColumns({
    onEdit: handleOpenEditUser,
    onDelete: handleOpenDeleteUser,
  })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Liste des utilisateurs
        </h1>

        <div>
          <ReactTable<User>
            data={users ?? []}
            columns={columns}
            filterId="user"
          />
        </div>

        <EditUserForm
          open={isEditOpen}
          setOpen={setIsEditOpen}
          user={selectedUser}
        />

        <DeleteUserForm
          open={isDeleteOpen}
          setOpen={setIsDeleteOpen}
          user={selectedUser}
        />
      </div>
    </DashboardLayout>
  )
}

export default UserList

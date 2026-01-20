import { createColumnHelper } from '@tanstack/react-table'
import { Ban, Pen, Shield, Trash, UserRound } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import type { Role, User } from '../types/auth.ts'

const columnHelper = createColumnHelper<User>()

type UserActions = {
  onEdit: (user: User) => void
  onDelete: (user: User) => void
}

export const RoleLabel = ({ role }: { role: Role }) => {
  const styles = {
    ADMIN: {
      label: 'Administrateur',
      icon: Shield,
      className: 'bg-red-50 text-red-700 border border-red-200',
    },
    USER: {
      label: 'Utilisateur',
      icon: UserRound,
      className: 'bg-blue-50 text-blue-700 border border-blue-200',
    },
    NONE: {
      label: 'Inactif',
      icon: Ban,
      className: 'bg-gray-50 text-gray-600 border border-gray-200',
    },
  } as const

  const { label, icon: Icon, className } = styles[role]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium ${className}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

export const getUserColumns = ({ onEdit, onDelete }: UserActions) => {
  return [
    columnHelper.accessor('firstName', {
      header: 'Prénom',
    }),
    columnHelper.accessor('lastName', {
      header: 'Nom',
    }),
    columnHelper.accessor('email', {
      header: 'Email',
    }),
    columnHelper.accessor('role', {
      header: 'Rôle',
      cell: ({ row }) => <RoleLabel role={row.original.role} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
              <Pen className="w-3 h-3" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(user)}
            >
              <Trash className="w-3 h-3" />
            </Button>
          </div>
        )
      },
    }),
  ]
}

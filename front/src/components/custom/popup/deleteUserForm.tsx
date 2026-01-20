import { Trash, X } from 'lucide-react'

import { useUserMutations } from '../../../queries/useUser.ts'
import type { User } from '../../../types/auth.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface DeleteUserFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  user: User | null
}

function DeleteUserForm({ open, setOpen, user }: DeleteUserFormProps) {
  const { deleteUser } = useUserMutations()

  const handleDelete = () => {
    if (!user) {
      return
    }

    deleteUser.mutate(user.id, {
      onSuccess: () => {
        setOpen(false)
      },
    })
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Suppression
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div>Voulez-vous supprimer cet utilisateur : {user?.email} ?</div>
        </PopupBody>

        <PopupFooter>
          <Button variant="destructive" onClick={() => handleDelete()}>
            <Trash className="w-4 h-4" />
            Supprimer
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default DeleteUserForm

import { Check, X } from 'lucide-react'
import { useEffect } from 'react'

import { ROLE_OPTIONS } from '../../../constants/user.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useUserMutations } from '../../../queries/useUser.ts'
import type { Role, User } from '../../../types/auth.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface EditUserFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  user: User | null
}

function EditUserForm({ open, setOpen, user }: EditUserFormProps) {
  const { updateUser } = useUserMutations()

  const form = useAppForm({
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      role: user?.role ?? 'NONE',
    },
    onSubmit: ({ value }) => {
      if (!user) {
        return
      }

      updateUser.mutate({
        id: user.id,
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email,
        role: value.role as Role,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open && user) {
      form.reset({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        role: user.role ?? 'NONE',
      })
    }
  }, [open, user, form])

  if (!user) {
    return null
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Modifier l'utilisateur
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="space-y-2 max-w-md"
          >
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : "L'email est requis",
              }}
            >
              {(field) => <field.Input label="Email" type="email" />}
            </form.AppField>

            <div className="grid grid-cols-2 gap-4">
              <form.AppField name="firstName">
                {(field) => <field.Input label="Prénom" />}
              </form.AppField>

              <form.AppField name="lastName">
                {(field) => <field.Input label="Nom" />}
              </form.AppField>
            </div>

            <form.AppField name="role">
              {(field) => <field.Select label="Rôle" options={ROLE_OPTIONS} />}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            <Check className="w-4 h-4" />
            Enregistrer
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

export default EditUserForm

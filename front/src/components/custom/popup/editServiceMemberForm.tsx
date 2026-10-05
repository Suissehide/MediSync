import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  SERVICE_ROLE_DESCRIPTION,
  SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { toSelectOptions } from '../../../libs/utils.ts'
import { useServiceMemberMutations } from '../../../queries/useServiceMembers.ts'
import type { ServiceRole } from '../../../types/auth.ts'
import type { ServiceMember } from '../../../types/serviceMember.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'

const SERVICE_ROLE_OPTIONS = toSelectOptions(SERVICE_ROLE_LABEL)

// MDS-17 : le role de CE service, et rien d'autre. Le rattachement a l'etablissement et les
// affectations aux autres services restent a l'administration (`members:manage`).
function EditServiceMemberForm({ member }: { member: ServiceMember }) {
  const [open, setOpen] = useState(false)
  const { setRole } = useServiceMemberMutations()

  const form = useAppForm({
    defaultValues: { role: member.role as string },
    onSubmit: ({ value }) => {
      setRole.mutate({
        affectationId: member.id,
        role: value.role as ServiceRole,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({ role: member.role })
    }
  }, [open, member, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          title="Changer le rôle dans le service"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Rôle dans le service
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <p className="text-sm text-text-dark font-medium">
              {member.user.email}
            </p>

            <form.AppField name="role">
              {(field) => (
                <field.Select
                  label="Rôle"
                  options={SERVICE_ROLE_OPTIONS}
                  clearable={false}
                  description={
                    SERVICE_ROLE_DESCRIPTION[field.state.value as ServiceRole]
                  }
                />
              )}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={setRole.isPending}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default EditServiceMemberForm

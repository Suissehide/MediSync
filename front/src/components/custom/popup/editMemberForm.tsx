import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { toSelectOptions } from '../../../libs/utils.ts'
import { useMemberMutations } from '../../../queries/useMembers.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import type { EstablishmentRole, ServiceRole } from '../../../types/auth.ts'
import type { Member } from '../../../types/member.ts'
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

interface EditMemberFormProps {
  member: Member
  // Service du contexte courant : cette étape ne règle que le rôle du
  // membre dans cet unique service (multi-service : étape 2).
  serviceId: string
}

const NO_SERVICE_ROLE = 'NONE'

const ESTABLISHMENT_ROLE_OPTIONS = toSelectOptions(ESTABLISHMENT_ROLE_LABEL)
const SERVICE_ROLE_OPTIONS = [
  { value: NO_SERVICE_ROLE, label: 'Aucun' },
  ...toSelectOptions(SERVICE_ROLE_LABEL),
]

function EditMemberForm({ member, serviceId }: EditMemberFormProps) {
  const [open, setOpen] = useState(false)
  const { updateMember } = useMemberMutations()
  const { soignants } = useSoignantQueries()

  const soignantOptions = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )

  const currentServiceRole = useMemo(
    () =>
      member.serviceMemberships.find((m) => m.serviceId === serviceId)?.role ??
      NO_SERVICE_ROLE,
    [member, serviceId],
  )

  const form = useAppForm({
    defaultValues: {
      role: member.role,
      soignantId: member.soignantId ?? '',
      serviceRole: currentServiceRole,
    },
    onSubmit: ({ value }) => {
      // Les affectations aux services autres que celui du contexte courant
      // (s'il en existe) ne sont ni montrées ni modifiées ici : on les
      // reporte telles quelles pour ne pas les effacer, la mise à jour
      // remplaçant l'ensemble des affectations de service côté back.
      const otherServiceMemberships = member.serviceMemberships.filter(
        (m) => m.serviceId !== serviceId,
      )
      const services =
        value.serviceRole === NO_SERVICE_ROLE
          ? otherServiceMemberships
          : [
              ...otherServiceMemberships,
              { serviceId, role: value.serviceRole as ServiceRole },
            ]

      updateMember.mutate({
        id: member.id,
        role: value.role as EstablishmentRole,
        soignantId: value.soignantId || null,
        services,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        role: member.role,
        soignantId: member.soignantId ?? '',
        serviceRole: currentServiceRole,
      })
    }
  }, [open, member, currentServiceRole, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          title="Modifier le membre"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Modifier le membre
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="space-y-4 max-w-md">
            <p className="text-sm text-text-dark font-medium">
              {member.user.email}
            </p>

            <form.AppField name="role">
              {(field) => (
                <field.Select
                  label="Rôle établissement"
                  options={ESTABLISHMENT_ROLE_OPTIONS}
                  clearable={false}
                />
              )}
            </form.AppField>

            <form.AppField name="soignantId">
              {(field) => (
                <field.Select
                  label="Fonction"
                  options={soignantOptions}
                  placeholder="Aucune"
                />
              )}
            </form.AppField>

            <form.AppField name="serviceRole">
              {(field) => (
                <field.Select
                  label="Rôle dans le service courant"
                  options={SERVICE_ROLE_OPTIONS}
                  clearable={false}
                />
              )}
            </form.AppField>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={updateMember.isPending}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default EditMemberForm

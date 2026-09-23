import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { toSelectOptions } from '../../../libs/utils.ts'
import { useMemberMutations } from '../../../queries/useMembers.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import type { EstablishmentRole, ServiceRole } from '../../../types/auth.ts'
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

interface AddMemberFormProps {
  trigger?: React.ReactNode
}

// Aucune affectation de service n'est un choix à part entière (le membre
// peut être rattaché à l'établissement sans rôle dans le service courant) :
// on lui donne une valeur explicite plutôt que de s'appuyer sur une case
// vide, que le composant `Select` ne sait pas représenter comme option.
const NO_SERVICE_ROLE = 'NONE'

const ESTABLISHMENT_ROLE_OPTIONS = toSelectOptions(ESTABLISHMENT_ROLE_LABEL)
const SERVICE_ROLE_OPTIONS = [
  { value: NO_SERVICE_ROLE, label: 'Aucun' },
  ...toSelectOptions(SERVICE_ROLE_LABEL),
]

function AddMemberForm({ trigger }: AddMemberFormProps) {
  const [open, setOpen] = useState(false)
  const { addMember } = useMemberMutations()
  const { soignants } = useSoignantQueries()
  const context = useAuthStore((state) => state.context)

  const soignantOptions = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )

  const form = useAppForm({
    defaultValues: {
      email: '',
      role: 'MEMBER',
      soignantId: '',
      serviceRole: NO_SERVICE_ROLE,
    },
    onSubmit: ({ value }) => {
      if (!context) {
        return
      }
      const { serviceId } = context
      // Sur un écran d'administration sans service (aucun `serviceId` dans le
      // contexte), un rôle de service ne peut pas être assigné : on l'ignore
      // silencieusement plutôt que d'envoyer une affectation invalide.
      if (value.serviceRole !== NO_SERVICE_ROLE && !serviceId) {
        return
      }
      addMember.mutate({
        email: value.email,
        role: value.role as EstablishmentRole,
        soignantId: value.soignantId || null,
        services:
          value.serviceRole === NO_SERVICE_ROLE || !serviceId
            ? []
            : [
                {
                  serviceId,
                  role: value.serviceRole as ServiceRole,
                },
              ],
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="default" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />
            Ajouter un membre
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter un membre
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : "L'e-mail est nécessaire",
              }}
            >
              {(field) => (
                <field.Input
                  label="E-mail"
                  type="email"
                  placeholder="personne@exemple.fr"
                />
              )}
            </form.AppField>

            <p className="text-xs text-text-light">
              La personne doit déjà avoir créé son propre compte : ce formulaire
              ne fait que le rattacher à l'établissement.
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
            isLoading={addMember.isPending}
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddMemberForm

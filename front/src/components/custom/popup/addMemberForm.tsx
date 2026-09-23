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
import { useEstablishmentSoignantsQuery } from '../../../queries/useSoignant.ts'
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
// peut être rattaché à l'établissement sans rôle dans aucun service) : on
// lui donne une valeur explicite plutôt que de s'appuyer sur une case vide,
// que le composant `Select` ne sait pas représenter comme option.
const NO_SERVICE = 'NONE'
const NO_SERVICE_ROLE = 'NONE'

const ESTABLISHMENT_ROLE_OPTIONS = toSelectOptions(ESTABLISHMENT_ROLE_LABEL)
const SERVICE_ROLE_OPTIONS = [
  { value: NO_SERVICE_ROLE, label: 'Aucun' },
  ...toSelectOptions(SERVICE_ROLE_LABEL),
]

function AddMemberForm({ trigger }: AddMemberFormProps) {
  const [open, setOpen] = useState(false)
  const { addMember } = useMemberMutations()
  // Prefixe d'etablissement : ce formulaire s'ouvre sur un ecran sans
  // service en contexte (voir `admin/members.tsx`), ou `useSoignantQueries`
  // (prefixe de service) leverait.
  const { soignants } = useEstablishmentSoignantsQuery()
  const user = useAuthStore((state) => state.user)
  const context = useAuthStore((state) => state.context)

  const soignantOptions = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )

  // Cet écran vit sous le layout d'établissement : le contexte n'y porte
  // plus de service « courant ». Les services proposés sont donc lus dans
  // l'arbre des appartenances (`user.establishments`), pour l'établissement
  // du contexte.
  const establishmentServices = useMemo(() => {
    const establishment = user?.establishments.find(
      (e) => e.id === context?.establishmentId,
    )
    return establishment?.services ?? []
  }, [user, context?.establishmentId])

  const serviceOptions = useMemo(
    () => [
      { value: NO_SERVICE, label: 'Aucun' },
      ...[...establishmentServices]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    ],
    [establishmentServices],
  )

  const form = useAppForm({
    defaultValues: {
      email: '',
      role: 'MEMBER',
      soignantId: '',
      serviceId: NO_SERVICE,
      serviceRole: NO_SERVICE_ROLE,
    },
    onSubmit: ({ value }) => {
      if (!context) {
        return
      }
      // Une affectation de service n'est envoyée que si un service a
      // effectivement été choisi ; sans service choisi, le rôle est ignoré
      // (le champ est de toute façon désactivé dans ce cas, voir plus bas).
      const services =
        value.serviceId === NO_SERVICE || value.serviceRole === NO_SERVICE_ROLE
          ? []
          : [
              {
                serviceId: value.serviceId,
                role: value.serviceRole as ServiceRole,
              },
            ]
      addMember.mutate({
        email: value.email,
        role: value.role as EstablishmentRole,
        soignantId: value.soignantId || null,
        services,
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

            <form.AppField name="serviceId">
              {(field) => (
                <field.Select
                  label="Service"
                  options={serviceOptions}
                  clearable={false}
                />
              )}
            </form.AppField>

            {/* Reactif au service choisi ci-dessus (champ frère) : sans
            service choisi, aucun rôle de service ne peut être assigné. */}
            <form.Subscribe selector={(state) => state.values.serviceId}>
              {(serviceId) => (
                <form.AppField name="serviceRole">
                  {(field) => (
                    <field.Select
                      label="Rôle dans le service"
                      options={SERVICE_ROLE_OPTIONS}
                      clearable={false}
                      disabled={serviceId === NO_SERVICE}
                    />
                  )}
                </form.AppField>
              )}
            </form.Subscribe>
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

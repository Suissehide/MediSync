import { Check, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { InvitationSent } from '@/components/custom/invitationSent.tsx'
import {
  ESTABLISHMENT_ROLE_DESCRIPTION,
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_DESCRIPTION,
  SERVICE_ROLE_LABEL,
} from '@/constants/member.constant.ts'
import { useAppForm } from '@/hooks/formConfig.tsx'
import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
import { toSelectOptions } from '@/libs/utils.ts'
import { useMemberMutations } from '@/queries/useMembers.ts'
import { useServicesQuery } from '@/queries/useServices.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { EstablishmentRole, ServiceRole } from '@/types/auth.ts'
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
import { SoignantDuServiceSelect } from '../soignantDuServiceSelect.tsx'
import AdminServiceRole from './adminServiceRole.tsx'

const NO_SERVICE = 'NONE'
const NO_SERVICE_ROLE = 'NONE'

const ESTABLISHMENT_ROLE_OPTIONS = toSelectOptions(ESTABLISHMENT_ROLE_LABEL)
const SERVICE_ROLE_OPTIONS = [
  { value: NO_SERVICE_ROLE, label: 'Aucun' },
  ...toSelectOptions(SERVICE_ROLE_LABEL),
]

// Onglet des membres : inviter un membre. Compte créé (ou repris s'il n'est
// rattaché nulle part) avec un lien, ou, s'il exerce déjà dans un autre
// établissement, rattaché sans lien. LE LIEN RENDU EST UN MOT DE PASSE À USAGE UNIQUE : il
// s'affiche UNE SEULE FOIS, ici, avec un bouton de copie — jamais ailleurs
// (voir `useMemberMutations`, `createMemberAccount`, dont la donnée ne vit
// que dans le cache des MUTATIONS, jamais dans une clé de requête).
function CreateMemberAccountForm() {
  const [open, setOpen] = useState(false)
  const { createMemberAccount } = useMemberMutations()
  const establishmentId = useAuthStore(
    (state) => state.context?.establishmentId ?? '',
  )
  // Les services PROPOSÉS sont
  // la liste COMPLÈTE de l'établissement courant
  // (`GET /e/:establishmentId/admin/services`), jamais celle de
  // l'administrateur connecté (`user.establishments[].services`, données de
  // `/me`) — sans quoi un administrateur membre d'un seul service de
  // l'établissement ne peut affecter personne à l'autre. Même source
  // qu'`EditMemberForm` (`useServicesQuery`).
  const {
    services,
    isPending: servicesPending,
    error: servicesError,
  } = useServicesQuery()

  const serviceOptions = useMemo(
    () => [
      { value: NO_SERVICE, label: 'Aucun' },
      ...[...(services ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({
          value: s.id,
          label: s.deactivatedAt !== null ? `${s.name} (désactivé)` : s.name,
        })),
    ],
    [services],
  )

  const form = useAppForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'MEMBER',
      serviceId: NO_SERVICE,
      serviceRole: NO_SERVICE_ROLE,
      soignantId: null as string | null,
    },
    onSubmit: ({ value }) => {
      const services =
        value.serviceId === NO_SERVICE || value.serviceRole === NO_SERVICE_ROLE
          ? []
          : [
              {
                serviceId: value.serviceId,
                role: value.serviceRole as ServiceRole,
                soignantId: value.soignantId,
              },
            ]
      createMemberAccount.mutate({
        email: value.email,
        firstName: value.firstName || undefined,
        lastName: value.lastName || undefined,
        role: value.role as EstablishmentRole,
        services,
      })
    },
  })

  const closeAndReset = () => {
    setOpen(false)
    createMemberAccount.reset()
  }

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  const created = createMemberAccount.data

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}
    >
      <PopupTrigger asChild>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Inviter un membre
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {created ? 'Invitation envoyée' : 'Inviter un membre'}
          </PopupTitle>
        </PopupHeader>

        {created ? (
          <>
            <PopupBody>
              <InvitationSent
                email={createMemberAccount.variables?.email ?? ''}
                link={
                  created.accessLink
                    ? buildAccessLinkUrl(created.accessLink.token)
                    : null
                }
                existingAccountMessage="Elle avait déjà un compte MediSync : un e-mail l'a prévenue, elle se connecte avec son mot de passe habituel."
              />
            </PopupBody>
            <PopupFooter>
              <Button variant="default" onClick={closeAndReset}>
                <Check className="w-4 h-4" />
                Fermer
              </Button>
            </PopupFooter>
          </>
        ) : (
          <>
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
                  Cette adresse ne doit avoir AUCUN compte existant : pour
                  rattacher un compte déjà créé, utilisez plutôt « Ajouter un
                  membre ».
                </p>

                <form.AppField name="firstName">
                  {(field) => <field.Input label="Prénom" />}
                </form.AppField>

                <form.AppField name="lastName">
                  {(field) => <field.Input label="Nom" />}
                </form.AppField>

                <form.AppField name="role">
                  {(field) => (
                    <field.Select
                      label="Rôle établissement"
                      options={ESTABLISHMENT_ROLE_OPTIONS}
                      clearable={false}
                      description={
                        ESTABLISHMENT_ROLE_DESCRIPTION[
                          field.state.value as EstablishmentRole
                        ]
                      }
                    />
                  )}
                </form.AppField>

                <form.AppField
                  name="serviceId"
                  listeners={{
                    onChange: () => form.setFieldValue('soignantId', null),
                  }}
                >
                  {(field) => (
                    <field.Select
                      label="Service"
                      options={serviceOptions}
                      clearable={false}
                    />
                  )}
                </form.AppField>
                {servicesPending && (
                  <p className="text-xs text-text-light">
                    Chargement des services...
                  </p>
                )}
                {!servicesPending && servicesError && (
                  <p className="text-xs text-destructive">
                    Impossible de charger les services.
                  </p>
                )}

                {/* Chef d'établissement : coordinateur de tous les services, pas de
                rôle à choisir. Sinon, pas de rôle sans service choisi. */}
                <form.Subscribe
                  selector={(state) => [
                    state.values.role,
                    state.values.serviceId,
                  ]}
                >
                  {([role, serviceId]) =>
                    role === 'ADMIN' ? (
                      <AdminServiceRole
                        id="serviceRole"
                        label="Rôle dans le service"
                      />
                    ) : (
                      <form.AppField name="serviceRole">
                        {(field) => (
                          <field.Select
                            label="Rôle dans le service"
                            options={SERVICE_ROLE_OPTIONS}
                            clearable={false}
                            disabled={serviceId === NO_SERVICE}
                            description={
                              serviceId === NO_SERVICE
                                ? undefined
                                : SERVICE_ROLE_DESCRIPTION[
                                    field.state.value as ServiceRole
                                  ]
                            }
                          />
                        )}
                      </form.AppField>
                    )
                  }
                </form.Subscribe>

                <form.Subscribe
                  selector={(state) => [
                    state.values.role,
                    state.values.serviceId,
                    state.values.serviceRole,
                  ]}
                >
                  {([role, serviceId, serviceRole]) =>
                    role !== 'ADMIN' &&
                    serviceId !== NO_SERVICE &&
                    serviceRole !== NO_SERVICE_ROLE && (
                      <form.Field name="soignantId">
                        {(field) => (
                          <SoignantDuServiceSelect
                            establishmentId={establishmentId}
                            serviceId={serviceId}
                            value={field.state.value}
                            onChange={field.handleChange}
                          />
                        )}
                      </form.Field>
                    )
                  }
                </form.Subscribe>
              </form>
            </PopupBody>

            <PopupFooter>
              <Button variant="outline" onClick={closeAndReset}>
                <X className="w-4 h-4" />
                Annuler
              </Button>
              <Button
                variant="default"
                onClick={() => form.handleSubmit()}
                isLoading={createMemberAccount.isPending}
              >
                <Check className="w-4 h-4" />
                Inviter
              </Button>
            </PopupFooter>
          </>
        )}
      </PopupContent>
    </Popup>
  )
}

export default CreateMemberAccountForm

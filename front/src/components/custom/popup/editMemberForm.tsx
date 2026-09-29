import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { toSelectOptions } from '../../../libs/utils.ts'
import { useMemberMutations } from '../../../queries/useMembers.ts'
import { useServicesQuery } from '../../../queries/useServices.ts'
import type { EstablishmentRole, ServiceRole } from '../../../types/auth.ts'
import type { Member, MemberServiceAssignment } from '../../../types/member.ts'
import type { Service } from '../../../types/service.ts'
import { Button } from '../../ui/button.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'
import { Select } from '../../ui/select.tsx'

interface EditMemberFormProps {
  member: Member
}

export const NO_SERVICE_ROLE = 'NONE'

const ESTABLISHMENT_ROLE_OPTIONS = toSelectOptions(ESTABLISHMENT_ROLE_LABEL)
const SERVICE_ROLE_OPTIONS = [
  { value: NO_SERVICE_ROLE, label: 'Aucun' },
  ...toSelectOptions(SERVICE_ROLE_LABEL),
]

// Construit les affectations de service à envoyer à la mise à jour, à
// partir des rôles choisis à l'écran pour la liste de services MONTRÉE
// (`services`, la liste COMPLÈTE de l'établissement — voir `EditMemberForm`
// plus bas). LA MISE À JOUR REMPLACE L'ENSEMBLE DES AFFECTATIONS CÔTÉ BACK
// : une affectation à un service qui n'apparaîtrait pas dans `services`
// (liste pas encore chargée, ou service disparu de la liste courante pour
// toute autre raison) doit donc être reportée TELLE QUELLE plutôt
// qu'effacée en silence — c'est la propriété que l'ancien code protégeait
// déjà (à raison) pour les services hors du contexte courant ; elle vaut
// maintenant pour tout service absent de la liste montrée, quelle qu'en
// soit la cause. Fonction pure, testée indépendamment du rendu : chaque
// service se règle indépendamment des autres (multi-service, un rôle par
// service — `ServiceMembership`, back/prisma/schema.prisma, une ligne par
// couple membre/service).
export function buildServiceAssignments({
  services,
  serviceRoles,
  existingMemberships,
}: {
  services: { id: string }[]
  serviceRoles: Record<string, string>
  existingMemberships: MemberServiceAssignment[]
}): MemberServiceAssignment[] {
  const shownServiceIds = new Set(services.map((service) => service.id))
  const orphanMemberships = existingMemberships.filter(
    (membership) => !shownServiceIds.has(membership.serviceId),
  )
  const chosenAssignments = services
    .filter((service) => {
      const role = serviceRoles[service.id]
      return role !== undefined && role !== NO_SERVICE_ROLE
    })
    .map((service) => ({
      serviceId: service.id,
      role: serviceRoles[service.id] as ServiceRole,
    }))
  return [...orphanMemberships, ...chosenAssignments]
}

// Valeurs par défaut du sélecteur de rôle de chaque service MONTRÉ : le
// rôle déjà affecté au membre s'il existe, « Aucun » sinon.
function buildDefaultServiceRoles(
  services: { id: string }[],
  existingMemberships: MemberServiceAssignment[],
): Record<string, string> {
  const roleByServiceId = new Map(
    existingMemberships.map((membership) => [
      membership.serviceId,
      membership.role,
    ]),
  )
  return Object.fromEntries(
    services.map((service) => [
      service.id,
      roleByServiceId.get(service.id) ?? NO_SERVICE_ROLE,
    ]),
  )
}

function EditMemberForm({ member }: EditMemberFormProps) {
  const [open, setOpen] = useState(false)
  const { updateMember } = useMemberMutations()
  // Aucun soignant ici : ils sont propres a chaque service depuis le
  // 2026-09-29, et le coordinateur rattache les membres depuis son service.
  // Les services PROPOSÉS sont la liste COMPLÈTE de l'établissement
  // courant (`GET /e/:establishmentId/admin/services`, déjà listée par
  // l'onglet des services, `admin/services.tsx`) — jamais celle d'un
  // contexte de service qui n'existe pas sur cet écran. Puisque l'écran a
  // désormais cette liste complète, il n'y a plus de raison d'en cacher
  // aucune : un membre peut être affecté à plusieurs services, avec un rôle
  // par service (`ServiceMembership`, back/prisma/schema.prisma, une seule
  // contrainte d'unicité par COUPLE membre/service, pas par membre).
  const {
    services,
    isPending: servicesPending,
    error: servicesError,
  } = useServicesQuery()

  const sortedServices = useMemo(
    () =>
      [...(services ?? [])].sort((a: Service, b: Service) =>
        a.name.localeCompare(b.name, 'fr'),
      ),
    [services],
  )

  // Rôle choisi pour chaque service MONTRÉ, tenu à part du reste du
  // formulaire (liste dynamique, une entrée par service de l'établissement,
  // pas une forme fixe que `useAppForm` connaîtrait à l'avance).
  const [serviceRoles, setServiceRoles] = useState<Record<string, string>>({})

  const form = useAppForm({
    defaultValues: {
      role: member.role,
    },
    onSubmit: ({ value }) => {
      const servicesPayload = buildServiceAssignments({
        services: sortedServices,
        serviceRoles,
        existingMemberships: member.serviceMemberships,
      })
      updateMember.mutate({
        id: member.id,
        role: value.role as EstablishmentRole,
        services: servicesPayload,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        role: member.role,
      })
      setServiceRoles(
        buildDefaultServiceRoles(sortedServices, member.serviceMemberships),
      )
    }
    // `sortedServices` en dépendance : la liste des services peut finir de
    // charger APRÈS l'ouverture (requête encore en vol) — sans cette
    // dépendance, les sélecteurs resteraient figés sur une liste vide.
  }, [open, member, sortedServices, form])

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

            <div className="space-y-2">
              <Label>Services</Label>

              {servicesPending && (
                <p className="text-sm text-text-light">
                  Chargement des services...
                </p>
              )}

              {!servicesPending && servicesError && (
                <p className="text-sm text-destructive">
                  Impossible de charger les services.
                </p>
              )}

              {!servicesPending &&
                !servicesError &&
                sortedServices.length === 0 && (
                  <p className="text-sm text-text-light">
                    Aucun service dans cet établissement.
                  </p>
                )}

              {!servicesPending &&
                !servicesError &&
                sortedServices.map((service) => {
                  const fieldId = `edit-member-service-role-${service.id}`
                  return (
                    <div key={service.id} className="flex items-center gap-2">
                      <Label htmlFor={fieldId} className="flex-1 truncate">
                        {service.name}
                        {service.deactivatedAt !== null && ' (désactivé)'}
                      </Label>
                      <Select
                        id={fieldId}
                        className="w-44"
                        options={SERVICE_ROLE_OPTIONS}
                        clearable={false}
                        value={serviceRoles[service.id] ?? NO_SERVICE_ROLE}
                        onValueChange={(value) =>
                          setServiceRoles((prev) => ({
                            ...prev,
                            [service.id]: value,
                          }))
                        }
                      />
                    </div>
                  )
                })}
            </div>
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

import { useStore } from '@tanstack/react-form'
import { Check, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useServiceMemberMutations } from '../../../queries/useServiceMembers.ts'
import type { ServiceMember } from '../../../types/serviceMember.ts'
import type { Soignant } from '../../../types/soignant.ts'
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

// Rattacher des comptes du service a un soignant (2026-09-29) : le soignant est un metier du
// service, et le compte qui l'incarne ici voit ses taches. Un compte n'incarne qu'UN soignant par
// service : le cocher ici le retire du soignant qu'il incarnait jusque-la.
export const nomDuCompte = (member: ServiceMember) => {
  const nom = [member.user.firstName, member.user.lastName]
    .filter(Boolean)
    .join(' ')
  return nom || member.user.email
}

type EditSoignantAccountsFormProps = {
  soignant: Soignant
  members: ServiceMember[]
}

function EditSoignantAccountsForm({
  soignant,
  members,
}: EditSoignantAccountsFormProps) {
  const [open, setOpen] = useState(false)
  const { setSoignant } = useServiceMemberMutations()

  const actuels = useMemo(
    () => members.filter((m) => m.soignantId === soignant.id).map((m) => m.id),
    [members, soignant.id],
  )
  // Toutes les ecritures partent ensemble et la fenetre ne se ferme qu'une fois qu'elles ont
  // abouti ; un echec laisse la fenetre ouverte, avec le message d'erreur de la mutation.
  const form = useAppForm({
    defaultValues: { choisis: actuels },
    onSubmit: async ({ value }) => {
      const ajouts = value.choisis.filter((id) => !actuels.includes(id))
      const retraits = actuels.filter((id) => !value.choisis.includes(id))
      try {
        await Promise.all([
          ...ajouts.map((affectationId) =>
            setSoignant.mutateAsync({ affectationId, soignantId: soignant.id }),
          ),
          ...retraits.map((affectationId) =>
            setSoignant.mutateAsync({ affectationId, soignantId: null }),
          ),
        ])
        setOpen(false)
      } catch {
        // Deja signale par le toast d'erreur de `useServiceMemberMutations`.
      }
    },
  })
  const enCours = useStore(form.store, (state) => state.isSubmitting)

  // La selection repart de l'etat enregistre a l'OUVERTURE seulement : un rafraichissement de la
  // liste des membres pendant que la fenetre est ouverte ne doit pas effacer ce que le
  // coordinateur est en train de cocher.
  const changerOuverture = (ouvert: boolean) => {
    if (ouvert) {
      form.reset({ choisis: actuels })
    }
    setOpen(ouvert)
  }

  const options = useMemo(
    () =>
      [...members]
        .sort((a, b) => nomDuCompte(a).localeCompare(nomDuCompte(b), 'fr'))
        .map((m) => ({ value: m.id, label: nomDuCompte(m) })),
    [members],
  )

  return (
    <Popup modal={true} open={open} onOpenChange={changerOuverture}>
      <PopupTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Comptes rattachés à ${soignant.name}`}
          onClick={() => changerOuverture(true)}
        >
          <UserRound className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Comptes rattachés à {soignant.name}
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="flex flex-col gap-2"
          >
            <form.AppField name="choisis">
              {(field) => (
                <field.MultiSelect
                  label="Membres du service"
                  options={options}
                  placeholder="Aucun compte"
                />
              )}
            </form.AppField>
            <p className="text-sm text-text-light">
              Un compte n'incarne qu'un soignant dans ce service : le rattacher
              ici le retire de son soignant actuel.
            </p>
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
            isLoading={enCours}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default EditSoignantAccountsForm

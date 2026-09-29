import { Check, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useServiceMemberMutations } from '../../../queries/useServiceMembers.ts'
import type { ServiceMember } from '../../../types/serviceMember.ts'
import type { Soignant } from '../../../types/soignant.ts'
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
import { MultiSelect } from '../../ui/select.tsx'

// Rattacher des comptes du service a un soignant (2026-09-29) : le soignant est un metier du
// service, et le compte qui l'incarne ici voit ses taches. Un compte n'incarne qu'UN soignant par
// service : le cocher ici le retire du soignant qu'il incarnait jusque-la.
export const nomDuCompte = (member: ServiceMember) => {
  const nom = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ')
  return nom || member.user.email
}

type EditSoignantAccountsFormProps = {
  soignant: Soignant
  members: ServiceMember[]
}

function EditSoignantAccountsForm({ soignant, members }: EditSoignantAccountsFormProps) {
  const [open, setOpen] = useState(false)
  const { setSoignant } = useServiceMemberMutations()

  const actuels = useMemo(
    () => members.filter((m) => m.soignantId === soignant.id).map((m) => m.id),
    [members, soignant.id],
  )
  const [choisis, setChoisis] = useState<string[]>(actuels)

  useEffect(() => {
    if (open) {
      setChoisis(actuels)
    }
  }, [open, actuels])

  const options = useMemo(
    () =>
      [...members]
        .sort((a, b) => nomDuCompte(a).localeCompare(nomDuCompte(b), 'fr'))
        .map((m) => ({ value: m.id, label: nomDuCompte(m) })),
    [members],
  )

  const enregistrer = () => {
    for (const affectationId of choisis.filter((id) => !actuels.includes(id))) {
      setSoignant.mutate({ affectationId, soignantId: soignant.id })
    }
    for (const affectationId of actuels.filter((id) => !choisis.includes(id))) {
      setSoignant.mutate({ affectationId, soignantId: null })
    }
    setOpen(false)
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Comptes rattachés à ${soignant.name}`}
          onClick={() => setOpen(true)}
        >
          <UserRound className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">Comptes rattachés à {soignant.name}</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Membres du service</Label>
            <MultiSelect
              options={options}
              value={choisis}
              onChange={setChoisis}
              placeholder="Aucun compte"
            />
            <p className="text-sm text-text-light">
              Un compte n'incarne qu'un soignant dans ce service : le rattacher ici le retire de son
              soignant actuel.
            </p>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button variant="default" onClick={enregistrer}>
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default EditSoignantAccountsForm

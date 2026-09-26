import { Check, ShieldCheck, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSuperAdminCreateGrant } from '../../../queries/useSuperAdmin.ts'
import { useLastGrantStore } from '../../../store/useLastGrantStore.ts'
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

interface CreateGrantFormProps {
  // Établissement de l'écran de détail sur lequel ce bouton est monté — une
  // DONNÉE reçue en props, pas un tenant implicite (ce composant ne vit ni
  // dans `src/api` ni dans `src/queries`, la convention front/CLAUDE.md sur
  // le tenant implicite ne le couvre pas).
  establishmentId: string
  trigger?: React.ReactNode
}

const DEFAULT_DURATION_HOURS = 4
const MAX_DURATION_HOURS = 24

// « bouton d'octroi avec motif obligatoire et durée » (task-12-brief.md,
// step 2). Deux gardes CÔTÉ FORMULAIRE, en écho aux deux exigences du
// schéma back (`createGrantSchema`, superAdminGrant.schema.ts) : un motif
// vide est refusé, une durée hors de ]0, 24] aussi — avant même d'atteindre
// le réseau, pour ne pas laisser croire qu'un octroi a été demandé quand il
// ne l'a pas été.
function CreateGrantForm({ establishmentId, trigger }: CreateGrantFormProps) {
  const [open, setOpen] = useState(false)
  const createGrant = useSuperAdminCreateGrant()
  const recordGrant = useLastGrantStore((state) => state.recordGrant)

  const form = useAppForm({
    defaultValues: {
      reason: '',
      durationHours: DEFAULT_DURATION_HOURS as number | undefined,
    },
    onSubmit: ({ value }) => {
      if (value.reason.trim().length === 0) {
        return
      }
      if (
        value.durationHours === undefined ||
        value.durationHours <= 0 ||
        value.durationHours > MAX_DURATION_HOURS
      ) {
        return
      }
      createGrant.mutate(
        {
          establishmentId,
          reason: value.reason.trim(),
          durationHours: value.durationHours,
        },
        {
          onSuccess: (grant) => {
            // Le seul moment où le front voit l'identifiant de cet octroi
            // (voir `useLastGrantStore.ts`) : sans ce rappel,
            // `ActiveGrantNotice` ne pourrait jamais proposer de le
            // révoquer.
            recordGrant(establishmentId, grant.id)
            setOpen(false)
          },
        },
      )
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
            <ShieldCheck className="w-4 h-4" />
            S'accorder un accès
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            S'accorder un accès temporaire
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
            <p className="text-xs text-text-light">
              Cet octroi vous donne, à vous seul, un accès temporaire à cet
              établissement. Il est journalisé sous votre identité réelle.
            </p>

            <form.AppField
              name="reason"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim().length === 0
                    ? 'Le motif est obligatoire'
                    : undefined,
              }}
            >
              {(field) => (
                <field.TextArea
                  label="Motif (obligatoire)"
                />
              )}
            </form.AppField>

            <form.AppField
              name="durationHours"
              validators={{
                onSubmit: ({ value }) =>
                  value === undefined || value <= 0 || value > MAX_DURATION_HOURS
                    ? 'La durée doit être comprise entre 1 et 24 heures'
                    : undefined,
              }}
            >
              {(field) => (
                <field.Number
                  label="Durée (heures)"
                  min={1}
                  max={MAX_DURATION_HOURS}
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
            isLoading={createGrant.isPending}
          >
            <Check className="w-4 h-4" />
            S'accorder l'accès
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default CreateGrantForm

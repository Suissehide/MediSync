import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CopyableId } from '@/components/custom/copyableId.tsx'
import { useAppForm } from '@/hooks/formConfig.tsx'
import { useSuperAdminCreateEstablishment } from '@/queries/useSuperAdmin.ts'

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

// Liste des établissements (`super-admin/index.tsx`) : le back expose la
// création (`POST /super-admin/establishments`, tâche 6) mais aucun écran
// ne l'appelait — retiré à tort à la tâche 12 (tour de correction 1,
// Important n°5) en même temps que le client d'API, faute d'écran ET de
// garde. Réintroduit ici avec les deux à la fois.
//
// LE LIEN D'ACCÈS RENDU EST UN MOT DE PASSE À USAGE UNIQUE (même motif que
// `createMemberAccountForm.tsx`, tâche 13) : il s'affiche UNE SEULE FOIS,
// ici, avec un bouton de copie — jamais ailleurs (voir
// `useSuperAdminCreateEstablishment`, dont la donnée ne vit que dans le
// cache des MUTATIONS, jamais dans une clé de requête).
function CreateEstablishmentForm() {
  const [open, setOpen] = useState(false)
  const createEstablishment = useSuperAdminCreateEstablishment()

  const form = useAppForm({
    defaultValues: {
      name: '',
      email: '',
      firstName: '',
      lastName: '',
    },
    onSubmit: ({ value }) => {
      createEstablishment.mutate({
        name: value.name,
        email: value.email,
        firstName: value.firstName || undefined,
        lastName: value.lastName || undefined,
      })
    },
  })

  const closeAndReset = () => {
    setOpen(false)
    createEstablishment.reset()
  }

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  const created = createEstablishment.data

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}
    >
      <PopupTrigger asChild>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Créer un établissement
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {created ? 'Établissement créé' : 'Créer un établissement'}
          </PopupTitle>
        </PopupHeader>

        {created ? (
          <>
            <PopupBody>
              <div className="bg-input p-3 rounded-lg flex flex-col gap-1">
                <p className="text-xs text-text-light">
                  Lien à usage unique — transmettez-le en main propre, il ne
                  sera plus jamais affiché.
                </p>
                <CopyableId value={created.accessLink.token} />
              </div>
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
                  name="name"
                  validators={{
                    onSubmit: ({ value }) =>
                      value ? undefined : "Le nom de l'établissement est nécessaire",
                  }}
                >
                  {(field) => (
                    <field.Input
                      label="Nom de l'établissement"
                      placeholder="CHU de..."
                    />
                  )}
                </form.AppField>

                <p className="text-xs text-text-light">
                  Identité du premier administrateur de cet établissement.
                  Une adresse déjà connue de la plateforme garde son propre
                  compte, sans qu'aucune information dessus ne soit révélée
                  ici au-delà de ce lien.
                </p>

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

                <form.AppField name="firstName">
                  {(field) => <field.Input label="Prénom" />}
                </form.AppField>

                <form.AppField name="lastName">
                  {(field) => <field.Input label="Nom" />}
                </form.AppField>
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
                isLoading={createEstablishment.isPending}
              >
                <Check className="w-4 h-4" />
                Créer
              </Button>
            </PopupFooter>
          </>
        )}
      </PopupContent>
    </Popup>
  )
}

export default CreateEstablishmentForm

import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CopyableId } from '@/components/custom/copyableId.tsx'
import {
  SERVICE_ROLE_DESCRIPTION,
  SERVICE_ROLE_LABEL,
} from '@/constants/member.constant.ts'
import { useAppForm } from '@/hooks/formConfig.tsx'
import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
import { toSelectOptions } from '@/libs/utils.ts'
import { useServiceMemberMutations } from '@/queries/useServiceMembers.ts'
import type { ServiceRole } from '@/types/auth.ts'
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

// MDS-17 : le coordinateur invite dans SON service. Ni service ni role d'etablissement a choisir
// — le back pose le premier depuis le tenant resolu, et le second est toujours « Membre ».
//
// DEUX ISSUES, ET LA POPUP LES DISTINGUE. Une adresse sans compte ici recoit un LIEN DE PREMIERE
// CONNEXION, affiche UNE SEULE FOIS (c'est un mot de passe a usage unique) ; un compte deja
// rattache a l'etablissement n'en recoit aucun — il a deja le sien. Rien d'autre n'est rendu par
// la route, a dessein : le nom stocke et l'identifiant d'un compte preexistant seraient des
// oracles d'existence (voir `inviteToService`, back).
function InviteServiceMemberForm() {
  const [open, setOpen] = useState(false)
  const { inviteMember } = useServiceMemberMutations()

  const form = useAppForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'INTERVENANT',
    },
    onSubmit: ({ value }) => {
      inviteMember.mutate({
        email: value.email,
        firstName: value.firstName || undefined,
        lastName: value.lastName || undefined,
        role: value.role as ServiceRole,
      })
    },
  })

  const closeAndReset = () => {
    setOpen(false)
    inviteMember.reset()
  }

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  const invited = inviteMember.data

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}
    >
      <PopupTrigger asChild>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Inviter
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {invited ? 'Invitation envoyée' : 'Inviter dans le service'}
          </PopupTitle>
        </PopupHeader>

        {invited ? (
          <>
            <PopupBody>
              {invited.accessLink ? (
                <div className="bg-input p-3 rounded-lg flex flex-col gap-1">
                  <p className="text-xs text-text-light">
                    Lien à usage unique — transmettez-le en main propre, il ne
                    sera plus jamais affiché.
                  </p>
                  <CopyableId
                    value={buildAccessLinkUrl(invited.accessLink.token)}
                  />
                </div>
              ) : (
                <p className="text-sm text-text-light">
                  Ce compte existait déjà dans l'établissement : il accède au
                  service avec son mot de passe habituel, il n'y a aucun lien à
                  transmettre.
                </p>
              )}
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
                  Si cette adresse a déjà un compte dans l'établissement, elle
                  est simplement affectée à ce service. Sinon, un compte est
                  créé et un lien de première connexion s'affiche ici.
                </p>

                {/* Prénom et nom ne servent qu'au compte CRÉÉ : un compte existant garde
                le sien, jamais écrasé. */}
                <form.AppField name="firstName">
                  {(field) => <field.Input label="Prénom" />}
                </form.AppField>

                <form.AppField name="lastName">
                  {(field) => <field.Input label="Nom" />}
                </form.AppField>

                <form.AppField name="role">
                  {(field) => (
                    <field.Select
                      label="Rôle dans le service"
                      options={SERVICE_ROLE_OPTIONS}
                      clearable={false}
                      description={
                        SERVICE_ROLE_DESCRIPTION[
                          field.state.value as ServiceRole
                        ]
                      }
                    />
                  )}
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
                isLoading={inviteMember.isPending}
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

export default InviteServiceMemberForm

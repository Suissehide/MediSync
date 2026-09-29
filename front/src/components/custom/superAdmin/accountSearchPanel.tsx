import dayjs from 'dayjs'
import { Check, KeyRound, Search, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { CopyableId } from '../../../components/custom/copyableId.tsx'
import { buildAccessLinkUrl } from '../../../libs/accessLink.ts'
import {
  useSuperAdminAccountSearch,
  useSuperAdminReissueAccessLink,
} from '../../../queries/useSuperAdmin.ts'
import { Button } from '../../ui/button.tsx'
import { Card } from '../../ui/card.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

const ESTABLISHMENT_ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
}

// « la recherche d'un compte, qui répond à "untel ne voit plus ses
// patients" » (task-12-brief.md, step 3) — rattachements, rôles,
// désactivations, dernier accès ; jamais un contenu de dossier patient (le
// back ne le rend d'ailleurs pas, voir `superAdminUser.schema.ts`).
//
// LE JETON RENDU PAR LA RÉÉMISSION EST UN MOT DE PASSE À USAGE UNIQUE : il
// ne vit que dans l'état local de la mutation (`reissue.data`, ci-dessous),
// jamais dans une clé de requête, une URL ou une trace de console. Ce
// composant ne l'écrit nulle part d'autre que dans le `<CopyableId>` qui
// l'affiche — verrouillé par `accountSearchPanel.test.tsx`.
export const AccountSearchPanel = () => {
  const [email, setEmail] = useState('')
  const [confirmingReissue, setConfirmingReissue] = useState(false)
  const search = useSuperAdminAccountSearch()
  const reissue = useSuperAdminReissueAccessLink()

  const account = search.data

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (trimmed.length === 0) {
      return
    }
    reissue.reset()
    setConfirmingReissue(false)
    search.mutate(trimmed)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSearch} className="flex items-end gap-2 max-w-lg">
        <div className="flex flex-col gap-1 flex-1">
          <Label htmlFor="super-admin-account-search">Adresse e-mail</Label>
          <Input
            id="super-admin-account-search"
            type="email"
            placeholder="personne@exemple.fr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button type="submit" isLoading={search.isPending}>
          <Search className="w-4 h-4" />
          Rechercher
        </Button>
      </form>

      {account && (
        <Card className="max-w-lg flex flex-col gap-3">
          <div>
            <div className="font-semibold text-text-dark">
              {[account.firstName, account.lastName]
                .filter(Boolean)
                .join(' ') || account.email}
            </div>
            <div className="text-sm text-text-light">{account.email}</div>
            <CopyableId value={account.id} />
          </div>

          <div className="text-sm">
            <span className="text-text-light">Statut : </span>
            {account.deactivatedAt !== null ? 'Désactivé' : 'Actif'}
          </div>

          <div className="text-sm">
            <span className="text-text-light">Dernier accès : </span>
            {account.lastLoginAt
              ? dayjs.utc(account.lastLoginAt).format('DD/MM/YYYY HH:mm')
              : 'Jamais'}
          </div>

          <div>
            <div className="text-sm text-text-light mb-1">Rattachements</div>
            {account.memberships.length === 0 ? (
              <div className="text-sm text-text-light">Aucun</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {account.memberships.map((membership) => (
                  <li
                    key={membership.establishmentId}
                    className="flex justify-between text-sm border-b border-border py-1"
                  >
                    <span>{membership.establishmentName}</span>
                    <span className="text-text-light">
                      {ESTABLISHMENT_ROLE_LABEL[membership.role] ??
                        membership.role}
                      {' · depuis le '}
                      {dayjs.utc(membership.createdAt).format('DD/MM/YYYY')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => setConfirmingReissue(true)}
            isLoading={reissue.isPending}
          >
            <KeyRound className="w-4 h-4" />
            Réémettre un lien d'accès
          </Button>

          {/* Tour de correction 1, Mineur : un mot de passe à usage unique
          sur le compte D'AUTRUI ne part jamais sur un simple clic. */}
          <Popup
            modal
            open={confirmingReissue}
            onOpenChange={setConfirmingReissue}
          >
            <PopupContent>
              <PopupHeader>
                <PopupTitle className="font-bold text-xl">
                  Réémettre le lien d'accès ?
                </PopupTitle>
              </PopupHeader>
              <PopupBody>
                <p className="text-sm text-text-light">
                  Un nouveau lien à usage unique sera généré pour{' '}
                  <strong>{account.email}</strong>. Confirmez-vous ?
                </p>
              </PopupBody>
              <PopupFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmingReissue(false)}
                >
                  <X className="w-4 h-4" />
                  Annuler
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    setConfirmingReissue(false)
                    reissue.mutate(account.id)
                  }}
                  isLoading={reissue.isPending}
                >
                  <Check className="w-4 h-4" />
                  Confirmer la réémission
                </Button>
              </PopupFooter>
            </PopupContent>
          </Popup>

          {reissue.data && (
            <div className="bg-input p-3 rounded-lg flex flex-col gap-1">
              <p className="text-xs text-text-light">
                Lien à usage unique — transmettez-le en main propre, il ne sera
                plus jamais affiché.
              </p>
              <CopyableId
                value={buildAccessLinkUrl(reissue.data.accessLink.token)}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

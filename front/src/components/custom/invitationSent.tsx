import { Check, Copy, MailCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'

import { useToast } from '../../hooks/useToast.ts'
import { Button } from '../ui/button.tsx'

// Résultat d'une invitation : le message, puis le lien à part (s'il y en a un), jamais dans un encart commun.
export const InvitationSent = ({
  email,
  link,
  existingAccountMessage,
}: {
  email: string
  link: string | null
  existingAccountMessage: string
}) => {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!link) {
      return
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    toast({ title: 'Lien copié' })
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (!link) {
    return (
      <div className="flex items-start gap-3">
        <UserCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-text-dark">
          <strong className="font-semibold">{email}</strong> a été ajouté(e).{' '}
          {existingAccountMessage}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <MailCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-text-dark">
          Un e-mail d'invitation a été envoyé à{' '}
          <strong className="font-semibold">{email}</strong>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-dark">
          Lien d'invitation
        </span>
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate select-all font-mono text-xs text-text-dark px-3 py-2 rounded-md border border-border">
            {link}
          </span>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? 'Copié' : 'Copier le lien'}
          </Button>
        </div>
        <p className="text-xs text-text-light">
          Utile si l'e-mail n'arrive pas. Usage unique, valable 30 jours : il ne
          sera plus jamais affiché.
        </p>
      </div>
    </div>
  )
}

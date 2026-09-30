import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { useToast } from '../../hooks/useToast.ts'
import { Button } from '../ui/button.tsx'

interface CopyableIdProps {
  value: string
  className?: string
}

// Écrans du super-admin : « les identifiants copiables »
// — le support recoupe un identifiant avec un journal ou une base, il ne le
// ressaisit jamais à la main. Utilisé dans une ligne de tableau cliquable
// (navigation vers le détail) : `stopPropagation` empêche le clic de copie
// de déclencher aussi la navigation de la ligne.
export const CopyableId = ({ value, className }: CopyableIdProps) => {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast({ title: 'Identifiant copié' })
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="font-mono text-xs text-text-light truncate">
        {value}
      </span>
      <Button
        variant="none"
        size="icon-sm"
        onClick={handleCopy}
        aria-label="Copier l'identifiant"
        title="Copier l'identifiant"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  )
}

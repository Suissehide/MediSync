import { Circle, Image, Square, Type } from 'lucide-react'

import { cn } from '../../../../libs/utils.ts'
import { Button } from '../../../ui/button.tsx'
import { Label } from '../../../ui/label.tsx'
import { Switch } from '../../../ui/switch.tsx'
import type { KindElement } from './elements.ts'

const OUTILS: { kind: KindElement; label: string; Icone: typeof Type }[] = [
  { kind: 'text', label: 'Texte', Icone: Type },
  { kind: 'rect', label: 'Rectangle', Icone: Square },
  { kind: 'ellipse', label: 'Ellipse', Icone: Circle },
  { kind: 'image', label: 'Image', Icone: Image },
]

// Au-dessus de la page plutot que dans une colonne : poser un element est un geste qui vise la
// toile, et la barre est a portee du curseur qui y travaille.
export default function BarreOutils({
  onAjouter,
  donneesExemple,
  onDonneesExemple,
  actif,
}: {
  onAjouter: (kind: KindElement) => void
  donneesExemple: boolean
  onDonneesExemple: (valeur: boolean) => void
  // Une page calendrier ne se compose pas : la barre reste visible, grisee, plutot que de
  // disparaitre et de faire sauter la page de 40 px a chaque changement de page.
  actif: boolean
}) {
  return (
    <div
      className={cn(
        'mt-3.5 p-1 flex items-center gap-1 bg-background border border-border rounded-[10px] shadow-sm',
        !actif && 'opacity-45',
      )}
    >
      {OUTILS.map(({ kind, label, Icone }) => (
        <Button
          key={kind}
          variant="transparent"
          disabled={!actif}
          className="h-8 px-2.5 text-[13px] font-medium text-foreground hover:bg-muted rounded-[7px]"
          onClick={() => onAjouter(kind)}
        >
          <Icone className="w-4 h-4" />
          {label}
        </Button>
      ))}

      <span className="w-px h-5 bg-border mx-1" />

      {/* Coupe, chaque donnee s'affiche comme une etiquette portant son nom : c'est le seul
          moyen de voir ce qui, dans un texte, changera d'un patient a l'autre. */}
      <div
        className={cn(
          'h-8 px-2.5 flex items-center gap-2 rounded-[7px]',
          donneesExemple && 'bg-blue-50',
        )}
      >
        <Switch
          id="donnees-exemple"
          checked={donneesExemple}
          onCheckedChange={onDonneesExemple}
        />
        <Label
          htmlFor="donnees-exemple"
          className={cn(
            'text-[13px] font-medium cursor-pointer',
            donneesExemple ? 'text-primary-dark' : 'text-foreground',
          )}
        >
          Données d'exemple
        </Label>
      </div>
    </div>
  )
}

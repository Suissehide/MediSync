import { Circle, Image, Square, Type } from 'lucide-react'

import { Button } from '../../../ui/button.tsx'
import type { KindElement } from './elements.ts'

const OUTILS: { kind: KindElement; label: string; Icone: typeof Type }[] = [
  { kind: 'text', label: 'Texte', Icone: Type },
  { kind: 'rect', label: 'Rectangle', Icone: Square },
  { kind: 'ellipse', label: 'Ellipse', Icone: Circle },
  { kind: 'image', label: 'Image', Icone: Image },
]

export default function Palette({
  onAjouter,
}: {
  onAjouter: (kind: KindElement) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">Ajouter</h2>
      {OUTILS.map(({ kind, label, Icone }) => (
        <Button
          key={kind}
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => onAjouter(kind)}
        >
          <Icone className="w-4 h-4" />
          {label}
        </Button>
      ))}
    </div>
  )
}

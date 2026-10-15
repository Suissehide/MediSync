import { Copy, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react'

import type { SourcesImages } from '../../../types/pdfAsset.ts'
import type { PdfDesignSummary } from '../../../types/pdfDesignList.ts'
import { MoveButtons } from '../../settings/iconButton.tsx'
import { Button } from '../../ui/button.tsx'
import Vignette from './vignette.tsx'

type DesignCardProps = {
  // `isDefault` optionnel : un MODELE LIVRE n'est le defaut d'aucun service, et l'ecran
  // super-admin monte cette meme carte.
  design: Omit<PdfDesignSummary, 'isDefault'> & { isDefault?: boolean }
  // Un modele livre est en lecture seule : il se duplique, il ne se modifie pas.
  lectureSeule: boolean
  supprime?: boolean
  onDupliquer?: () => void
  onModifier?: () => void
  onRenommer?: () => void
  onParDefaut?: () => void
  onSupprimer?: () => void
  onRestaurer?: () => void
  sources?: SourcesImages
  // Fleches d'ordre, pour l'ecran qui en a un (les modeles livres). Absentes ailleurs : les
  // designs d'un service n'ont pas d'ordre a regler.
  onMonter?: () => void
  onDescendre?: () => void
  monterImpossible?: boolean
  descendreImpossible?: boolean
}

export default function DesignCard({
  design,
  lectureSeule,
  supprime = false,
  onDupliquer,
  onModifier,
  onRenommer,
  onParDefaut,
  onSupprimer,
  onRestaurer,
  sources,
  onMonter,
  onDescendre,
  monterImpossible = false,
  descendreImpossible = false,
}: DesignCardProps) {
  const pages = design.content.pages.length
  // La premiere page en miniature : le nombre de pages ne dit pas a quoi le design ressemble.
  const premierePage = design.content.pages[0]
  return (
    <article className="border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {premierePage && (
          <Vignette page={premierePage} largeur={64} sources={sources} />
        )}
        <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">
              {design.name}
            </h3>
            <p className="text-sm text-text-light">
              {pages} page{pages > 1 ? 's' : ''}
            </p>
          </div>
          {design.isDefault && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary whitespace-nowrap">
              Par défaut
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {supprime ? (
          <Button variant="outline" size="sm" onClick={onRestaurer}>
            <RotateCcw className="w-4 h-4" />
            Restaurer
          </Button>
        ) : (
          <>
            {/* Dupliquer n'est propose que sur un modele livre : la route n'accepte qu'un
                `sourcePresetId`, et dupliquer un design du service repondrait 404. */}
            {lectureSeule ? (
              <Button variant="outline" size="sm" onClick={onDupliquer}>
                <Copy className="w-4 h-4" />
                Dupliquer
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onModifier}>
                  <Pencil className="w-4 h-4" />
                  Modifier
                </Button>
                <Button variant="outline" size="sm" onClick={onRenommer}>
                  Renommer
                </Button>
                {/* « Definir par defaut », jamais « Par defaut » : le badge porte deja ce
                    mot, et deux libelles identiques pour un etat et une action se lisent mal.
                    Absent de la carte qui est deja le defaut. */}
                {onDupliquer && (
                  <Button variant="outline" size="sm" onClick={onDupliquer}>
                    <Copy className="w-4 h-4" />
                    Dupliquer
                  </Button>
                )}
                {/* Gate sur `onParDefaut` autant que sur l'etat : un modele livre n'a pas de
                    defaut a definir, et le bouton n'a rien a faire sur sa carte. */}
                {onParDefaut && !design.isDefault && (
                  <Button variant="outline" size="sm" onClick={onParDefaut}>
                    <Star className="w-4 h-4" />
                    Définir par défaut
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onSupprimer}>
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
                {onMonter && onDescendre && (
                  <MoveButtons
                    upLabel={`Monter ${design.name}`}
                    downLabel={`Descendre ${design.name}`}
                    upDisabled={monterImpossible}
                    downDisabled={descendreImpossible}
                    onUp={onMonter}
                    onDown={onDescendre}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </article>
  )
}

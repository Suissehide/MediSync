import {
  Check,
  Copy,
  Ellipsis,
  FilePen,
  Lock,
  Pencil,
  RotateCcw,
  Star,
  TextCursorInput,
  Trash2,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'

import { cn } from '../../../libs/utils.ts'
import type { SourcesImages } from '../../../types/pdfAsset.ts'
import type { PdfDesignSummary } from '../../../types/pdfDesignList.ts'
import { MoveButtons } from '../../settings/iconButton.tsx'
import { Button } from '../../ui/button.tsx'
import Vignette from './vignette.tsx'

type DesignCardProps = {
  // `isDefault` et `isDraft` optionnels : un MODELE LIVRE n'est le defaut d'aucun service et
  // n'a pas d'etat de brouillon, et l'ecran super-admin monte cette meme carte.
  design: Omit<PdfDesignSummary, 'isDefault' | 'isDraft'> & {
    isDefault?: boolean
    isDraft?: boolean
  }
  // Un modele livre est en lecture seule : il se duplique, il ne se modifie pas.
  lectureSeule: boolean
  supprime?: boolean
  onDupliquer?: () => void
  onModifier?: () => void
  onRenommer?: () => void
  onParDefaut?: () => void
  onSupprimer?: () => void
  onRestaurer?: () => void
  // Termine le brouillon, ou y remet le design. Absent, la carte ne montre ni badge ni bascule.
  onBrouillon?: (isDraft: boolean) => void
  sources?: SourcesImages
  // Fleches d'ordre, pour l'ecran qui en a un (les modeles livres). Absentes ailleurs : les
  // designs d'un service n'ont pas d'ordre a regler.
  onMonter?: () => void
  onDescendre?: () => void
  monterImpossible?: boolean
  descendreImpossible?: boolean
}

const LARGEUR_VIGNETTE = 149

// Ce que le nombre de pages ne dit pas : si le planning du patient en fait partie.
const meta = (design: DesignCardProps['design']) => {
  const pages = design.content.pages
  const compte = `${pages.length} page${pages.length > 1 ? 's' : ''}`
  return pages.some((page) => page.kind === 'calendar')
    ? `${compte} · calendrier inclus`
    : compte
}

const Item = ({
  libelle,
  Icone,
  onSelect,
  danger = false,
}: {
  libelle: string
  Icone: typeof Copy
  onSelect: () => void
  danger?: boolean
}) => (
  <DropdownMenu.Item
    onSelect={onSelect}
    className={cn(
      'h-[34px] px-2.5 rounded-md flex items-center gap-2.5 text-sm cursor-pointer outline-none',
      'data-[highlighted]:bg-surface-douce',
      danger ? 'text-red-700' : 'text-foreground',
    )}
  >
    <Icone className="w-[15px] h-[15px]" />
    {libelle}
  </DropdownMenu.Item>
)

// Les actions secondaires d'une carte. Son propre composant : une seule action principale est
// visible, et tout le reste tient ici — l'etat du design decide de ce qui s'y trouve.
const MenuCarte = ({
  design,
  onRenommer,
  onParDefaut,
  onDupliquer,
  onBrouillon,
  onSupprimer,
}: Pick<
  DesignCardProps,
  | 'design'
  | 'onRenommer'
  | 'onParDefaut'
  | 'onDupliquer'
  | 'onBrouillon'
  | 'onSupprimer'
>) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Actions sur ${design.name}`}
        className="h-[34px] w-[34px]"
      >
        <Ellipsis className="w-4 h-4" />
      </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className="w-[210px] p-1 bg-popover border border-border rounded-[10px] shadow-[0_10px_30px_rgba(4,24,43,.14)] z-50"
      >
        {/* Gate sur le GESTE autant que sur l'etat : un bouton sans geste
            derriere etait un bouton MORT, qui ne disait pas pourquoi il ne
            faisait rien. Et un modele livre n'a pas de defaut a definir. */}
        {onRenommer && (
          <Item
            libelle="Renommer"
            Icone={TextCursorInput}
            onSelect={onRenommer}
          />
        )}
        {/* Un brouillon ne peut pas etre le defaut : il servirait a chaque
            export alors qu'il n'est pas fini. Le back le refuse aussi. */}
        {onParDefaut && !design.isDefault && !design.isDraft && (
          <Item
            libelle="Définir par défaut"
            Icone={Star}
            onSelect={onParDefaut}
          />
        )}
        {onBrouillon && (
          <Item
            libelle={design.isDraft ? 'Terminer' : 'Repasser en brouillon'}
            Icone={design.isDraft ? Check : FilePen}
            onSelect={() => onBrouillon(!design.isDraft)}
          />
        )}
        {onDupliquer && (
          <Item libelle="Dupliquer" Icone={Copy} onSelect={onDupliquer} />
        )}
        {onSupprimer && (
          <>
            <DropdownMenu.Separator className="my-1 h-px bg-muted" />
            <Item
              libelle="Supprimer"
              Icone={Trash2}
              onSelect={onSupprimer}
              danger
            />
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
)

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
  onBrouillon,
  sources,
  onMonter,
  onDescendre,
  monterImpossible = false,
  descendreImpossible = false,
}: DesignCardProps) {
  // La premiere page COMPOSABLE, pas la premiere page : un design qui commence par le
  // calendrier afficherait l'icone du planning au lieu de son visuel.
  const pages = design.content.pages
  const apercu = pages.find((page) => page.kind === 'canvas') ?? pages[0]

  return (
    <article
      className={cn(
        'flex flex-col bg-background border rounded-xl relative',
        design.isDefault ? 'border-ring' : 'border-border',
      )}
    >
      <div className="h-[236px] bg-surface-douce border-b border-border rounded-t-xl flex items-center justify-center relative">
        {apercu &&
          // Le grand apercu EST le raccourci vers l'editeur : la carte entiere serait un
          // piege au clavier, et le bouton « Modifier » plus bas ne fait pas une cible.
          (onModifier && !supprime ? (
            <button
              type="button"
              aria-label={`Ouvrir ${design.name}`}
              onClick={onModifier}
              className="cursor-pointer"
            >
              <Vignette
                page={apercu}
                largeur={LARGEUR_VIGNETTE}
                sources={sources}
                className="shadow-[0_2px_8px_rgba(4,24,43,.12)]"
              />
            </button>
          ) : (
            <Vignette
              page={apercu}
              largeur={LARGEUR_VIGNETTE}
              sources={sources}
              className="shadow-[0_2px_8px_rgba(4,24,43,.12)]"
            />
          ))}

        {design.isDraft && (
          <span className="absolute top-2.5 left-2.5 h-6 px-2.5 rounded-full bg-a-saisir-fond text-a-saisir-texte text-xs font-semibold flex items-center gap-1.5">
            <FilePen className="w-3 h-3" />
            Brouillon
          </span>
        )}
        {design.isDefault && (
          <span className="absolute top-2.5 left-2.5 h-6 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5">
            <Star className="w-3 h-3" />
            Par défaut
          </span>
        )}
        {lectureSeule && (
          <span className="absolute top-2.5 left-2.5 h-6 px-2.5 rounded-full bg-background border border-border text-text-light text-xs font-semibold flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            Lecture seule
          </span>
        )}
      </div>

      <div className="p-3 pl-3.5 flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground truncate">
            {design.name}
          </h3>
          <p className="text-[13px] text-text-light">{meta(design)}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {supprime ? (
            <Button variant="outline" className="flex-1" onClick={onRestaurer}>
              <RotateCcw className="w-4 h-4" />
              Restaurer
            </Button>
          ) : /* `lectureSeule` ne veut PAS dire « c'est un modele livre » : il veut dire
                « on ne le modifie pas d'ici ». Un modele livre vu par un SERVICE est en
                lecture seule — il ne peut que le dupliquer — alors que le meme modele, vu
                par le super-admin, ne l'est pas. */
          lectureSeule ? (
            <Button variant="outline" className="flex-1" onClick={onDupliquer}>
              <Copy className="w-4 h-4" />
              Dupliquer
            </Button>
          ) : (
            <>
              <Button
                className="flex-1 h-[34px] bg-foreground text-background hover:bg-foreground/80"
                onClick={onModifier}
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
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

              <MenuCarte
                design={design}
                onRenommer={onRenommer}
                onParDefaut={onParDefaut}
                onDupliquer={onDupliquer}
                onBrouillon={onBrouillon}
                onSupprimer={onSupprimer}
              />
            </>
          )}
        </div>
      </div>
    </article>
  )
}

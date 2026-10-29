import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  BringToFront,
  Circle,
  Copy,
  FoldVertical,
  Image,
  Italic,
  Plus,
  SendToBack,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'

import { cn } from '../../../../libs/utils.ts'
import type { PdfAssetSummary } from '../../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  PDF_BUILTIN_IMAGES,
  PDF_FIELD_KEYS,
  type PdfBuiltinImage,
  type PdfCanvasPage,
  type PdfElement,
  type PdfFieldKey,
  type PdfFill,
  type PdfImageElement,
  type PdfPage,
  type PdfTextElement,
  type PdfTextRun,
} from '../../../../types/pdfDesign.ts'
import { Button } from '../../../ui/button.tsx'
import { Input } from '../../../ui/input.tsx'
import { Label } from '../../../ui/label.tsx'
import { Select } from '../../../ui/select.tsx'
import { LIBELLES_DONNEES } from '../fields.ts'

const COULEUR_PARCOURS = 'pathway.color'

const ETIQUETTES_LIVREES: Record<string, string> = {
  'logo-chu': 'Logo',
  lines: 'Lignes',
}

const ICONES: Record<PdfElement['kind'], typeof Type> = {
  text: Type,
  rect: Square,
  ellipse: Circle,
  image: Image,
}

const NOMS: Record<PdfElement['kind'], string> = {
  text: 'Texte',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  image: 'Image',
}

// Une seule liste pour les deux familles, et un PREFIXE qui dit laquelle : sans lui, une image
// deposee nommee « logo-chu » se ferait passer pour l'image livree du meme nom.
const sourceDepuisChoix = (choix: string): PdfImageElement['source'] =>
  choix.startsWith('asset:')
    ? { assetId: choix.slice('asset:'.length) }
    : { builtin: choix.slice('builtin:'.length) as PdfBuiltinImage }

// Ce qu'un calque annonce : le texte tel qu'il se lira, donnees entre accolades. Un titre dit
// de quel element il s'agit bien mieux que « Texte 3 ».
const libelleDeCalque = (element: PdfElement): string => {
  switch (element.kind) {
    case 'text':
      return (
        element.runs
          .map((run) =>
            'field' in run ? `{${LIBELLES_DONNEES[run.field]}}` : run.text,
          )
          .join('')
          .trim() || 'Texte vide'
      )
    case 'image':
      return 'Image'
    default:
      return typeof element.fill === 'string'
        ? NOMS[element.kind]
        : `${NOMS[element.kind]} · couleur du parcours`
  }
}

const TITRE_SECTION =
  'text-xs font-semibold uppercase tracking-wide text-text-light'

const Section = ({
  titre,
  pour,
  children,
}: {
  titre: string
  // Le titre de section sert d'etiquette au champ unique de la section (l'image) : un second
  // libelle au-dessus du premier dirait deux fois la meme chose.
  pour?: string
  children: ReactNode
}) => (
  <div className="px-5 py-3.5 flex flex-col gap-2.5 border-b border-muted">
    {pour ? (
      <Label htmlFor={pour} className={TITRE_SECTION}>
        {titre}
      </Label>
    ) : (
      <span className={TITRE_SECTION}>{titre}</span>
    )}
    {children}
  </div>
)

// La SAISIE est locale, seules les valeurs valides remontent. Deux raisons, et il faut les
// deux : un champ vide donne `Number('') === 0`, donc une hauteur nulle et un element disparu
// de la toile ; et un champ entierement controle par la valeur de l'element se reecrit sous
// les doigts, ce qui interdit de l'effacer pour retaper ou de commencer par un « - ».
const Nombre = ({
  label,
  glyphe,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  // Ce que le champ AFFICHE, quand c'est plus court que son nom (X, L, ↻). Le nom complet
  // reste celui que lit un lecteur d'ecran, et celui que les tests demandent.
  glyphe?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) => {
  const [brouillon, setBrouillon] = useState(String(value))

  // La valeur a change ailleurs (glissement sur la toile, annulation) : le champ suit.
  const [vue, setVue] = useState(value)
  if (vue !== value) {
    setVue(value)
    setBrouillon(String(value))
  }

  const saisir = (texte: string) => {
    setBrouillon(texte)
    const nombre = Number(texte)
    if (
      texte.trim() === '' ||
      Number.isNaN(nombre) ||
      (min !== undefined && nombre < min) ||
      (max !== undefined && nombre > max)
    ) {
      return
    }
    onChange(nombre)
  }

  return (
    // `min-w-0` sur l'etiquette et `w-0 flex-1` sur le champ : sans les deux, un champ
    // nombre impose sa largeur intrinseque et la grille de 320 px deborde a l'horizontale.
    <label className="min-w-0 h-[34px] border border-border rounded-[7px] flex items-center gap-1.5 px-2.5">
      <span className="text-xs text-text-sidebar shrink-0" aria-hidden="true">
        {glyphe ?? label}
      </span>
      <input
        aria-label={label}
        type="number"
        step={step}
        min={min}
        max={max}
        value={brouillon}
        onChange={(e) => saisir(e.target.value)}
        // Au depart du curseur, un champ laisse invalide reprend la valeur retenue : on ne
        // laisse pas une boite de saisie mentir sur l'etat de l'element.
        onBlur={() => setBrouillon(String(value))}
        className="w-0 min-w-0 flex-1 border-none outline-none bg-transparent text-sm text-right"
      />
    </label>
  )
}

// Un groupe de boutons dont un seul est actif : trois etats se lisent d'un coup d'oeil la ou
// une liste deroulante demande de l'ouvrir pour savoir lequel est choisi.
const Segmente = <T extends string>({
  label,
  options,
  valeur,
  onChange,
  pleineLargeur = false,
}: {
  label: string
  options: { valeur: T; libelle: string; Icone?: typeof Type }[]
  valeur: T
  onChange: (valeur: T) => void
  pleineLargeur?: boolean
}) => (
  // Un `fieldset` : c'est l'element d'un groupe de controles, et il porte le role sans qu'on
  // ait a l'ecrire.
  <fieldset
    aria-label={label}
    className={cn(
      'flex border border-border rounded-[7px] overflow-hidden',
      pleineLargeur && 'w-full',
    )}
  >
    {options.map((option) => (
      <button
        key={option.valeur}
        type="button"
        aria-label={option.libelle}
        aria-pressed={valeur === option.valeur}
        onClick={() => onChange(option.valeur)}
        className={cn(
          'h-8 flex items-center justify-center gap-1.5 text-[13px] cursor-pointer border-border [&:not(:first-child)]:border-l',
          option.Icone ? 'w-[34px]' : 'flex-1 px-2.5',
          valeur === option.valeur
            ? 'bg-blue-50 text-primary font-semibold'
            : 'text-text-dark',
        )}
      >
        {option.Icone ? <option.Icone className="w-4 h-4" /> : option.libelle}
      </button>
    ))}
  </fieldset>
)

// Le remplissage est soit une couleur fixe, soit la couleur du parcours avec son repli : ce
// second cas est le seul moyen d'obtenir le rond colore de la couverture.
const Remplissage = ({
  label = 'Remplissage',
  fill,
  onChange,
}: {
  label?: string
  fill: PdfFill
  onChange: (fill: PdfFill) => void
}) => {
  const parcours = typeof fill !== 'string'
  const couleur = parcours ? fill.fallback : fill
  return (
    <>
      <Segmente
        label={label}
        pleineLargeur
        valeur={parcours ? COULEUR_PARCOURS : 'fixe'}
        options={[
          { valeur: 'fixe', libelle: 'Couleur fixe' },
          { valeur: COULEUR_PARCOURS, libelle: 'Couleur du parcours' },
        ]}
        onChange={(v) =>
          onChange(
            v === COULEUR_PARCOURS
              ? { token: 'pathway.color', fallback: couleur }
              : couleur,
          )
        }
      />
      <label className="h-[34px] border border-border rounded-[7px] flex items-center gap-2 px-2.5">
        <input
          type="color"
          aria-label={parcours ? 'Couleur de repli' : 'Couleur'}
          value={couleur}
          onChange={(e) =>
            onChange(
              parcours
                ? { token: 'pathway.color', fallback: e.target.value }
                : e.target.value,
            )
          }
          className="w-[18px] h-[18px] shrink-0 cursor-pointer border-none bg-transparent p-0"
        />
        <span className="text-[13px] tabular-nums">
          {parcours ? `Repli · ${couleur}` : couleur}
        </span>
      </label>
      {parcours && (
        <p className="text-xs text-text-light leading-snug">
          La couleur du parcours du patient. Le repli s'affiche pour un patient
          sans parcours.
        </p>
      )}
    </>
  )
}

const estTexte = (
  run: PdfTextRun,
): run is Extract<PdfTextRun, { text: string }> => 'text' in run

// Les runs dans UNE zone, comme ils se liront : les textes en clair, les donnees en etiquettes.
// Une pile de champs separes ne montrait pas l'ordre des morceaux, qui est tout le contenu.
const Contenu = ({
  element,
  onModifier,
}: {
  element: PdfTextElement
  onModifier: (champs: Partial<PdfElement>) => void
}) => {
  // Ou inserer la prochaine donnee : le run de texte que l'on quitte, et la position du
  // curseur dedans. Un `ref` et non un etat — le relire ne doit rien redessiner.
  const curseur = useRef<{ rang: number; position: number } | null>(null)

  const changerRun = (rang: number, texte: string) =>
    onModifier({
      runs: element.runs.map((run, i) =>
        i === rang && estTexte(run) ? { ...run, text: texte } : run,
      ),
    })

  // Le schema exige au moins un run : retirer le dernier produirait un contenu que
  // l'enregistrement refuserait, et l'utilisateur ne l'apprendrait qu'au 400.
  const retirer = (rang: number) => {
    const restants = element.runs.filter((_, i) => i !== rang)
    onModifier({
      runs: restants.length
        ? restants
        : [{ id: crypto.randomUUID(), text: '', bold: false, italic: false }],
    })
  }

  // A LA POSITION DU CURSEUR : le run de texte courant est coupe en deux et la donnee se
  // glisse entre les morceaux. Hors d'un champ (rien n'a le curseur), on ajoute a la fin.
  const inserer = (cle: PdfFieldKey) => {
    const donnee: PdfTextRun = {
      id: crypto.randomUUID(),
      field: cle,
      bold: false,
      italic: false,
    }
    const point = curseur.current
    const vise = point ? element.runs[point.rang] : undefined
    if (!point || !vise || !estTexte(vise)) {
      onModifier({ runs: [...element.runs, donnee] })
      return
    }
    const avant = vise.text.slice(0, point.position)
    const apres = vise.text.slice(point.position)
    onModifier({
      runs: [
        ...element.runs.slice(0, point.rang),
        ...(avant ? [{ ...vise, text: avant }] : []),
        donnee,
        // Le morceau d'apres est un nouveau run : deux runs ne partagent jamais un id.
        ...(apres ? [{ ...vise, id: crypto.randomUUID(), text: apres }] : []),
        ...element.runs.slice(point.rang + 1),
      ],
    })
  }

  return (
    <>
      <div className="min-h-11 border-[1.5px] border-primary rounded-lg px-2.5 py-2 flex flex-wrap items-center gap-1 text-sm">
        {element.runs.map((run, rang) =>
          estTexte(run) ? (
            <input
              key={run.id}
              aria-label={`Texte ${rang + 1}`}
              value={run.text}
              onChange={(e) => changerRun(rang, e.target.value)}
              onSelect={(e) => {
                curseur.current = {
                  rang,
                  position: e.currentTarget.selectionStart ?? run.text.length,
                }
              }}
              // La largeur suit le contenu : un champ pleine largeur par run casserait la
              // ligne et l'ordre des morceaux ne se lirait plus.
              style={{ width: `${Math.max(run.text.length, 3) + 1}ch` }}
              className="min-w-0 border-none outline-none bg-transparent"
            />
          ) : (
            <span
              key={run.id}
              className="h-6 pl-2 pr-1 rounded-[5px] bg-blue-100 text-primary-dark text-[13px] font-semibold inline-flex items-center gap-1"
            >
              {LIBELLES_DONNEES[run.field]}
              <button
                type="button"
                aria-label={`Retirer ${LIBELLES_DONNEES[run.field]}`}
                onClick={() => retirer(rang)}
                className="w-[18px] h-[18px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ),
        )}
      </div>

      {/* Des boutons, pas une liste deroulante : inserer une donnee est une ACTION. Une
          liste garderait la derniere valeur choisie — elle afficherait un etat qui n'existe
          pas, et n'emettrait rien si on rechoisissait la meme, donc on ne pourrait pas
          inserer deux fois le meme champ. */}
      <span className="text-xs text-text-light">
        Insérer une donnée au curseur
      </span>
      <div className="flex flex-wrap gap-1.5">
        {PDF_FIELD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => inserer(key)}
            className="h-7 px-2.5 rounded-md border border-dashed border-ring text-primary-dark text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-blue-50"
          >
            <Plus className="w-3 h-3" />
            {LIBELLES_DONNEES[key]}
          </button>
        ))}
      </div>
    </>
  )
}

const Texte = ({
  element,
  onModifier,
}: {
  element: PdfTextElement
  onModifier: (champs: Partial<PdfElement>) => void
}) => (
  <>
    <Section titre="Contenu">
      <Contenu element={element} onModifier={onModifier} />
    </Section>

    <Section titre="Texte">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Nombre
          label="Taille"
          value={element.fontSize}
          min={1}
          max={400}
          onChange={(fontSize) => onModifier({ fontSize })}
        />
      </div>
      <Remplissage
        label="Couleur du texte"
        fill={element.color}
        onChange={(color) => onModifier({ color })}
      />

      <div className="flex gap-2">
        {/* Gras et italique ne s'excluent pas : deux interrupteurs, pas un segmente. */}
        <div className="flex border border-border rounded-[7px] overflow-hidden">
          {(
            [
              [
                'Gras',
                Bold,
                element.bold,
                () => onModifier({ bold: !element.bold }),
              ],
              [
                'Italique',
                Italic,
                element.italic,
                () => onModifier({ italic: !element.italic }),
              ],
            ] as const
          ).map(([libelle, Icone, actif, basculer]) => (
            <button
              key={libelle}
              type="button"
              aria-label={libelle}
              aria-pressed={actif}
              onClick={basculer}
              className={cn(
                'w-[34px] h-8 flex items-center justify-center cursor-pointer border-border [&:not(:first-child)]:border-l',
                actif ? 'bg-blue-50 text-primary' : 'text-text-dark',
              )}
            >
              <Icone className="w-4 h-4" />
            </button>
          ))}
        </div>

        <Segmente
          label="Alignement"
          valeur={element.align}
          options={[
            { valeur: 'left', libelle: 'Gauche', Icone: AlignLeft },
            { valeur: 'center', libelle: 'Centré', Icone: AlignCenter },
            { valeur: 'right', libelle: 'Droite', Icone: AlignRight },
          ]}
          onChange={(align) => onModifier({ align })}
        />

        <Segmente
          label="Alignement vertical"
          valeur={element.vAlign}
          options={[
            { valeur: 'top', libelle: 'Haut', Icone: ArrowUpToLine },
            { valeur: 'middle', libelle: 'Milieu', Icone: FoldVertical },
            { valeur: 'bottom', libelle: 'Bas', Icone: ArrowDownToLine },
          ]}
          onChange={(vAlign) => onModifier({ vAlign })}
        />
      </div>

      {/* Helvetica seule : aucun `Font.register` n'existe dans le depot, en proposer
          d'autres mentirait sur ce que le PDF produira. */}
      <p className="text-xs text-text-sidebar">Police : Helvetica</p>
    </Section>
  </>
)

// ETAT 1 — la page calendrier. Elle n'a ni element ni propriete : seule sa PLACE se choisit,
// et c'est la colonne de gauche qui s'en charge.
const PageCalendrier = ({
  pageSupprimable,
  onSupprimerPage,
}: {
  pageSupprimable: boolean
  onSupprimerPage: () => void
}) => (
  <div className="px-5 py-4.5 flex flex-col gap-3">
    <span className="text-[15px] font-semibold">Page calendrier</span>
    <p className="text-[13px] text-text-dark leading-relaxed">
      Elle est remplie à l'export avec les rendez-vous du patient, dans l'ordre
      chronologique. Son contenu ne se dessine pas ; seule sa place dans le
      document se choisit.
    </p>
    <p className="text-[13px] text-text-light">
      Un document n'a qu'une page calendrier.
    </p>
    <Button
      variant="outline"
      className="self-start h-[34px] border-red-200 text-red-700 hover:bg-red-50"
      disabled={!pageSupprimable}
      onClick={onSupprimerPage}
    >
      <Trash2 className="w-3.5 h-3.5" />
      Retirer la page
    </Button>
  </div>
)

// ETAT 2 — une page, rien de selectionne. Les calques donnent une seconde prise sur les
// elements : un decor en arriere-plan se clique mal sur la toile, il se clique bien ici.
const PageSansSelection = ({
  page,
  nomPage,
  onChoisirElement,
  onDupliquerPage,
  onSupprimerPage,
  pageSupprimable,
}: {
  page: PdfCanvasPage
  nomPage: string
  onChoisirElement: (id: string | null) => void
  onDupliquerPage: () => void
  onSupprimerPage: () => void
  pageSupprimable: boolean
}) => (
  <div className="px-5 py-4.5 flex flex-col gap-3.5">
    <div className="flex justify-between items-center">
      <span className="text-[15px] font-semibold">{nomPage}</span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-md"
          aria-label="Dupliquer la page"
          onClick={onDupliquerPage}
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-md"
          aria-label="Supprimer la page"
          className="text-red-700"
          disabled={!pageSupprimable}
          onClick={onSupprimerPage}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
    <p className="text-[13px] text-text-light">
      Cliquez sur un élément de la page, ou choisissez-le ci-dessous.
    </p>
    <div className="flex flex-col gap-1.5">
      <span className={TITRE_SECTION}>Calques · du premier plan au fond</span>
      {page.elements.length === 0 ? (
        <p className="text-[13px] text-text-light">
          Cette page est vide. Ajoutez un élément depuis la barre d'outils.
        </p>
      ) : (
        // L'ordre du tableau EST l'ordre de peinture : le premier plan est la FIN du
        // tableau, donc la liste se lit a l'envers.
        <div className="border border-border rounded-[10px] overflow-hidden">
          {[...page.elements].reverse().map((calque) => {
            const Icone = ICONES[calque.kind]
            return (
              <button
                key={calque.id}
                type="button"
                onClick={() => onChoisirElement(calque.id)}
                className="w-full h-[38px] px-3 flex items-center gap-2.5 text-[13px] text-left cursor-pointer [&:not(:first-child)]:border-t border-muted hover:bg-surface-douce"
              >
                <Icone className="w-[15px] h-[15px] shrink-0 text-text-light" />
                <span className="flex-1 min-w-0 truncate">
                  {libelleDeCalque(calque)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  </div>
)

type InspecteurProps = {
  // La page affichee, pour les deux etats qui parlent d'elle. `null` tant que le design n'est
  // pas arrive.
  page: PdfPage | null
  nomPage: string
  element: PdfElement | null
  onChoisirElement: (id: string | null) => void
  onModifier: (champs: Partial<PdfElement>) => void
  onSupprimer: () => void
  onDupliquer: () => void
  onOrdre: (sens: 'avant' | 'arriere') => void
  onDupliquerPage: () => void
  onSupprimerPage: () => void
  // Le schema exige au moins une page : la derniere ne se retire pas.
  pageSupprimable: boolean
  // Les images deposees par le service, a cote des deux livrees.
  assets?: PdfAssetSummary[]
  // Depose un fichier et rend l'image creee, pour que l'inspecteur la pose aussitot comme
  // source. Absent, le champ de depot n'est pas rendu.
  onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
}

export default function Inspecteur({
  page,
  nomPage,
  element,
  onChoisirElement,
  onModifier,
  onSupprimer,
  onDupliquer,
  onOrdre,
  onDupliquerPage,
  onSupprimerPage,
  pageSupprimable,
  assets,
  onDeposer,
}: InspecteurProps) {
  if (!page) {
    return null
  }

  if (page.kind === 'calendar') {
    return (
      <PageCalendrier
        pageSupprimable={pageSupprimable}
        onSupprimerPage={onSupprimerPage}
      />
    )
  }

  if (!element) {
    return (
      <PageSansSelection
        page={page}
        nomPage={nomPage}
        onChoisirElement={onChoisirElement}
        onDupliquerPage={onDupliquerPage}
        onSupprimerPage={onSupprimerPage}
        pageSupprimable={pageSupprimable}
      />
    )
  }

  // L'identifiant d'une image deposee qui n'est PLUS dans la liste du service — supprimee,
  // ou venue d'un autre service. `null` dans tous les autres cas.
  const assetIdDisparu =
    element.kind === 'image' && 'assetId' in element.source
      ? ((id) => ((assets ?? []).some((asset) => asset.id === id) ? null : id))(
          element.source.assetId,
        )
      : null

  const Icone = ICONES[element.kind]

  // ETAT 3 — un element selectionne.
  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-3 flex justify-between items-center border-b border-muted">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <Icone className="w-4 h-4 text-text-dark" />
          {NOMS[element.kind]}
        </span>
        <Button
          variant="transparent"
          size="icon-md"
          aria-label="Désélectionner"
          onClick={() => onChoisirElement(null)}
        >
          <X className="w-4 h-4 text-text-light" />
        </Button>
      </div>

      {element.kind === 'text' && (
        <Texte element={element} onModifier={onModifier} />
      )}

      {(element.kind === 'rect' || element.kind === 'ellipse') && (
        <Section titre="Remplissage">
          <Remplissage
            fill={element.fill}
            onChange={(fill) => onModifier({ fill })}
          />
          {element.kind === 'rect' && (
            <Nombre
              label="Rayon"
              value={element.radius}
              min={0}
              max={200}
              onChange={(radius) => onModifier({ radius })}
            />
          )}
        </Section>
      )}

      {element.kind === 'image' && (
        <Section titre="Image" pour="insp-image">
          <Select
            id="insp-image"
            options={[
              ...PDF_BUILTIN_IMAGES.map((nom) => ({
                value: `builtin:${nom}`,
                label: ETIQUETTES_LIVREES[nom] ?? nom,
              })),
              ...(assets ?? []).map((asset) => ({
                value: `asset:${asset.id}`,
                label: asset.fileName,
              })),
              // Une image supprimee, ou venue d'un autre service : sans cette option son
              // identifiant ne correspond a rien et le champ s'affiche VIDE, donc
              // indiscernable de « aucune image choisie ». On nomme ce qui manque.
              ...(assetIdDisparu
                ? [
                    {
                      value: `asset:${assetIdDisparu}`,
                      label: 'Image supprimée',
                    },
                  ]
                : []),
            ]}
            value={
              'builtin' in element.source
                ? `builtin:${element.source.builtin}`
                : `asset:${element.source.assetId}`
            }
            onValueChange={(choix) =>
              onModifier({ source: sourceDepuisChoix(choix) })
            }
          />

          {onDeposer && (
            <Label
              htmlFor="insp-depot"
              className="h-14 border-[1.5px] border-dashed border-border-dark rounded-lg flex items-center justify-center gap-2 text-[13px] text-text-dark cursor-pointer hover:border-primary"
            >
              <Upload className="w-4 h-4 text-text-light" />
              Déposer un PNG ou JPEG
              <Input
                id="insp-depot"
                type="file"
                className="hidden"
                // PNG et JPEG seulement : react-pdf ne decode rien d'autre, et le back
                // refuse le reste. Proposer un WebP ici serait promettre une image qui ne
                // sortirait pas du PDF.
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const fichier = e.target.files?.[0]
                  // L'input est remis a zero AUSSITOT : sans cela, rechoisir le meme fichier
                  // n'emet aucun `change` et il ne se passe rien, sans que rien ne le dise.
                  // C'est exactement le geste qui suit un refus — on corrige, on rechoisit.
                  e.target.value = ''
                  if (!fichier) {
                    return
                  }
                  // Un depot refuse ne pose aucune source : le message vient de la mutation,
                  // et l'element reste sur son image precedente.
                  onDeposer(fichier)
                    .then((asset) =>
                      onModifier({ source: { assetId: asset.id } }),
                    )
                    .catch(() => undefined)
                }}
              />
            </Label>
          )}

          <Segmente
            label="Cadrage"
            pleineLargeur
            valeur={element.fit}
            options={[
              { valeur: 'contain', libelle: 'Contenir' },
              { valeur: 'cover', libelle: 'Remplir' },
              { valeur: 'fill', libelle: 'Étirer' },
            ]}
            onChange={(fit) => onModifier({ fit })}
          />
        </Section>
      )}

      <Section titre="Position et taille · pt">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <Nombre
            label="X"
            value={element.x}
            onChange={(x) => onModifier({ x })}
          />
          <Nombre
            label="Y"
            value={element.y}
            onChange={(y) => onModifier({ y })}
          />
          {/* Bornees au format de la page : au-dela, le rendu PDF doit se defendre seul
              (`borner`, render-pdf.tsx). Mieux vaut que l'ecran le dise avant. X et Y, eux,
              restent libres et negatifs : c'est ainsi qu'un decor deborde. */}
          <Nombre
            label="Largeur"
            glyphe="L"
            value={element.w}
            min={1}
            max={A4_WIDTH}
            onChange={(w) => onModifier({ w })}
          />
          <Nombre
            label="Hauteur"
            glyphe="H"
            value={element.h}
            min={1}
            max={A4_HEIGHT}
            onChange={(h) => onModifier({ h })}
          />
          <Nombre
            label="Rotation"
            glyphe="↻"
            value={element.rotation}
            min={-360}
            max={360}
            onChange={(rotation) => onModifier({ rotation })}
          />
        </div>
      </Section>

      {/* L'ordre dans le tableau EST l'ordre de peinture : les deux premiers boutons y
          deplacent l'element. */}
      <div className="px-5 py-3.5 flex gap-1.5">
        {(
          [
            ['Premier plan', BringToFront, () => onOrdre('avant'), false],
            ['Arrière-plan', SendToBack, () => onOrdre('arriere'), false],
            ['Dupliquer', Copy, onDupliquer, false],
            ['Supprimer', Trash2, onSupprimer, true],
          ] as const
        ).map(([libelle, IconeAction, action, danger]) => (
          <Button
            key={libelle}
            variant="outline"
            aria-label={libelle}
            title={libelle}
            onClick={action}
            className={cn(
              'flex-1 h-[34px]',
              danger && 'border-red-200 text-red-700 hover:bg-red-50',
            )}
          >
            <IconeAction className="w-4 h-4" />
          </Button>
        ))}
      </div>
    </div>
  )
}

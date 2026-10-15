import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from 'lucide-react'

import {
  PDF_BUILTIN_IMAGES,
  PDF_FIELD_KEYS,
  type PdfElement,
  type PdfFieldKey,
  type PdfFill,
  type PdfTextElement,
} from '../../../../types/pdfDesign.ts'
import { Button } from '../../../ui/button.tsx'
import { Input } from '../../../ui/input.tsx'
import { Label } from '../../../ui/label.tsx'
import { Select } from '../../../ui/select.tsx'

const ETIQUETTES_DONNEES: Record<PdfFieldKey, string> = {
  'patient.name': 'Nom du patient',
  'pathway.name': 'Nom du parcours',
  'program.dates': 'Dates du programme',
  'service.name': 'Nom du service',
}

const COULEUR_PARCOURS = 'pathway.color'

type InspecteurProps = {
  element: PdfElement | null
  onModifier: (champs: Partial<PdfElement>) => void
  onSupprimer: () => void
  onDupliquer: () => void
  onOrdre: (sens: 'avant' | 'arriere') => void
}

const Nombre = ({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) => (
  <div className="flex flex-col gap-1">
    <Label htmlFor={`insp-${label}`} className="text-xs">
      {label}
    </Label>
    <Input
      id={`insp-${label}`}
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
)

// Le remplissage est soit une couleur fixe, soit la couleur du parcours avec son repli : ce
// second cas est le seul moyen d'obtenir le rond colore de la couverture.
const Remplissage = ({
  fill,
  onChange,
}: {
  fill: PdfFill
  onChange: (fill: PdfFill) => void
}) => {
  const parcours = typeof fill !== 'string'
  const couleur = parcours ? fill.fallback : fill
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Remplissage</Label>
      <Select
        options={[
          { value: 'fixe', label: 'Couleur fixe' },
          { value: COULEUR_PARCOURS, label: 'Couleur du parcours' },
        ]}
        value={parcours ? COULEUR_PARCOURS : 'fixe'}
        onValueChange={(v) =>
          onChange(
            v === COULEUR_PARCOURS
              ? { token: 'pathway.color', fallback: couleur }
              : couleur,
          )
        }
      />
      <Input
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
      />
      {parcours && (
        <p className="text-xs text-text-light">
          Le repli s'affiche pour un patient sans parcours.
        </p>
      )}
    </div>
  )
}

const Texte = ({
  element,
  onModifier,
}: {
  element: PdfTextElement
  onModifier: (champs: Partial<PdfElement>) => void
}) => {
  const changerRun = (rang: number, texte: string) =>
    onModifier({
      runs: element.runs.map((run, i) =>
        i === rang && 'text' in run ? { ...run, text: texte } : run,
      ),
    })

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label className="text-xs">Contenu</Label>
        {element.runs.map((run, rang) =>
          'field' in run ? (
            <div
              // Un run n'a pas d'identite propre : son rang est sa cle.
              key={`${element.id}-${rang}`}
              className="flex items-center justify-between gap-2 text-sm bg-muted rounded px-2 py-1"
            >
              <span>{ETIQUETTES_DONNEES[run.field]}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Retirer ${ETIQUETTES_DONNEES[run.field]}`}
                onClick={() =>
                  onModifier({
                    runs: element.runs.filter((_, i) => i !== rang),
                  })
                }
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Input
              key={`${element.id}-${rang}`}
              aria-label={`Texte ${rang + 1}`}
              value={run.text}
              onChange={(e) => changerRun(rang, e.target.value)}
            />
          ),
        )}
        {/* Des boutons, pas une liste deroulante : inserer une donnee est une ACTION. Une
            liste garderait la derniere valeur choisie — elle afficherait un etat qui n'existe
            pas, et n'emettrait rien si on rechoisissait la meme, donc on ne pourrait pas
            inserer deux fois le meme champ. */}
        <Label className="text-xs">Insérer une donnée</Label>
        <div className="flex flex-wrap gap-1">
          {PDF_FIELD_KEYS.map((key) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() =>
                onModifier({
                  runs: [
                    ...element.runs,
                    { field: key, bold: false, italic: false },
                  ],
                })
              }
            >
              {ETIQUETTES_DONNEES[key]}
            </Button>
          ))}
        </div>
      </div>

      <Nombre
        label="Taille"
        value={element.fontSize}
        onChange={(fontSize) => onModifier({ fontSize })}
      />
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Couleur</Label>
        <Input
          type="color"
          aria-label="Couleur du texte"
          value={element.color}
          onChange={(e) => onModifier({ color: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant={element.bold ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModifier({ bold: !element.bold })}
        >
          Gras
        </Button>
        <Button
          variant={element.italic ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModifier({ italic: !element.italic })}
        >
          Italique
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Alignement</Label>
        <Select
          options={[
            { value: 'left', label: 'Gauche' },
            { value: 'center', label: 'Centré' },
            { value: 'right', label: 'Droite' },
          ]}
          value={element.align}
          onValueChange={(align) =>
            onModifier({ align: align as PdfTextElement['align'] })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Alignement vertical</Label>
        <Select
          options={[
            { value: 'top', label: 'Haut' },
            { value: 'middle', label: 'Milieu' },
            { value: 'bottom', label: 'Bas' },
          ]}
          value={element.vAlign}
          onValueChange={(vAlign) =>
            onModifier({ vAlign: vAlign as PdfTextElement['vAlign'] })
          }
        />
      </div>
      {/* Helvetica seule : aucun `Font.register` n'existe dans le depot, en proposer
          d'autres mentirait sur ce que le PDF produira. */}
      <p className="text-xs text-text-light">Police : Helvetica</p>
    </>
  )
}

export default function Inspecteur({
  element,
  onModifier,
  onSupprimer,
  onDupliquer,
  onOrdre,
}: InspecteurProps) {
  if (!element) {
    return (
      <p className="text-sm text-text-light">
        Sélectionnez un élément pour le modifier.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Propriétés</h2>

      <div className="grid grid-cols-2 gap-2">
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
        <Nombre
          label="Largeur"
          value={element.w}
          onChange={(w) => onModifier({ w })}
        />
        <Nombre
          label="Hauteur"
          value={element.h}
          onChange={(h) => onModifier({ h })}
        />
        <Nombre
          label="Rotation"
          value={element.rotation}
          onChange={(rotation) => onModifier({ rotation })}
        />
      </div>

      {element.kind === 'text' && (
        <Texte element={element} onModifier={onModifier} />
      )}

      {(element.kind === 'rect' || element.kind === 'ellipse') && (
        <Remplissage
          fill={element.fill}
          onChange={(fill) => onModifier({ fill })}
        />
      )}

      {element.kind === 'rect' && (
        <Nombre
          label="Rayon"
          value={element.radius}
          onChange={(radius) => onModifier({ radius })}
        />
      )}

      {element.kind === 'image' && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Image</Label>
            <Select
              options={PDF_BUILTIN_IMAGES.map((nom) => ({
                value: nom,
                label: nom === 'logo-chu' ? 'Logo' : 'Lignes',
              }))}
              value={
                'builtin' in element.source ? element.source.builtin : undefined
              }
              onValueChange={(builtin) =>
                onModifier({
                  source: {
                    builtin: builtin as (typeof PDF_BUILTIN_IMAGES)[number],
                  },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Cadrage</Label>
            <Select
              options={[
                { value: 'contain', label: 'Contenir' },
                { value: 'cover', label: 'Remplir' },
                { value: 'fill', label: 'Étirer' },
              ]}
              value={element.fit}
              onValueChange={(fit) =>
                onModifier({ fit: fit as 'contain' | 'cover' | 'fill' })
              }
            />
          </div>
        </>
      )}

      {/* L'ordre dans le tableau EST l'ordre de peinture : ces deux boutons y deplacent
          l'element. */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button variant="outline" size="sm" onClick={() => onOrdre('avant')}>
          <ArrowUpToLine className="w-4 h-4" />
          Premier plan
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOrdre('arriere')}>
          <ArrowDownToLine className="w-4 h-4" />
          Arrière-plan
        </Button>
        <Button variant="outline" size="sm" onClick={onDupliquer}>
          <Copy className="w-4 h-4" />
          Dupliquer
        </Button>
        <Button variant="outline" size="sm" onClick={onSupprimer}>
          <Trash2 className="w-4 h-4" />
          Supprimer
        </Button>
      </div>
    </div>
  )
}

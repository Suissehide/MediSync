import { Check, Copy, Info } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { type Statut, statut } from '@/components/custom/ars/statut.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { useCan } from '@/hooks/useCan.ts'
import { nombre } from '@/libs/csv.ts'
import { cn } from '@/libs/utils.ts'
import { useSaveArsAnswerMutation } from '@/queries/useArsIndicator.ts'
import type {
  ArsAnswer,
  ArsAnswerBody,
  ArsIndicator,
} from '@/types/arsIndicator.ts'

const DELAI = 500

// L'annee est figee a la frappe : un changement de periode n'egare pas une saisie en attente.
function useSaisie(code: string, annee: number | null) {
  const { mutateAsync } = useSaveArsAnswerMutation()
  const [resultat, setResultat] = useState<'enregistre' | 'erreur' | null>(null)
  const [reponse, setReponse] = useState<ArsAnswer | null>(null)
  const attente = useRef<{ annee: number; body: ArsAnswerBody } | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)

  const envoyer = useCallback(() => {
    clearTimeout(minuteur.current)
    const saisie = attente.current
    attente.current = null
    if (!saisie) {
      return
    }
    mutateAsync({ year: saisie.annee, code, body: saisie.body }).then(
      (r) => {
        setReponse(r)
        setResultat('enregistre')
      },
      () => {
        attente.current ??= saisie
        setResultat('erreur')
      },
    )
  }, [code, mutateAsync])

  useEffect(() => envoyer, [envoyer])

  const planifier = (body: ArsAnswerBody, immediat = false) => {
    if (annee === null) {
      return
    }
    attente.current = { annee, body }
    setResultat(null)
    clearTimeout(minuteur.current)
    if (immediat) {
      envoyer()
    } else {
      minuteur.current = setTimeout(envoyer, DELAI)
    }
  }

  return { planifier, envoyer, resultat, reponse }
}

// Brouillons des champs de 2.5 et 4.2 : ils gardent la frappe meme si l'enregistrement echoue.
function useChamps(
  answer: ArsAnswer | null,
  saisie: ReturnType<typeof useSaisie>,
) {
  const [chiffre, setChiffre] = useState(answer?.numberValue?.toString() ?? '')
  const [texte, setTexte] = useState(answer?.textValue ?? '')
  const [choix, setChoix] = useState(answer?.boolValue ?? null)
  return {
    chiffre,
    texte,
    choix,
    changerNombre: (brut: string) => {
      const n = brut.replace(/\D/g, '')
      setChiffre(n)
      saisie.planifier(corps25(n, texte))
    },
    changerTexte: (t: string) => {
      setTexte(t)
      saisie.planifier(corps25(chiffre, t))
    },
    choisir: (b: boolean | null) => {
      setChoix(b)
      saisie.planifier({ boolValue: b }, true)
    },
  }
}

export function LigneIndicateur({
  indicateur,
  parent,
  annee,
}: {
  indicateur: ArsIndicator
  parent?: ArsIndicator
  annee: number | null
}) {
  const saisie = useSaisie(indicateur.code, annee)
  const i = { ...indicateur, answer: saisie.reponse ?? indicateur.answer }
  const s = statut(i)
  const bis = i.code.endsWith('bis')
  const libelleId = useId()
  const peutEcrire = useCan('stats:write')
  const lecture = !peutEcrire || annee === null
  const champs = useChamps(indicateur.answer, saisie)

  const pad = bis ? 'pt-2 pb-3' : 'py-3'

  return (
    <tr
      className={cn(
        'border-b border-muted last:border-b-0',
        s === 'restant' ? 'bg-a-saisir-fond' : 'bg-carte',
      )}
    >
      <th
        scope="row"
        className={cn(
          'w-[112px] pl-5 pr-4 align-top text-left font-normal text-[13px] text-text-light tabular-nums',
          pad,
        )}
      >
        <span className="block pt-0.5">{i.code}</span>
      </th>
      <td className={cn('align-top', pad)}>
        <div
          className={cn(
            'flex flex-col gap-1 min-w-0',
            bis && 'pl-3.5 border-l-2 border-border',
          )}
        >
          <span
            id={libelleId}
            className={cn(
              'text-sm leading-relaxed text-pretty',
              s === 'indisponible' ? 'text-text-light' : 'text-foreground',
            )}
          >
            {i.label}
          </span>
          {i.note && i.kind === 'unavailable' && (
            <span className="flex items-start gap-1.5 text-xs leading-snug text-text-light">
              <Info aria-hidden className="size-[13px] shrink-0 mt-px" />
              {i.note}
            </span>
          )}
          {i.note && i.kind === 'manual' && (
            <span className="text-xs text-a-saisir-texte">{i.note}</span>
          )}
          {i.input === 'number+text' && (
            <textarea
              aria-label={`Explication du ${i.code}`}
              placeholder="Expliquer le type de prise en charge…"
              value={champs.texte}
              disabled={lecture}
              onChange={(e) => champs.changerTexte(e.target.value)}
              onBlur={saisie.envoyer}
              className="mt-1 w-full max-w-[560px] min-h-14 px-2.5 py-2 border border-border rounded-[5px] bg-surface-douce text-[13px] text-foreground resize-y disabled:cursor-not-allowed"
            />
          )}
          {i.input && (
            <Annonces
              horsAnnee={peutEcrire && annee === null}
              resultat={saisie.resultat}
            />
          )}
        </div>
      </td>
      <td className={cn('w-px pl-4 pr-5 align-top', pad)}>
        <div className="flex items-center justify-end gap-2.5 min-w-[150px]">
          {i.input === 'number+text' ? (
            <input
              type="text"
              inputMode="numeric"
              aria-labelledby={libelleId}
              placeholder="À saisir"
              value={champs.chiffre}
              disabled={lecture}
              onChange={(e) => champs.changerNombre(e.target.value)}
              onBlur={saisie.envoyer}
              className={cn(
                'w-24 h-[34px] px-2.5 border rounded-[5px] bg-carte text-right text-[15px] font-semibold text-foreground placeholder:font-normal placeholder:text-text-light disabled:cursor-not-allowed',
                bordure(s),
              )}
            />
          ) : i.input === 'yesno' ? (
            <OuiNon
              libelleId={libelleId}
              valeur={champs.choix}
              disabled={lecture}
              statut={s}
              onChange={champs.choisir}
            />
          ) : (
            <Valeur indicateur={i} parent={parent} bis={bis} />
          )}
        </div>
      </td>
    </tr>
  )
}

function Annonces({
  horsAnnee,
  resultat,
}: {
  horsAnnee: boolean
  resultat: 'enregistre' | 'erreur' | null
}) {
  return (
    <>
      {horsAnnee && (
        <span className="text-xs text-text-light">
          Choisissez une année civile pour saisir
        </span>
      )}
      {resultat === 'erreur' && (
        <span role="alert" className="text-xs text-destructive">
          La réponse n'a pas été enregistrée. Réessayez.
        </span>
      )}
      <span aria-live="polite" className="text-xs text-text-light">
        {resultat === 'enregistre' ? 'Enregistré' : ''}
      </span>
    </>
  )
}

function OuiNon({
  libelleId,
  valeur,
  disabled,
  statut: s,
  onChange,
}: {
  libelleId: string
  valeur: boolean | null
  disabled: boolean
  statut: Statut
  onChange: (b: boolean | null) => void
}) {
  return (
    <ToggleGroup
      aria-labelledby={libelleId}
      value={valeur === null ? '' : valeur ? 'oui' : 'non'}
      disabled={disabled}
      onValueChange={(v) => onChange(v === '' ? null : v === 'oui')}
      className={cn('p-0.5 rounded-md bg-surface-douce', bordure(s))}
    >
      {['Oui', 'Non'].map((o) => (
        <ToggleGroupItem
          key={o}
          value={o.toLowerCase()}
          className="h-7 text-[13px] text-muted-foreground disabled:cursor-not-allowed data-[state=on]:bg-carte data-[state=on]:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm"
        >
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const corps25 = (n: string, t: string): ArsAnswerBody => ({
  numberValue: n === '' ? null : Number(n),
  textValue: t.trim() || null,
})

const bordure = (s: Statut) =>
  s === 'restant' ? 'border-a-saisir' : 'border-border'

function Valeur({
  indicateur: i,
  parent,
  bis,
}: {
  indicateur: ArsIndicator
  parent?: ArsIndicator
  bis: boolean
}) {
  if (i.kind === 'unavailable') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-text-light whitespace-nowrap">
        Non disponible
      </span>
    )
  }

  if (i.value === null) {
    return null
  }
  const part =
    parent?.value && parent.value > 0
      ? `${Math.round((i.value / parent.value) * 100)} % du ${parent.code}`
      : null
  return (
    <>
      {part && (
        <span className="text-xs text-text-light whitespace-nowrap">
          {part}
        </span>
      )}
      <span
        className={cn(
          'font-semibold text-foreground tabular-nums',
          bis ? 'text-[15px]' : 'text-[17px]',
        )}
      >
        {nombre(i.value)}
      </span>
      <Copier code={i.code} valeur={i.value} />
    </>
  )
}

function Copier({ code, valeur }: { code: string; valeur: number }) {
  const [copie, setCopie] = useState(false)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(minuteur.current), [])

  const copier = () =>
    navigator.clipboard.writeText(String(valeur)).then(
      () => {
        setCopie(true)
        clearTimeout(minuteur.current)
        minuteur.current = setTimeout(() => setCopie(false), 1500)
      },
      () => setCopie(false),
    )

  return (
    <>
      <button
        type="button"
        aria-label={`Copier la valeur ${code}`}
        onClick={copier}
        className="size-[26px] flex items-center justify-center rounded-[5px] text-sortis hover:bg-muted cursor-pointer"
      >
        {copie ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copie ? 'Copié' : ''}
      </span>
    </>
  )
}

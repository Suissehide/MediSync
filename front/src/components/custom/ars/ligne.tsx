import { Check, Copy, Info } from 'lucide-react'
import { useId, useState } from 'react'

import { type Statut, statut } from '@/components/custom/ars/statut.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { nombre } from '@/libs/csv.ts'
import { cn } from '@/libs/utils.ts'
import type { ArsIndicator } from '@/types/arsIndicator.ts'

// Les champs manuels restent desactives tant que la saisie n'est pas branchee.
export function LigneIndicateur({
  indicateur: i,
  parent,
}: {
  indicateur: ArsIndicator
  parent?: ArsIndicator
}) {
  const s = statut(i)
  const bis = i.code.endsWith('bis')
  const libelleId = useId()

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
              value={i.answer?.textValue ?? ''}
              disabled
              className="mt-1 w-full max-w-[560px] min-h-14 px-2.5 py-2 border border-border rounded-[5px] bg-surface-douce text-[13px] text-foreground resize-y disabled:cursor-not-allowed"
            />
          )}
        </div>
      </td>
      <td className={cn('w-px pl-4 pr-5 align-top', pad)}>
        <div className="flex items-center justify-end gap-2.5 min-w-[150px]">
          <Valeur
            indicateur={i}
            statut={s}
            parent={parent}
            libelleId={libelleId}
          />
        </div>
      </td>
    </tr>
  )
}

function Valeur({
  indicateur: i,
  statut: s,
  parent,
  libelleId,
}: {
  indicateur: ArsIndicator
  statut: Statut
  parent?: ArsIndicator
  libelleId: string
}) {
  const bordure = s === 'restant' ? 'border-a-saisir' : 'border-border'

  if (i.kind === 'unavailable') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-text-light whitespace-nowrap">
        Non disponible
      </span>
    )
  }

  if (i.input === 'number+text') {
    return (
      <input
        type="text"
        inputMode="numeric"
        aria-labelledby={libelleId}
        placeholder="À saisir"
        value={i.answer?.numberValue?.toString() ?? ''}
        disabled
        className={cn(
          'w-24 h-[34px] px-2.5 border rounded-[5px] bg-carte text-right text-[15px] font-semibold text-foreground placeholder:font-normal placeholder:text-text-light disabled:cursor-not-allowed',
          bordure,
        )}
      />
    )
  }

  if (i.input === 'yesno') {
    const b = i.answer?.boolValue
    return (
      <ToggleGroup
        aria-labelledby={libelleId}
        value={b === true ? 'oui' : b === false ? 'non' : ''}
        disabled
        className={cn('p-0.5 rounded-md bg-surface-douce', bordure)}
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
          parent ? 'text-[15px]' : 'text-[17px]',
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
  const copier = () =>
    navigator.clipboard.writeText(String(valeur)).then(
      () => {
        setCopie(true)
        setTimeout(() => setCopie(false), 1500)
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

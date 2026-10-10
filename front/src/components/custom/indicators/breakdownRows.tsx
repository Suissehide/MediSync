import { choiceColor } from '@/libs/choicePalette.ts'
import { nombre } from '@/libs/csv.ts'
import type { BreakdownRow } from '@/types/indicatorSet.ts'

const NON_RENSEIGNE = '__empty__'

// Sous-lignes de répartition, en part du total de l'indicateur : sur un choix multiple, les parts dépassent 100 % ensemble.
export function BreakdownRows({
  lignes,
  total,
}: {
  lignes: BreakdownRow[]
  total: number | null
}) {
  return lignes.map((ligne, index) => {
    const part = total ? Math.round((ligne.value / total) * 100) : null
    return (
      <tr key={ligne.key} className="bg-carte border-b border-muted">
        <td />
        <td className="pb-2">
          <div className="flex flex-col gap-1 pl-3.5 border-l-2 border-border">
            <span className="text-[13px] text-foreground">{ligne.label}</span>
            <div className="h-1 max-w-[560px] rounded-full bg-muted overflow-hidden">
              <span
                data-barre
                className={`block h-full ${ligne.key === NON_RENSEIGNE ? 'bg-autres-sortis' : ''}`}
                style={{
                  width: `${part ?? 0}%`,
                  backgroundColor:
                    ligne.key === NON_RENSEIGNE
                      ? undefined
                      : choiceColor(index),
                }}
              />
            </div>
          </div>
        </td>
        <td className="pl-4 pr-5 pb-2 align-top">
          <div className="flex items-baseline justify-end gap-2.5 min-w-[150px] pr-9">
            {part !== null && (
              <span className="text-xs text-text-light whitespace-nowrap">
                {`${part} %`}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {nombre(ligne.value)}
            </span>
          </div>
        </td>
      </tr>
    )
  })
}

import type { CalendarController } from '@fullcalendar/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../../../libs/utils.ts'
import { Button } from '../../ui/button.tsx'
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group.tsx'

export type VueCalendrier = { type: string; libelle?: string }

type Props = {
  controller: CalendarController
  /** Sans libellé, celui de la locale de FullCalendar. */
  vues?: VueCalendrier[]
  aujourdhui?: boolean
  onChoisirDate?: (cible: HTMLElement) => void
  className?: string
}

// La barre de FullCalendar, rendue avec nos composants : la v7 ne pose plus de classes à styler.
export function BarreCalendrier({
  controller,
  vues,
  aujourdhui = true,
  onChoisirDate,
  className,
}: Props) {
  const etat = controller.getButtonState()
  const vue = controller.view

  return (
    <div
      className={cn('flex flex-wrap items-center gap-4 px-6 pb-4', className)}
    >
      <div className="flex flex-1 items-center text-[15px] font-semibold text-text-dark">
        {vue?.title}
      </div>

      {vues && (
        <div className="flex flex-1 justify-center">
          <ToggleGroup
            value={vue?.type}
            onValueChange={(type) => type && controller.changeView(type)}
          >
            {vues.map(({ type, libelle }) => (
              <ToggleGroupItem
                key={type}
                value={type}
                className="h-[26px] rounded-lg px-3 text-[13px] font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {libelle ?? etat[type]?.text ?? type}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <div className="flex flex-1 items-center justify-end gap-2">
        {aujourdhui && (
          <Button
            variant="outline"
            // Masqué et non retiré : les autres boutons ne bougent pas.
            className={cn(etat.today.isDisabled && 'invisible')}
            onClick={() => controller.today()}
          >
            {etat.today.text}
          </Button>
        )}
        {onChoisirDate && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Choisir une date"
            onClick={(e) => onChoisirDate(e.currentTarget)}
          >
            <CalendarDays className="size-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          aria-label={etat.prev.hint}
          disabled={etat.prev.isDisabled}
          onClick={() => controller.prev()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={etat.next.hint}
          disabled={etat.next.isDisabled}
          onClick={() => controller.next()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

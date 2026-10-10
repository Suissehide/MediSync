import dayjs, { type Dayjs } from 'dayjs'
import { Minus, Plus, RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useForbiddenWeekQueries } from '../../../queries/useForbiddenWeek.ts'
import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { WeekPicker } from '../../ui/weekPicker.tsx'

const MIN_WEEK_COUNT = 1
const MAX_WEEK_COUNT = 52
const DEFAULT_WEEK_COUNT = 6

interface PlanningCycleFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  cycle: PlanningCycle | null | undefined
  onSave: (cycle: PlanningCycle) => void
  onReset: () => void
  isPending?: boolean
}

export function PlanningCycleForm({
  open,
  setOpen,
  cycle,
  onSave,
  onReset,
  isPending = false,
}: PlanningCycleFormProps) {
  const [weekStart, setWeekStart] = useState<Dayjs>(() =>
    dayjs.utc().isoWeekday(1).startOf('day'),
  )
  const [weekCount, setWeekCount] = useState(DEFAULT_WEEK_COUNT)
  const { forbiddenWeeks } = useForbiddenWeekQueries()

  // À chaque ouverture, on repart du cycle enregistré : la popup ne doit pas
  // conserver une saisie abandonnée lors d'une ouverture précédente.
  useEffect(() => {
    if (!open) {
      return
    }
    setWeekStart(
      cycle
        ? dayjs.utc(cycle.startOfWeek).isoWeekday(1).startOf('day')
        : dayjs.utc().isoWeekday(1).startOf('day'),
    )
    setWeekCount(cycle?.weekCount ?? DEFAULT_WEEK_COUNT)
  }, [open, cycle])

  const handleWeekChange = (date: Dayjs | null) => {
    if (!date) {
      return
    }
    setWeekStart(dayjs.utc(date.format('YYYY-MM-DD')).isoWeekday(1))
  }

  const preview: PlanningCycle = {
    startOfWeek: weekStart.format('YYYY-MM-DD'),
    weekCount,
    forbiddenWeekStarts: (forbiddenWeeks ?? []).map((w) => w.startOfWeek),
  }
  // Les semaines interdites repoussent le retour à S1.
  let restartWeek = weekStart.add(7, 'day')
  while (cycleWeekNumber(restartWeek, preview) !== 1) {
    restartWeek = restartWeek.add(7, 'day')
  }
  const currentWeek = cycleWeekNumber(dayjs.utc(), preview)

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Cycle de semaines
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            Le planning numérote les semaines selon ce cycle au lieu du numéro
            de semaine de l’année.
          </p>

          <div className="flex flex-col gap-4">
            <FormField>
              <Label>Semaine de départ</Label>
              <WeekPicker value={weekStart} onChange={handleWeekChange} />
            </FormField>

            <FormField>
              <Label>Longueur du cycle</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setWeekCount((count) => Math.max(MIN_WEEK_COUNT, count - 1))
                  }
                  disabled={weekCount <= MIN_WEEK_COUNT}
                  className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Minus className="h-4 w-4 text-text-dark" />
                </button>

                <span className="w-24 text-center text-sm font-medium text-text-dark">
                  {weekCount} semaine{weekCount > 1 ? 's' : ''}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setWeekCount((count) => Math.min(MAX_WEEK_COUNT, count + 1))
                  }
                  disabled={weekCount >= MAX_WEEK_COUNT}
                  className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4 text-text-dark" />
                </button>
              </div>
            </FormField>
          </div>

          <p className="mt-4 text-sm text-text-light">
            S1 = semaine du{' '}
            <span className="font-medium text-text-dark">
              {weekStart.format('DD/MM/YYYY')}
            </span>
            , retour à S1 le{' '}
            <span className="font-medium text-text-dark">
              {restartWeek.format('DD/MM/YYYY')}
            </span>
            . Cette semaine est actuellement{' '}
            <span className="font-medium text-text-dark">
              {currentWeek === null ? 'interdite' : `S${currentWeek}`}
            </span>
            .
          </p>
        </PopupBody>

        <PopupFooter>
          {cycle && (
            <Button
              variant="ghost"
              className="mr-auto text-text-light hover:text-text-dark"
              onClick={onReset}
              disabled={isPending}
            >
              <RotateCcw className="w-4 h-4" />
              Réinitialiser
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() =>
              onSave({
                startOfWeek: weekStart.format('YYYY-MM-DD'),
                weekCount,
              })
            }
            disabled={isPending}
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

import dayjs, { type Dayjs } from 'dayjs'
import { Minus, MoveRight, Plus, X } from 'lucide-react'

import type { ForbiddenWeek } from '../../../types/forbiddenWeek.ts'
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

interface BulkMoveFormBaseProps {
  open: boolean
  setOpen: (open: boolean) => void
  count: number
  onConfirm: () => void
}

interface NormalModeProps extends BulkMoveFormBaseProps {
  editMode?: false
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
  planningCycle?: PlanningCycle | null
  forbiddenWeeks: ForbiddenWeek[]
  targetWeekNumber?: never
  onTargetWeekNumberChange?: never
}

interface EditModeProps extends BulkMoveFormBaseProps {
  editMode: true
  targetWeekNumber: number
  onTargetWeekNumberChange: (value: number) => void
  weekDate?: never
  onWeekChange?: never
  forbiddenWeeks?: never
}

type BulkMoveFormProps = NormalModeProps | EditModeProps

export function BulkMoveForm(props: BulkMoveFormProps) {
  const { open, setOpen, count, onConfirm, editMode } = props
  const forbiddenWeekStarts = new Set(
    (props.forbiddenWeeks ?? []).map((w) =>
      dayjs.utc(w.startOfWeek).format('YYYY-MM-DD'),
    ),
  )
  const isForbiddenTarget =
    !!props.weekDate &&
    forbiddenWeekStarts.has(props.weekDate.isoWeekday(1).format('YYYY-MM-DD'))

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Déplacer les créneaux
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            {count} créneau{count > 1 ? 'x' : ''} sélectionné
            {count > 1 ? 's' : ''}. Choisissez la semaine cible pour le
            déplacement.
          </p>

          {editMode ? (
            <EditModeContent
              targetWeekNumber={props.targetWeekNumber}
              onTargetWeekNumberChange={props.onTargetWeekNumberChange}
            />
          ) : (
            <NormalModeContent
              weekDate={props.weekDate}
              onWeekChange={props.onWeekChange}
              planningCycle={props.planningCycle}
              forbiddenWeekStarts={forbiddenWeekStarts}
              isForbiddenTarget={isForbiddenTarget}
            />
          )}
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={!editMode && !props.weekDate}
          >
            <MoveRight className="w-4 h-4" />
            Déplacer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

function NormalModeContent({
  weekDate,
  onWeekChange,
  planningCycle,
  forbiddenWeekStarts,
  isForbiddenTarget,
}: {
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
  planningCycle?: PlanningCycle | null
  forbiddenWeekStarts: Set<string>
  isForbiddenTarget: boolean
}) {
  const weekStart = weekDate?.isoWeekday(1) ?? null
  const weekStartLabel = weekStart ? weekStart.format('DD MMMM YYYY') : ''
  const weekEndLabel = weekStart
    ? weekStart.add(4, 'day').format('DD MMMM YYYY')
    : ''
  const cycleWeek =
    weekStart && planningCycle ? cycleWeekNumber(weekStart, planningCycle) : 0
  const cycleLabel =
    isForbiddenTarget || cycleWeek === null
      ? 'Semaine interdite — '
      : cycleWeek
        ? `S${cycleWeek} — `
        : ''

  return (
    <>
      <FormField>
        <Label>Semaine cible</Label>
        <WeekPicker
          value={weekDate}
          onChange={onWeekChange}
          forbiddenWeekStarts={forbiddenWeekStarts}
        />
      </FormField>

      {weekStart && (
        <p className="mt-2 text-sm text-text-light">
          <span className="font-medium text-text-dark">{cycleLabel}</span>
          Semaine du{' '}
          <span className="font-medium text-text-dark">{weekStartLabel}</span>{' '}
          au <span className="font-medium text-text-dark">{weekEndLabel}</span>
        </p>
      )}
    </>
  )
}

function EditModeContent({
  targetWeekNumber,
  onTargetWeekNumberChange,
}: {
  targetWeekNumber: number
  onTargetWeekNumberChange: (value: number) => void
}) {
  return (
    <>
      <FormField>
        <Label>Semaine cible du parcours</Label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onTargetWeekNumberChange(Math.max(1, targetWeekNumber - 1))
            }
            className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer"
          >
            <Minus className="h-4 w-4 text-text-dark" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-light">Semaine</span>
            <input
              type="number"
              min={1}
              value={targetWeekNumber}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!Number.isNaN(v) && v >= 1) {
                  onTargetWeekNumberChange(v)
                }
              }}
              className="w-16 h-9 rounded-md border border-border bg-background px-2 text-center text-sm font-medium text-text-dark focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            type="button"
            onClick={() => onTargetWeekNumberChange(targetWeekNumber + 1)}
            className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4 text-text-dark" />
          </button>
        </div>
      </FormField>
    </>
  )
}

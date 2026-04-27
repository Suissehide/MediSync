import type { Dayjs } from 'dayjs'
import { Copy, Minus, Plus, X } from 'lucide-react'

import { Button } from '../../ui/button.tsx'
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

interface BulkDuplicateFormBaseProps {
  open: boolean
  setOpen: (open: boolean) => void
  count: number
  onConfirm: () => void
}

interface NormalModeProps extends BulkDuplicateFormBaseProps {
  editMode?: false
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
  targetWeekNumber?: never
  onTargetWeekNumberChange?: never
}

interface EditModeProps extends BulkDuplicateFormBaseProps {
  editMode: true
  targetWeekNumber: number
  onTargetWeekNumberChange: (value: number) => void
  weekDate?: never
  onWeekChange?: never
}

type BulkDuplicateFormProps = NormalModeProps | EditModeProps

export function BulkDuplicateForm(props: BulkDuplicateFormProps) {
  const { open, setOpen, count, onConfirm, editMode } = props

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Dupliquer les créneaux
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            {count} créneau{count > 1 ? 'x' : ''} sélectionné
            {count > 1 ? 's' : ''}. Choisissez la semaine cible pour la
            duplication.
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
            />
          )}
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={!editMode && !props.weekDate}
          >
            <Copy className="w-4 h-4" />
            Dupliquer
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

function NormalModeContent({
  weekDate,
  onWeekChange,
}: {
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
}) {
  const weekStart = weekDate?.isoWeekday(1) ?? null
  const weekStartLabel = weekStart ? weekStart.format('DD MMMM YYYY') : ''
  const weekEndLabel = weekStart
    ? weekStart.add(4, 'day').format('DD MMMM YYYY')
    : ''

  return (
    <>
      <Label className="block text-sm font-medium text-text-dark mb-1">
        Semaine cible
      </Label>
      <WeekPicker value={weekDate} onChange={onWeekChange} />

      {weekStart && (
        <p className="mt-2 text-sm text-text-light">
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
      <Label className="block text-sm font-medium text-text-dark mb-2">
        Semaine cible du parcours
      </Label>
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
    </>
  )
}

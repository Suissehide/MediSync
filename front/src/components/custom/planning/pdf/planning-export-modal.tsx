import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'
import dayjs, { type Dayjs } from 'dayjs'
import { Download, Minus, Plus, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { useForbiddenWeekQueries } from '../../../../queries/useForbiddenWeek.ts'
import { usePathwayTemplateQueries } from '../../../../queries/usePathwayTemplate.ts'
import { useSlotsInRangeQuery } from '../../../../queries/useSlot.ts'
import { Button } from '../../../ui/button.tsx'
import { Label } from '../../../ui/label.tsx'
import { WeekPicker } from '../../../ui/weekPicker.tsx'
import PathwayFilter, { NO_PATHWAY_KEY } from '../pathwayFilter.tsx'
import { buildPlanningWeeks } from './planning-pdf.utils.ts'
import PlanningWeeksPDF from './planning-weeks.pdf.tsx'

const MIN_WEEK_COUNT = 1
const MAX_WEEK_COUNT = 12
const DEFAULT_WEEK_COUNT = 4

interface PlanningExportModalProps {
  /** Date affichée dans le planning, utilisée comme semaine de départ. */
  initialDate?: string
  onClose: () => void
}

export default function PlanningExportModal({
  initialDate,
  onClose,
}: PlanningExportModalProps) {
  const [weekStart, setWeekStart] = useState<Dayjs>(() =>
    dayjs
      .utc(initialDate || undefined)
      .isoWeekday(1)
      .startOf('day'),
  )
  const [weekCount, setWeekCount] = useState(DEFAULT_WEEK_COUNT)

  // On raisonne en parcours *exclus* plutôt que sélectionnés : les modèles
  // arrivent de façon asynchrone, et tout est coché par défaut.
  const [excludedPathwayIds, setExcludedPathwayIds] = useState<Set<string>>(
    new Set(),
  )

  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { forbiddenWeeks } = useForbiddenWeekQueries()

  const range = useMemo(
    () => ({
      from: weekStart.format('YYYY-MM-DD'),
      to: weekStart.add(weekCount * 7, 'day').format('YYYY-MM-DD'),
    }),
    [weekStart, weekCount],
  )
  const { slots, isFetching } = useSlotsInRangeQuery(range)

  const handleWeekChange = useCallback((date: Dayjs | null) => {
    if (!date) {
      return
    }
    setWeekStart(dayjs.utc(date.format('YYYY-MM-DD')).isoWeekday(1))
  }, [])

  const handleTogglePathway = useCallback((id: string, checked: boolean) => {
    setExcludedPathwayIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAllPathways = useCallback(() => {
    setExcludedPathwayIds(new Set())
  }, [])

  const handleClearPathways = useCallback(() => {
    setExcludedPathwayIds(
      new Set([
        NO_PATHWAY_KEY,
        ...(pathwayTemplates ?? []).map((template) => template.id),
      ]),
    )
  }, [pathwayTemplates])

  const selectedSlots = useMemo(
    () =>
      (slots ?? []).filter(
        (slot) =>
          !excludedPathwayIds.has(slot.pathway?.template?.id ?? NO_PATHWAY_KEY),
      ),
    [slots, excludedPathwayIds],
  )

  const forbiddenWeekStarts = useMemo(
    () => (forbiddenWeeks ?? []).map((week) => week.startOfWeek),
    [forbiddenWeeks],
  )

  const weeks = useMemo(
    () =>
      buildPlanningWeeks(
        selectedSlots,
        weekStart,
        weekCount,
        forbiddenWeekStarts,
      ),
    [selectedSlots, weekStart, weekCount, forbiddenWeekStarts],
  )

  const pdfDocument = useMemo(
    () => <PlanningWeeksPDF weeks={weeks} />,
    [weeks],
  )

  const fileName = `planning-${weekStart.format('YYYY-MM-DD')}-${weekCount}-semaines.pdf`

  const lastWeekEnd = weekStart.add(weekCount * 7 - 3, 'day')
  const slotCount = weeks.reduce(
    (total, week) =>
      total +
      week.timeRows.reduce(
        (weekTotal, row) =>
          weekTotal + row.cells.reduce((sum, cell) => sum + cell.length, 0),
        0,
      ),
    0,
  )

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">Exporter le planning</h2>
          <div className="flex items-center gap-4">
            <PDFDownloadLink document={pdfDocument} fileName={fileName}>
              {({ loading }) => (
                <Button
                  variant="default"
                  size="default"
                  disabled={loading || isFetching}
                >
                  <Download className="h-4 w-4" />
                  {loading ? 'Génération...' : 'Télécharger'}
                </Button>
              )}
            </PDFDownloadLink>
            <Button variant="outline" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-border p-4 flex flex-col gap-6">
            <div>
              <Label className="block text-sm font-medium text-text-dark mb-1">
                Semaine de départ
              </Label>
              <WeekPicker value={weekStart} onChange={handleWeekChange} />
            </div>

            <div>
              <Label className="block text-sm font-medium text-text-dark mb-2">
                Nombre de semaines
              </Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setWeekCount((count) =>
                      Math.max(MIN_WEEK_COUNT, count - 1),
                    )
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
                    setWeekCount((count) =>
                      Math.min(MAX_WEEK_COUNT, count + 1),
                    )
                  }
                  disabled={weekCount >= MAX_WEEK_COUNT}
                  className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4 text-text-dark" />
                </button>
              </div>
            </div>

            <div>
              <Label className="block text-sm font-medium text-text-dark mb-2">
                Parcours à inclure
              </Label>
              <PathwayFilter
                templates={pathwayTemplates ?? []}
                hiddenIds={excludedPathwayIds}
                onToggle={handleTogglePathway}
                onReset={handleSelectAllPathways}
                onHideAll={handleClearPathways}
              />
            </div>

            <p className="text-sm text-text-light">
              Du{' '}
              <span className="font-medium text-text-dark">
                {weekStart.format('DD/MM/YYYY')}
              </span>{' '}
              au{' '}
              <span className="font-medium text-text-dark">
                {lastWeekEnd.format('DD/MM/YYYY')}
              </span>{' '}
              — {slotCount} créneau{slotCount > 1 ? 'x' : ''}, une page paysage
              par semaine.
            </p>
          </aside>

          <div className="flex-1 min-w-0">
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              {pdfDocument}
            </PDFViewer>
          </div>
        </div>
      </div>
    </div>
  )
}

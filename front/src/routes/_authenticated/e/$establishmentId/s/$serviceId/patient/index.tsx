import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PatientApi } from '@/api/patient.api.ts'
import { getPatientColumns } from '@/columns/patient.column.tsx'
import AddPatientForm from '@/components/custom/popup/addPatientForm.tsx'
import AddPatientToSlotForm from '@/components/custom/popup/addPatientToSlotForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import DropdownFilter from '@/components/ui/dropdownFilter.tsx'
import { Input } from '@/components/ui/input.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { useCan } from '@/hooks/useCan.ts'
import { safeParse } from '@/libs/utils.ts'
import { usePathwayTemplateQueries } from '@/queries/usePathwayTemplate.ts'
import { usePatientWithTagsQuery } from '@/queries/usePatient.tsx'
import { useServiceFieldsQuery } from '@/queries/useServiceField.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientWithTags } from '@/types/patient.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/patient/',
)({
  component: PatientList,
})

const STATUSES = {
  all: 'Tous',
  active: 'En cours',
  exited: 'Sortis',
} as const
type Status = keyof typeof STATUSES
const DEFAULT_STATUS: Status = 'active'

const filtersStorageKey = (serviceId: string) => `patient/filters/${serviceId}`

const matchesStatus = (p: PatientWithTags, status: Status) =>
  status === 'all' || Boolean(p.exitDate) === (status === 'exited')

const matchesTags = (p: PatientWithTags, tags: string[]) =>
  tags.length === 0 || tags.some((tag) => p.pathwayTemplateTags?.includes(tag))

function PatientList() {
  const navigate = useNavigate()
  const { establishmentId, serviceId } = Route.useParams()
  const { patients, isPending } = usePatientWithTagsQuery()
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { fields, isPending: isFieldsPending } = useServiceFieldsQuery()
  const canReadClinical = useCan('clinical:read')
  const [searchTerm, setSearchTerm] = useState('')
  const [storedFilters] = useState(() =>
    safeParse<{ status?: string; tags?: string[] }>(
      localStorage.getItem(filtersStorageKey(serviceId)),
      {},
    ),
  )
  const [selectedTags, setSelectedTags] = useState<string[]>(
    Array.isArray(storedFilters.tags) ? storedFilters.tags : [],
  )
  const [status, setStatus] = useState<Status>(
    storedFilters.status && storedFilters.status in STATUSES
      ? (storedFilters.status as Status)
      : DEFAULT_STATUS,
  )
  const [isExporting, setIsExporting] = useState(false)
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonyme'
  const tableId = `patient/${serviceId}/${userId}`
  const [resetSignal, setResetSignal] = useState(0)
  const [columnFiltersActive, setColumnFiltersActive] = useState(false)

  useEffect(() => {
    localStorage.setItem(
      filtersStorageKey(serviceId),
      JSON.stringify({ status, tags: selectedTags }),
    )
  }, [serviceId, status, selectedTags])

  const handleRedirectPatient = useCallback(
    async (patientID: string) => {
      await navigate({
        to: '/e/$establishmentId/s/$serviceId/patient/$patientID',
        params: { establishmentId, serviceId, patientID },
      })
    },
    [navigate, establishmentId, serviceId],
  )

  const columns = useMemo(
    () =>
      getPatientColumns({
        onView: handleRedirectPatient,
        fields,
        canReadClinical,
      }),
    [fields, canReadClinical, handleRedirectPatient],
  )

  // Couleur d'un tag principal : celle du premier parcours qui le porte.
  const tagColors = useMemo(() => {
    const colors = new Map<string, string>()
    for (const t of pathwayTemplates ?? []) {
      if (!colors.has(t.mainTag)) {
        colors.set(t.mainTag, t.color)
      }
    }
    return colors
  }, [pathwayTemplates])

  const searched = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (patients ?? [])
      .filter(
        (p) =>
          !term ||
          p.firstName?.toLowerCase().includes(term) ||
          p.lastName?.toLowerCase().includes(term),
      )
      .sort((a, b) =>
        `${a.lastName ?? ''} ${a.firstName ?? ''}`.localeCompare(
          `${b.lastName ?? ''} ${b.firstName ?? ''}`,
          'fr',
        ),
      )
  }, [patients, searchTerm])

  // Le compteur d'un parcours tient compte du statut, pas des autres parcours.
  const byTags = searched.filter((p) => matchesTags(p, selectedTags))
  const byStatus = searched.filter((p) => matchesStatus(p, status))
  const filteredPatients = byTags.filter((p) => matchesStatus(p, status))

  const tagFilters = [...tagColors.keys()].sort().map((tag) => ({
    id: tag,
    label: tag,
    color: tagColors.get(tag),
    checked: selectedTags.includes(tag),
    count: byStatus.filter((p) => p.pathwayTemplateTags?.includes(tag)).length,
  }))

  const handleTagChange = (id: string, checked: boolean) => {
    setSelectedTags((prev) =>
      checked ? [...prev, id] : prev.filter((t) => t !== id),
    )
  }

  const resetFilters = () => {
    setStatus(DEFAULT_STATUS)
    setSelectedTags([])
    setResetSignal((n) => n + 1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await PatientApi.exportExcel({
        search: searchTerm.trim() || undefined,
        pathwayTemplateTags: selectedTags.length ? selectedTags : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `patients_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DashboardLayout
      quickActions={[
        <AddPatientForm key="add-patient" />,
        <AddPatientToSlotForm key="add-patient-to-slot" />,
      ]}
    >
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="min-h-9 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              navigate({
                to: '/e/$establishmentId/s/$serviceId/dashboard',
                params: { establishmentId, serviceId },
              })
            }
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-text-dark text-xl font-semibold">
            Liste des patients
          </h1>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Monté une fois les champs connus : ReactTable lit visibilité et filtres sauvés au montage. */}
          {!isFieldsPending && (
            <ReactTable<PatientWithTags>
              key={tableId}
              data={filteredPatients}
              columns={columns}
              filterId={tableId}
              pagination
              isLoading={isPending}
              isRowMuted={(patient) => Boolean(patient.exitDate)}
              onRowClick={(patient) => handleRedirectPatient(patient.id)}
              resetSignal={resetSignal}
              onColumnFiltersActiveChange={setColumnFiltersActive}
              toolbar={
                <>
                  <Input
                    id="patient-search"
                    iconLeft={<Search className="w-4 h-4" />}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nom, prénom..."
                    className="w-72"
                  />
                  <ToggleGroup
                    value={status}
                    onValueChange={(v) => v && setStatus(v as Status)}
                  >
                    {(Object.keys(STATUSES) as Status[]).map((key) => (
                      <ToggleGroupItem key={key} value={key}>
                        {STATUSES[key]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {tagFilters.length > 0 && (
                    <DropdownFilter
                      filters={tagFilters}
                      onFilterChange={handleTagChange}
                      triggerLabel={
                        selectedTags.length
                          ? `Parcours · ${selectedTags.length}`
                          : 'Parcours'
                      }
                      TriggerIcon={RouteIcon}
                      headerAction={
                        selectedTags.length
                          ? {
                              label: 'Tout effacer',
                              icon: RotateCcw,
                              onSelect: () => setSelectedTags([]),
                            }
                          : undefined
                      }
                    />
                  )}
                  {(status !== DEFAULT_STATUS ||
                    selectedTags.length > 0 ||
                    columnFiltersActive) && (
                    <Button variant="ghost" onClick={resetFilters}>
                      <X className="w-4 h-4" />
                      Réinitialiser
                    </Button>
                  )}
                </>
              }
              toolbarEnd={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleExport}
                  isLoading={isExporting}
                >
                  <Download className="w-4 h-4" />
                </Button>
              }
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default PatientList

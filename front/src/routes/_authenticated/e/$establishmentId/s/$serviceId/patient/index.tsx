import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PatientApi } from '@/api/patient.api.ts'
import { getPatientColumns } from '@/columns/patient.column.tsx'
import AddPatientForm from '@/components/custom/popup/addPatientForm.tsx'
import AddPatientToSlotForm from '@/components/custom/popup/addPatientToSlotForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import DropdownFilter from '@/components/ui/dropdownFilter.tsx'
import { Input } from '@/components/ui/input.tsx'
import { usePathwayTemplateQueries } from '@/queries/usePathwayTemplate.ts'
import { usePatientWithTagsQuery } from '@/queries/usePatient.tsx'
import type { PatientWithTags } from '@/types/patient.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/patient/',
)({
  component: PatientList,
})

const EXIT_STATUSES: Record<string, string> = {
  exited: 'Sortis',
  notExited: 'Non sortis',
}

function PatientList() {
  const navigate = useNavigate()
  const { establishmentId, serviceId } = Route.useParams()
  const { patients, isPending } = usePatientWithTagsQuery()
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [exitStatuses, setExitStatuses] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const handleRedirectPatient = async (patientID: string) => {
    await navigate({
      to: '/e/$establishmentId/s/$serviceId/patient/$patientID',
      params: { establishmentId, serviceId, patientID },
    })
  }

  const columns = getPatientColumns({
    onView: handleRedirectPatient,
    pathwayTemplates: pathwayTemplates ?? [],
  })

  const allTags = useMemo(
    () => [...new Set((pathwayTemplates ?? []).map((t) => t.mainTag))].sort(),
    [pathwayTemplates],
  )

  const filters = [
    ...Object.entries(EXIT_STATUSES).map(([id, label]) => ({
      id,
      label,
      group: 'Sortie',
      checked: exitStatuses.includes(id),
    })),
    ...allTags.map((tag) => ({
      id: tag,
      label: tag,
      group: 'Parcours',
      checked: selectedTags.includes(tag),
    })),
  ]

  const handleFilterChange = (id: string, checked: boolean) => {
    const setter = id in EXIT_STATUSES ? setExitStatuses : setSelectedTags
    setter((prev) => (checked ? [...prev, id] : prev.filter((t) => t !== id)))
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

  const filteredPatients = useMemo(() => {
    let result = patients ?? []
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (p) =>
          p.firstName?.toLowerCase().includes(term) ||
          p.lastName?.toLowerCase().includes(term),
      )
    }
    if (selectedTags.length) {
      result = result.filter((p) =>
        selectedTags.some((tag) => p.pathwayTemplateTags?.includes(tag)),
      )
    }
    if (exitStatuses.length === 1) {
      const wantExited = exitStatuses[0] === 'exited'
      result = result.filter((p) => Boolean(p.exitDate) === wantExited)
    }
    return [...result].sort((a, b) =>
      `${a.lastName ?? ''} ${a.firstName ?? ''}`.localeCompare(
        `${b.lastName ?? ''} ${b.firstName ?? ''}`,
        'fr',
      ),
    )
  }, [patients, searchTerm, selectedTags, exitStatuses])

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

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Input
              id="patient-search"
              iconLeft={<Search className="w-4 h-4" />}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom, prénom..."
              className="w-72"
            />
          </div>
          <div className="flex-1 border-t border-border" />
          <div className="flex gap-3">
            <DropdownFilter
              filters={filters}
              onFilterChange={handleFilterChange}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleExport}
              isLoading={isExporting}
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <ReactTable<PatientWithTags>
            data={filteredPatients}
            columns={columns}
            filterId="patient"
            pagination
            isLoading={isPending}
            isRowMuted={(patient) => Boolean(patient.exitDate)}
            onRowClick={(patient) => handleRedirectPatient(patient.id)}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default PatientList

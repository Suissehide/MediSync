import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PatientApi } from '../../../api/patient.api.ts'
import { getPatientColumns } from '../../../columns/patient.column.tsx'
import AddPatientForm from '../../../components/custom/popup/addPatientForm.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import ReactTable from '../../../components/table/reactTable.tsx'
import { Button } from '../../../components/ui/button.tsx'
import DropdownFilter from '../../../components/ui/dropdownFilter.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import { usePatientWithTagsQuery } from '../../../queries/usePatient.ts'
import type { PatientWithTags } from '../../../types/patient.ts'

export const Route = createFileRoute('/_authenticated/patient/')({
  component: PatientList,
})

function PatientList() {
  const navigate = useNavigate()
  const { patients, isPending } = usePatientWithTagsQuery()
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const handleRedirectPatient = async (patientID: string) => {
    await navigate({ to: '/patient/$patientID', params: { patientID } })
  }

  const columns = getPatientColumns({ onView: handleRedirectPatient, pathwayTemplates: pathwayTemplates ?? [] })

  const allTags = useMemo(
    () =>
      [
        ...new Set((pathwayTemplates ?? []).flatMap((t) => t.tags ?? [])),
      ].sort(),
    [pathwayTemplates],
  )

  const tagFilters = allTags.map((tag) => ({
    id: tag,
    label: tag,
    checked: selectedTags.includes(tag),
  }))

  const handleTagFilterChange = (id: string, checked: boolean) => {
    setSelectedTags((prev) =>
      checked ? [...prev, id] : prev.filter((t) => t !== id),
    )
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
    return result
  }, [patients, searchTerm, selectedTags])

  return (
    <DashboardLayout quickActions={[<AddPatientForm key="add-patient" />]}>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: '/dashboard' })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-text-foreground text-xl font-semibold">
            Liste des patients
          </h2>
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
            {tagFilters.length > 0 && (
              <DropdownFilter
                filters={tagFilters}
                onFilterChange={handleTagFilterChange}
              />
            )}
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

        <div className="flex-1 flex flex-col">
          <ReactTable<PatientWithTags>
            data={filteredPatients}
            columns={columns}
            filterId="patient"
            pagination
            isLoading={isPending}
            onRowClick={(patient) => handleRedirectPatient(patient.id)}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default PatientList

import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import dayjs from 'dayjs'
import {
  ArrowLeft,
  ArrowRightFromLine,
  Bookmark,
  BriefcaseMedical,
  Calendar,
  CalendarPlus,
  ChevronRight,
  Ellipsis,
  FileDown,
  LayoutTemplate,
  type LucideIcon,
  Pencil,
  Route as RouteIcon,
  User,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'

import EditPatient from '../../../components/custom/Patient/edit/edit.patient.tsx'
import ProgrammePDFModal from '../../../components/custom/Patient/pdf/programme-pdf-modal.tsx'
import OutcomeReviewPatient from '../../../components/custom/Patient/view/outcome-review.patient.tsx'
import OverviewPatient from '../../../components/custom/Patient/view/overview.patient.tsx'
import PathwayInclusionPatient from '../../../components/custom/Patient/view/pathway-inclusion.patient.tsx'
import PlanningPatient from '../../../components/custom/Patient/view/planning.patient.tsx'
import ProfileContextPatient from '../../../components/custom/Patient/view/profile-context.patient.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import { Button } from '../../../components/ui/button.tsx'
import {
  DropdownMenuCustomContent,
  DropdownMenuCustomItem,
} from '../../../components/ui/dropdownMenu.tsx'
import { GENDER } from '../../../constants/patient.constant.ts'
import { usePatientByIDQuery } from '../../../queries/usePatient.ts'

export const Route = createFileRoute('/_authenticated/patient/$patientID')({
  component: PatientDetails,
})

export type MenuItem = {
  id: string
  label: string
  icon: LucideIcon
}

function PatientDetails() {
  const navigate = useNavigate()

  const { patientID } = useParams({
    from: '/_authenticated/patient/$patientID',
  })
  const { patient } = usePatientByIDQuery(patientID)

  const [editMode, setEditMode] = useState(false)
  const [showPDFModal, setShowPDFModal] = useState(false)

  const [selected, setSelected] = useState<string>('overview')
  const menuItems: MenuItem[] = [
    {
      id: 'overview',
      label: 'Aperçu général',
      icon: LayoutTemplate,
    },
    {
      id: 'profile',
      label: 'Profil & Contexte',
      icon: User,
    },
    {
      id: 'pathway',
      label: 'Parcours & Inclusion',
      icon: RouteIcon,
    },
    {
      id: 'outcome',
      label: 'Sortie & Bilan',
      icon: Bookmark,
    },
    {
      id: 'planning',
      label: 'Planning',
      icon: Calendar,
    },
  ]

  return (
    <DashboardLayout components={['patient']}>
      {editMode ? (
        <EditPatient patient={patient} setEditMode={setEditMode} />
      ) : (
        <div className="py-4 px-4 h-full flex flex-col gap-4">
          <div className="flex gap-2 items-center text-sm">
            <ArrowRightFromLine size={18} className="font-bold" />
            <button
              type="button"
              className="cursor-pointer text-text-light transition duration-300 hover:underline"
              onClick={() => navigate({ to: '/patient' })}
            >
              Patients
            </button>
            <div className="text-text-light italic text-xs">/</div>
            <div>
              {patient?.firstName} {patient?.lastName}
            </div>
          </div>

          <div className="flex-1 flex gap-4">
            <div className="h-fit w-[400px] border border-border rounded-lg">
              <div className="px-4 py-4 flex justify-between items-center">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => navigate({ to: '/patient' })}
                >
                  <ArrowLeft size={16} />
                  Retour
                </Button>
              </div>

              <div className="w-full border-t border-border" />
              <div className="px-4 py-4">
                <h3 className="mt-2 text-2xl font-semibold">
                  {patient?.firstName} {patient?.lastName}
                </h3>
                <div className="text-sm text-text-light">
                  {patient?.gender &&
                  GENDER[patient.gender as keyof typeof GENDER]
                    ? GENDER[patient.gender as keyof typeof GENDER]
                    : 'Non spécifié'}
                  , {dayjs().diff(dayjs(patient?.birthDate), 'year')}
                </div>
                <div className="flex items-center gap-2 my-4">
                  <Button
                    type="button"
                    variant="default"
                    size="default"
                    className="flex-1"
                  >
                    <BriefcaseMedical className="h-4 w-4" />
                    <span className="text-sm">Diagnostic éducatif</span>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    onClick={() => setEditMode(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="default" size="icon">
                    <CalendarPlus className="h-4 w-4" />
                  </Button>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button type="button" variant="outline" size="icon">
                        <Ellipsis className="h-4 w-4" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenuCustomContent align="end">
                      <DropdownMenuCustomItem
                        className="gap-2 px-2 py-1.5 text-sm"
                        onClick={() => setShowPDFModal(true)}
                      >
                        <FileDown className="h-4 w-4" />
                        Exporter le programme en PDF
                      </DropdownMenuCustomItem>
                    </DropdownMenuCustomContent>
                  </DropdownMenu.Root>
                </div>
              </div>

              <div className="w-full border-t border-border" />
              <div className="px-4 py-4">
                <ul>
                  {menuItems.map(({ id, label, icon: Icon }) => {
                    const isActive = selected === id
                    return (
                      <li
                        key={id}
                        onClick={() => setSelected(id)}
                        onKeyDown={() => setSelected(id)}
                        className={`group cursor-pointer px-3 py-2 flex justify-between items-center rounded transition duration-300 ${
                          isActive
                            ? 'bg-primary/20 text-primary font-medium'
                            : 'text-text hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        <div className="flex gap-2 items-center">
                          <Icon
                            className={`h-4 w-4 group-hover:text-primary ${isActive ? 'text-primary' : 'text-text'}`}
                          />
                          {label}
                        </div>
                        <ChevronRight
                          className={`h-4 w-4 transition ${
                            isActive
                              ? 'text-primary'
                              : 'group-hover:text-primary'
                          }`}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="w-full border-t border-border" />
              <div className="px-4 py-4">
                <div className="mb-4">
                  <h4 className="text">Coordonnées</h4>
                </div>
                <div className="flex flex-col text-sm mt-2">
                  <div className="flex justify-between">
                    <div className="text-text-light">Email</div>
                    <div className="text-base">{patient?.email}</div>
                  </div>
                  <div className="flex justify-between">
                    <div className="text-text-light">Téléphone 1</div>
                    <div className="text-base">{patient?.phone1}</div>
                  </div>
                  <div className="flex justify-between">
                    <div className="text-text-light">Téléphone 2</div>
                    <div className="text-base">{patient?.phone2}</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`flex-1 flex flex-col gap-4 ${selected !== 'planning' && 'h-fit max-w-xl'}`}
            >
              {selected === 'overview' && <OverviewPatient patient={patient} />}
              {selected === 'profile' && (
                <ProfileContextPatient patient={patient} />
              )}
              {selected === 'pathway' && (
                <PathwayInclusionPatient patient={patient} />
              )}
              {selected === 'outcome' && (
                <OutcomeReviewPatient patient={patient} />
              )}
              {selected === 'planning' && <PlanningPatient patient={patient} />}
            </div>
          </div>
        </div>
      )}

      {showPDFModal && patient && (
        <ProgrammePDFModal
          patient={patient}
          onClose={() => setShowPDFModal(false)}
        />
      )}
    </DashboardLayout>
  )
}

export default PatientDetails

import dayjs from 'dayjs'
import { CalendarPlus, X } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'

import {
  getUpcomingSlotSuggestions,
  type SlotSuggestion,
} from '../../../libs/slotAvailability.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import type { Slot } from '../../../types/slot.ts'
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
  PopupTrigger,
} from '../../ui/popup.tsx'
import { Select } from '../../ui/select.tsx'

interface AddPatientToSlotFormProps {
  trigger?: React.ReactNode
}

const formatSlotDate = (date: string) =>
  dayjs
    .utc(date)
    .format('dddd D MMMM')
    .replace(/^./, (c) => c.toUpperCase())

const formatSlotRange = (start: string, end: string) =>
  `${dayjs.utc(start).format('HH[h]mm')} - ${dayjs.utc(end).format('HH[h]mm')}`

const formatSoignants = (slot: Slot) =>
  slot.slotTemplate?.soignants?.length
    ? slot.slotTemplate.soignants.map((soignant) => soignant.name).join(', ')
    : 'Aucun soignant associé'

const getSuggestionBadge = (suggestion: SlotSuggestion) => {
  if (suggestion.alreadyBooked) {
    return 'déjà inscrit'
  }
  if (suggestion.isIndividual) {
    return ''
  }
  return `${suggestion.bookedCount}/${suggestion.capacity}`
}

function AddPatientToSlotForm({ trigger }: AddPatientToSlotFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [patientID, setPatientID] = useState('')
  const [thematicID, setThematicID] = useState('')
  const [selected, setSelected] = useState<SlotSuggestion | null>(null)

  const { slots } = useAllSlotsQuery()
  const { patients } = usePatientQueries()
  const { thematics } = useThematicQueries()

  const patientOptions = useMemo(
    () =>
      (patients ?? [])
        .map((patient) => ({
          value: patient.id,
          label: `${patient.firstName} ${patient.lastName}`,
          sortKey: `${patient.lastName} ${patient.firstName}`,
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
        .map(({ value, label }) => ({ value, label })),
    [patients],
  )

  const thematicOptions = useMemo(
    () =>
      (thematics ?? [])
        .map((thematic) => ({ value: thematic.id, label: thematic.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [thematics],
  )

  const suggestions = useMemo(
    () => getUpcomingSlotSuggestions(slots, thematicID, patientID),
    [slots, thematicID, patientID],
  )

  const selectedPatient = patients?.find((patient) => patient.id === patientID)
  const selectedThematic = thematics?.find(
    (thematic) => thematic.id === thematicID,
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setStep(1)
      setPatientID('')
      setThematicID('')
      setSelected(null)
    }
  }

  const handleSelectSuggestion = (suggestion: SlotSuggestion) => {
    if (suggestion.alreadyBooked) {
      return
    }
    setSelected(suggestion)
    setStep(2)
  }

  const handleBack = () => {
    setSelected(null)
    setStep(1)
  }

  return (
    <Popup modal open={open} onOpenChange={handleOpenChange}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="w-full">
            <CalendarPlus className="w-4 h-4" />
            Ajouter un patient à un RDV
          </Button>
        )}
      </PopupTrigger>

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle>Ajouter un patient à un rendez-vous</PopupTitle>
        </PopupHeader>

        <PopupBody>
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <FormField>
                <Label htmlFor="patient-selection">Patient</Label>
                <Select
                  id="patient-selection"
                  options={patientOptions}
                  value={patientID}
                  onValueChange={setPatientID}
                  searchable
                  placeholder="Sélectionnez un patient"
                />
              </FormField>

              <FormField>
                <Label htmlFor="thematic-selection">Thématique</Label>
                <Select
                  id="thematic-selection"
                  options={thematicOptions}
                  value={thematicID}
                  onValueChange={setThematicID}
                  disabled={!patientID}
                  placeholder="Sélectionnez une thématique"
                />
              </FormField>

              <div className="flex flex-col gap-2">
                <Label>Prochains créneaux disponibles</Label>

                {!patientID || !thematicID ? (
                  <p className="text-sm text-text-light">
                    Sélectionnez un patient et une thématique.
                  </p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-text-light">
                    Aucun créneau disponible pour cette thématique.
                  </p>
                ) : (
                  <ul className="flex flex-col max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.slot.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          disabled={suggestion.alreadyBooked}
                          className="flex items-center gap-3 w-full text-left px-3 py-2 hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                suggestion.slot.slotTemplate?.color ?? '#2563eb',
                            }}
                          />
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium">
                              {`${formatSlotDate(suggestion.slot.startDate)} · ${formatSlotRange(suggestion.slot.startDate, suggestion.slot.endDate)}`}
                            </span>
                            <span className="text-xs text-text-light truncate">
                              {formatSoignants(suggestion.slot)}
                            </span>
                          </span>
                          <span className="text-xs text-text-light shrink-0">
                            {getSuggestionBadge(suggestion)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === 2 && selected && (
            <div className="flex flex-col gap-2">
              <div className="text-sm">
                <span className="text-text-light">Patient : </span>
                {selectedPatient
                  ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                  : ''}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Thématique : </span>
                {selectedThematic?.name ?? ''}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Créneau : </span>
                {formatSlotDate(selected.slot.startDate)}{' '}
                {formatSlotRange(
                  selected.slot.startDate,
                  selected.slot.endDate,
                )}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Soignants : </span>
                {formatSoignants(selected.slot)}
              </div>
            </div>
          )}
        </PopupBody>

        <PopupFooter>
          {step === 2 && (
            <Button variant="outline" onClick={handleBack}>
              Retour
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddPatientToSlotForm

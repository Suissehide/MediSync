import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../constants/appointment.constant.ts'
import { FormField } from '../ui/formField.tsx'
import { Label } from '../ui/label.tsx'
import { Select, type SelectOption } from '../ui/select.tsx'
import { TimePicker } from '../ui/timePicker.tsx'

interface AppointmentTimeFieldsProps {
  /** Date ISO du créneau, affichée en toutes lettres. */
  date: string
  /** Masque la date quand le contexte l'affiche déjà ailleurs. */
  showDate?: boolean
  startTime: Dayjs
  onStartTimeChange: (value: Dayjs) => void
  duration: string
  onDurationChange: (value: string) => void
  durationOptions: SelectOption[]
  disabled?: boolean
  durationFieldId?: string
  startTimeInfo?: ReactNode
  durationInfo?: ReactNode
  /** Borne inférieure du TimePicker — restreint le choix à un intervalle libre. */
  minTime?: Dayjs
  /** Borne supérieure du TimePicker — restreint le choix à un intervalle libre. */
  maxTime?: Dayjs
}

export function AppointmentTimeFields({
  date,
  showDate = true,
  startTime,
  onStartTimeChange,
  duration,
  onDurationChange,
  durationOptions,
  disabled = false,
  durationFieldId,
  startTimeInfo,
  durationInfo,
  minTime,
  maxTime,
}: AppointmentTimeFieldsProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {showDate && (
        <div className="text-sm font-medium">
          {dayjs
            .utc(date)
            .format('dddd D MMMM')
            .replace(/^./, (c) => c.toUpperCase())}
        </div>
      )}

      <FormField className="flex items-center gap-2">
        <div className="text-sm text-text-light font-medium mb-0">à</div>
        <div>
          <TimePicker
            value={startTime}
            onChange={(time) => onStartTimeChange(time ?? dayjs.utc())}
            disabled={disabled}
            minTime={minTime}
            maxTime={maxTime}
          />
          {startTimeInfo}
        </div>
      </FormField>

      <FormField className="flex items-center gap-2">
        <div className="text-sm text-text-light font-medium mb-0">
          pendant
        </div>
        <div>
          <Select
            id={durationFieldId}
            options={durationOptions}
            value={duration}
            onValueChange={onDurationChange}
            disabled={disabled}
            clearable={false}
          />
          {durationInfo}
        </div>
      </FormField>
    </div>
  )
}

interface AppointmentTypeFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  info?: ReactNode
}

export function AppointmentTypeField({
  id,
  value,
  onChange,
  disabled = false,
  info,
}: AppointmentTypeFieldProps) {
  return (
    <FormField>
      <Label htmlFor={id}>Type</Label>
      <Select
        id={id}
        options={APPOINTMENT_TYPE_OPTIONS}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
      {info}
    </FormField>
  )
}

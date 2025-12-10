import { createFormHook } from '@tanstack/react-form'
import { Compact } from '@uiw/react-color'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useMemo } from 'react'

import { Button } from '../components/ui/button.tsx'
import { DatePicker } from '../components/ui/datePicker.tsx'
import { FieldInfo } from '../components/ui/fieldInfo.tsx'
import { Checkbox, Input, Select, TextArea } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { TimePicker } from '../components/ui/timePicker.tsx'
import {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
} from './formContext.tsx'

export interface FieldComponentProps {
  label?: string
}

interface SelectFieldProps extends FieldComponentProps {
  options: Array<{ value: string; label: string }>
}

const TextField = ({ label }: FieldComponentProps) => {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Input
        id={field.name}
        value={value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      <FieldInfo field={field} />
    </>
  )
}

function SelectField({ label, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Select
        id={field.name}
        options={options}
        value={value}
        onValueChange={(value: string) => field.handleChange(value)}
      />
      <FieldInfo field={field} />
    </>
  )
}

function DatePickerField({ label }: FieldComponentProps) {
  const field = useFieldContext<string>()
  const value = useMemo(() => {
    const fieldValue = field.state.value
    if (!fieldValue) {
      return null
    }
    return dayjs(fieldValue)
  }, [field.state.value])

  const handleChange = (date: Dayjs | null) => {
    const isoString = date ? date.toISOString() : ''
    field.handleChange(isoString)
  }

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <DatePicker value={value} onChange={handleChange} />
      <FieldInfo field={field} />
    </>
  )
}

function TimePickerField({ label }: FieldComponentProps) {
  const field = useFieldContext<Dayjs | null>()
  const value = field.state.value

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <TimePicker
        value={value}
        onChange={(time: Dayjs | null) => field.handleChange(time ?? dayjs())}
      />
      <FieldInfo field={field} />
    </>
  )
}

function CheckboxField({ label }: FieldComponentProps) {
  const field = useFieldContext<boolean>()
  const value = field.state.value

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Checkbox
        id={field.name}
        checked={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          field.handleChange(e.target.checked)
        }
        onBlur={field.handleBlur}
      />
      <FieldInfo field={field} />
    </>
  )
}

function TextAreaField({ label }: FieldComponentProps) {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <TextArea
        id={field.name}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          field.handleChange(e.target.value)
        }
        onBlur={field.handleBlur}
      />
      <FieldInfo field={field} />
    </>
  )
}

function ColorPickerField({ label }: FieldComponentProps) {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Compact
        className="bg-primary"
        color={value}
        onChange={(color: { hex: string }) => field.handleChange(color.hex)}
      />
    </>
  )
}

// Composants de formulaire génériques
function SubmitButton({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  const form = useFormContext()
  return (
    <form.Subscribe
      selector={(state) => ({
        isSubmitting: state.isSubmitting,
        canSubmit: state.canSubmit,
      })}
    >
      {({ isSubmitting, canSubmit }) => (
        <Button type="submit" disabled={isSubmitting || !canSubmit}>
          {children}
          {isSubmitting ? 'Envoi...' : label}
        </Button>
      )}
    </form.Subscribe>
  )
}

export const validators = {
  required: {
    onSubmit: ({ value }: { value: unknown }) =>
      value ? undefined : 'Ce champ est requis',
  },
  requiredDate: {
    onSubmit: ({ value }: { value: Dayjs | null | undefined }) =>
      value ? undefined : 'Ce champ est requis',
  },
}

// Configuration centralisée avec types
export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    Input: TextField,
    Select: SelectField,
    DatePicker: DatePickerField,
    TimePicker: TimePickerField,
    Checkbox: CheckboxField,
    TextArea: TextAreaField,
    ColorPicker: ColorPickerField,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
})

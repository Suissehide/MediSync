import { createFormHook } from '@tanstack/react-form'
import { Github } from '@uiw/react-color'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  disabled?: boolean
}

interface SelectFieldProps extends FieldComponentProps {
  options: Array<{ value: string; label: string }>
}

interface ToggleFieldProps extends FieldComponentProps {
  options: string[]
}

const TextField = ({ label }: FieldComponentProps) => {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <div>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Input
        id={field.name}
        value={value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      <FieldInfo field={field} />
    </div>
  )
}

function SelectField({ label, options, disabled }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <div>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <Select
        id={field.name}
        options={options}
        value={value}
        disabled={disabled}
        onValueChange={(value: string) => field.handleChange(value)}
      />
      <FieldInfo field={field} />
    </div>
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
    <div>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <DatePicker value={value} onChange={handleChange} />
      <FieldInfo field={field} />
    </div>
  )
}

function TimePickerField({ label }: FieldComponentProps) {
  const field = useFieldContext<Dayjs | null>()
  const value = field.state.value

  return (
    <div>
      {label && <Label htmlFor={field.name}>{label}</Label>}
      <TimePicker
        value={value}
        onChange={(time: Dayjs | null) => field.handleChange(time ?? dayjs())}
      />
      <FieldInfo field={field} />
    </div>
  )
}

function CheckboxField({ label }: FieldComponentProps) {
  const field = useFieldContext<boolean>()
  const value = field.state.value

  return (
    <div>
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
    </div>
  )
}

function TextAreaField({ label }: FieldComponentProps) {
  const field = useFieldContext<string>()
  const value = field.state.value ?? ''

  return (
    <div>
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
    </div>
  )
}

function ColorPickerField({ label }: FieldComponentProps) {
  const [open, setOpen] = useState(false)
  const field = useFieldContext<string>()
  const value = field.state.value ?? '#000000'
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (/^#[0-9A-Fa-f]{0,6}$/.test(newValue) || newValue === '') {
      field.handleChange(newValue)
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {label && <Label htmlFor={field.name}>{label}</Label>}

      <div className="relative">
        <div className="flex items-center">
          <button
            type="button"
            className="flex-shrink-0 w-9 h-9 rounded border border-border cursor-pointer rounded-tr-none rounded-br-none"
            style={{ backgroundColor: value }}
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le sélecteur de couleur"
          />

          <Input
            type="text"
            id={field.name}
            value={value}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            placeholder="#000000"
            maxLength={7}
            className="border-l-0 rounded-tl-none rounded-bl-none"
          />
        </div>

        {open && (
          <div className="absolute z-50 mt-2">
            <Github
              className="bg-primary"
              color={value}
              style={{ width: '212px' }}
              onChange={(color: { hex: string }) => {
                field.handleChange(color.hex)
                setOpen(false)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleField({ label, options }: ToggleFieldProps) {
  const field = useFieldContext<boolean>()
  const [option1, option2] = options

  const handleToggle = (value: boolean) => {
    field.handleChange(value)
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={field.name}>{label}</Label>}

      <div className="relative w-fit flex items-center border border-border rounded overflow-hidden">
        <div
          className={`absolute inset-y-0 w-1/2 bg-primary rounded transition-transform duration-200 ease-in-out ${
            field.state.value ? 'translate-x-0' : 'translate-x-full'
          }`}
        />

        <button
          type="button"
          onClick={() => handleToggle(true)}
          className={`relative z-10 cursor-pointer px-4 py-2 text-sm rounded transition-colors ${
            field.state.value ? 'text-white' : 'text-text'
          }`}
        >
          {option1}
        </button>

        <button
          type="button"
          onClick={() => handleToggle(false)}
          className={`relative z-10 cursor-pointer px-4 py-2 text-sm transition-colors ${
            field.state.value ? 'text-text' : 'text-white'
          }`}
        >
          {option2}
        </button>
      </div>
    </div>
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
    Toggle: ToggleField,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
})

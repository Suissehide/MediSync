import { RadioGroup, Switch } from 'radix-ui'
import { useId } from 'react'

import { withForm } from '../../../hooks/formConfig.tsx'

const MODES = [
  {
    value: 'all',
    title: 'Tous les rendez-vous du parcours',
    description:
      'Parcours collectif : le patient est inscrit à l’ensemble des créneaux du parcours.',
  },
  {
    value: 'first',
    title: 'Le premier créneau disponible',
    description:
      'Parcours individuel : le patient est inscrit uniquement au premier créneau libre.',
  },
]

export const PathwayEnrollmentSettings = withForm({
  defaultValues: {
    name: '',
    color: '',
    mainTag: '',
    motifRequired: false,
    firstAppointmentOnly: false,
  },
  render: function Render({ form }) {
    const id = useId()
    return (
      <section className="flex flex-col gap-3">
        <form.AppField name="firstAppointmentOnly">
          {(field) => (
            <div className="flex flex-col gap-2">
              <span
                id={`${id}-mode`}
                className="text-sm text-text-light leading-none"
              >
                Rendez-vous créés
              </span>
              <RadioGroup.Root
                aria-labelledby={`${id}-mode`}
                value={field.state.value ? 'first' : 'all'}
                onValueChange={(mode) => field.handleChange(mode === 'first')}
                className="flex flex-col gap-2"
              >
                {MODES.map(({ value, title, description }) => (
                  <RadioGroup.Item
                    key={value}
                    value={value}
                    className="group flex gap-2.5 items-start px-3 py-2.5 rounded-md border text-left cursor-pointer border-border bg-white data-[state=checked]:border-primary data-[state=checked]:bg-primary/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <span className="mt-px size-4 shrink-0 rounded-full border-[1.5px] border-slate-300 transition-[border] group-data-[state=checked]:border-[5px] group-data-[state=checked]:border-primary" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {title}
                      </span>
                      <span className="block text-xs text-text-light leading-snug text-pretty">
                        {description}
                      </span>
                    </span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </div>
          )}
        </form.AppField>

        <div className="h-px bg-border my-1" />

        <form.AppField name="motifRequired">
          {(field) => (
            <label
              htmlFor={`${id}-switch`}
              className="flex gap-3 items-start cursor-pointer"
            >
              <Switch.Root
                id={`${id}-switch`}
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                aria-describedby={`${id}-motif`}
                className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 bg-slate-300 data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Switch.Thumb className="block size-4 rounded-full bg-white shadow transition-transform duration-150 data-[state=checked]:translate-x-4" />
              </Switch.Root>
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Demander un motif à l’inscription
                </span>
                <span
                  id={`${id}-motif`}
                  className="block text-xs text-text-light leading-snug text-pretty"
                >
                  Un champ « Motif » à remplir s’affiche quand on ajoute un
                  patient. Le motif est recopié dans les notes de transmission
                  de chaque rendez-vous créé.
                </span>
              </span>
            </label>
          )}
        </form.AppField>
      </section>
    )
  },
})

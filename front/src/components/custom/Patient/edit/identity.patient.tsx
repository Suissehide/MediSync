import { GENDER_OPTIONS } from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

export const IdentityFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <>
        <div className="h-fit flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mt-2">
            <h4 className="relative text-sm font-semibold">
              Informations générales
            </h4>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>

          <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="firstName">
                {(field) => <field.Input label="Prénom" />}
              </form.AppField>
              <form.AppField name="lastName">
                {(field) => <field.Input label="Nom" />}
              </form.AppField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="gender">
                {(field) => (
                  <field.Select options={GENDER_OPTIONS} label="Genre" />
                )}
              </form.AppField>
              <form.AppField name="birthDate">
                {(field) => <field.DatePicker label="Date de naissance" />}
              </form.AppField>
            </div>
          </div>
        </div>

        <div className="h-fit flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mt-2">
            <h4 className="relative text-sm font-semibold">Contact</h4>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>

          <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="phone1">
                {(field) => <field.Input label="Téléphone 1" />}
              </form.AppField>
              <form.AppField name="phone2">
                {(field) => <field.Input label="Téléphone 2" />}
              </form.AppField>
            </div>
            <form.AppField name="email">
              {(field) => <field.Input label="Email" />}
            </form.AppField>
          </div>
        </div>
      </>
    )
  },
})

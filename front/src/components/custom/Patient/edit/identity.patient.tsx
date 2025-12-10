import { GENDER_OPTIONS } from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

export const IdentityFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <>
        <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
          <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
            <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
              Informations générales
            </span>
          </h4>
          <form.AppField name="firstName">
            {(field) => <field.Input label="Prénom" />}
          </form.AppField>
          <form.AppField name="lastName">
            {(field) => <field.Input label="Nom" />}
          </form.AppField>
          <form.AppField name="gender">
            {(field) => <field.Select options={GENDER_OPTIONS} label="Genre" />}
          </form.AppField>
          <form.AppField name="birthDate">
            {(field) => <field.DatePicker label="Date de naissance" />}
          </form.AppField>
        </div>

        <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
          <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
            <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
              Contact
            </span>
          </h4>
          <form.AppField name="phone1">
            {(field) => <field.Input label="Téléphone 1" />}
          </form.AppField>
          <form.AppField name="phone2">
            {(field) => <field.Input label="Téléphone 2" />}
          </form.AppField>
          <form.AppField name="email">
            {(field) => <field.Input label="Email" />}
          </form.AppField>
        </div>
      </>
    )
  },
})

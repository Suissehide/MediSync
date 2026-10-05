import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Hospital, Shield, UserRoundPen } from 'lucide-react'
import { useState } from 'react'

import { AuthApi } from '../../../api/auth.api.ts'
import { ServiceMembersApi } from '../../../api/serviceMembers.api.ts'
import {
  affectationsDe,
  MesSoignants,
} from '../../../components/custom/mesSoignants.tsx'
import DashboardLayout from '../../../components/dashboard.layout.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { TOAST_SEVERITY } from '../../../constants/ui.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useToast } from '../../../hooks/useToast.ts'
import { passwordError } from '../../../libs/password.ts'
import { useUpdateMe } from '../../../queries/useAuth.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'

export const Route = createFileRoute('/_authenticated/user/settings')({
  component: UserSettings,
})

function UserSettings() {
  const router = useRouter()
  const navigate = useNavigate()
  const authState = router.options.context?.authState
  const user = authState?.user
  const updateMe = useUpdateMe()
  const updateUser = useAuthStore((state) => state.update)
  const { toast } = useToast()
  const affectations = affectationsDe(user)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingServices, setIsUpdatingServices] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  const profileForm = useAppForm({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
    },
    onSubmit: async ({ value }) => {
      setIsUpdatingProfile(true)
      try {
        await updateMe.mutateAsync({
          firstName: value.firstName,
          lastName: value.lastName,
        })
      } finally {
        setIsUpdatingProfile(false)
      }
    },
  })

  const servicesForm = useAppForm({
    defaultValues: {
      soignants: Object.fromEntries(
        affectations.map((a) => [a.serviceId, a.soignantId]),
      ) as Record<string, string | null>,
    },
    onSubmit: async ({ value }) => {
      setIsUpdatingServices(true)
      try {
        const modifiees = affectations.filter(
          (a) => (value.soignants[a.serviceId] ?? null) !== a.soignantId,
        )
        try {
          for (const a of modifiees) {
            await ServiceMembersApi.setOwnSoignant({
              establishmentId: a.establishmentId,
              serviceId: a.serviceId,
              soignantId: value.soignants[a.serviceId] ?? null,
            })
          }
        } catch (error) {
          toast({
            title: "Erreur lors de l'enregistrement du soignant",
            message: error instanceof Error ? error.message : undefined,
            severity: TOAST_SEVERITY.ERROR,
          })
        }
        if (modifiees.length > 0) {
          updateUser(await AuthApi.me())
        }
      } finally {
        setIsUpdatingServices(false)
      }
    },
  })

  const passwordForm = useAppForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setIsUpdatingPassword(true)
      try {
        await updateMe.mutateAsync({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
        })
        passwordForm.reset()
      } finally {
        setIsUpdatingPassword(false)
      }
    },
  })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            // `/dashboard` a demenage sous /e/:establishmentId/s/:serviceId ;
            // cet ecran n'a pas ces parametres dans son URL. `/` redirige
            // vers le tableau de bord du contexte courant.
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-text-foreground text-xl font-semibold">
            Paramètres
          </h2>
        </div>

        {/* Formulaire de profil */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <UserRoundPen className="h-4 w-4" />
            <h3 className="text-md font-semibold text-text-dark">
              Informations personnelles
            </h3>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>

          <div className="bg-input p-6 rounded-lg">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                await profileForm.validate('submit')
                await profileForm.handleSubmit()
              }}
            >
              <div className="grid grid-cols-2 gap-4 mb-4">
                <profileForm.AppField name="firstName">
                  {(field) => <field.Input label="Prénom" />}
                </profileForm.AppField>

                <profileForm.AppField name="lastName">
                  {(field) => <field.Input label="Nom" />}
                </profileForm.AppField>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {affectations.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Hospital className="h-4 w-4" />
              <h3 className="text-md font-semibold text-text-dark">
                Mes services
              </h3>
              <div className="mt-1 ml-1 flex-1 border-t border-border" />
            </div>

            <div className="bg-input p-6 rounded-lg">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await servicesForm.handleSubmit()
                }}
              >
                <servicesForm.Field name="soignants">
                  {(field) => (
                    <MesSoignants
                      affectations={affectations}
                      value={field.state.value}
                      onChange={(serviceId, soignantId) =>
                        field.handleChange({
                          ...field.state.value,
                          [serviceId]: soignantId,
                        })
                      }
                    />
                  )}
                </servicesForm.Field>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isUpdatingServices}>
                    {isUpdatingServices ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Formulaire de mot de passe */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4" />
            <h3 className="text-md font-semibold text-text-dark">
              Changer le mot de passe
            </h3>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>

          <div className="bg-input p-6 rounded-lg ">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                await passwordForm.validate('submit')
                await passwordForm.handleSubmit()
              }}
            >
              <div className="flex flex-col gap-2 mb-6">
                <passwordForm.AppField
                  name="currentPassword"
                  validators={{
                    onChange: ({ value }) => {
                      if (!value || value.length === 0) {
                        return 'Le mot de passe actuel est requis'
                      }
                      return undefined
                    },
                  }}
                >
                  {(field) => (
                    <field.Password
                      label="Mot de passe actuel"
                      inputClassName="max-w-[50%]"
                    />
                  )}
                </passwordForm.AppField>

                <passwordForm.AppField
                  name="newPassword"
                  validators={{
                    onChange: ({ value }) => passwordError(value),
                  }}
                >
                  {(field) => (
                    <field.Password
                      label="Nouveau mot de passe"
                      inputClassName="max-w-[50%]"
                    />
                  )}
                </passwordForm.AppField>

                <passwordForm.AppField
                  name="confirmPassword"
                  validators={{
                    onChangeListenTo: ['newPassword'],
                    onChange: ({ value, fieldApi }) => {
                      const newPassword =
                        fieldApi.form.getFieldValue('newPassword')
                      if (!value || value.length === 0) {
                        return 'La confirmation est requise'
                      }
                      if (value !== newPassword) {
                        return 'Les mots de passe ne correspondent pas'
                      }
                      return undefined
                    },
                  }}
                >
                  {(field) => (
                    <field.Password
                      label="Confirmer le nouveau mot de passe"
                      inputClassName="max-w-[50%]"
                    />
                  )}
                </passwordForm.AppField>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdatingPassword}>
                  {isUpdatingPassword
                    ? 'Changement en cours...'
                    : 'Changer le mot de passe'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default UserSettings

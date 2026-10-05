import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { AuthCard, AuthLayout } from '../../components/custom/authLayout.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useAppForm } from '../../hooks/formConfig.tsx'
import { useForgotPassword } from '../../queries/useAuth.ts'

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const forgot = useForgotPassword()

  const form = useAppForm({
    defaultValues: { email: '' },
    onSubmit: ({ value }) => forgot.mutate(value.email),
  })

  return (
    <AuthLayout>
      <AuthCard className="gap-4">
        <h2 className="text-left w-full text-2xl font-bold">
          Mot de passe oublié
        </h2>

        {forgot.isSuccess ? (
          <p className="w-full text-text-dark">
            Si un compte existe pour cette adresse, un e-mail contenant un lien
            de réinitialisation vient d'être envoyé. Ce lien est valable 1
            heure.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="w-full flex flex-col gap-2"
          >
            <p className="text-sm text-text-light">
              Indiquez l'adresse de votre compte : nous vous enverrons un lien
              pour choisir un nouveau mot de passe.
            </p>

            {forgot.isError && (
              <p className="text-sm text-destructive">{forgot.error.message}</p>
            )}

            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : "L'e-mail est nécessaire",
              }}
            >
              {(field) => <field.Input type="email" label="Adresse e-mail" />}
            </form.AppField>

            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={forgot.isPending}
            >
              Envoyer le lien
            </Button>
          </form>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate({ to: '/auth' })}
        >
          Retour à la connexion
        </Button>
      </AuthCard>
    </AuthLayout>
  )
}

import { createFileRoute, useNavigate } from '@tanstack/react-router'

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
    <div className="overflow-hidden w-full h-screen flex relative">
      <div className="absolute top-6 left-2 z-20">
        <h1 className="px-2 text-3xl font-bold">
          <span className="text-primary">Medi</span>Sync
        </h1>
      </div>

      <div className="flex-1 flex justify-end">
        <div className="z-10 w-auto sm:w-[450px] left-4 right-4 sm:left-auto top-1/2 -translate-y-1/2 bg-card/45 flex flex-col items-center gap-4 px-6 py-6 sm:px-12 sm:py-8 rounded-2xl border border-gray-100 backdrop-blur-sm absolute sm:right-8">
          <h2 className="text-left w-full text-2xl font-bold">
            Mot de passe oublié
          </h2>

          {forgot.isSuccess ? (
            <p className="w-full text-text-dark">
              Si un compte existe pour cette adresse, un e-mail contenant un
              lien de réinitialisation vient d'être envoyé. Ce lien est valable
              1 heure.
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
                <p className="text-sm text-destructive">
                  {forgot.error.message}
                </p>
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
        </div>
      </div>
    </div>
  )
}

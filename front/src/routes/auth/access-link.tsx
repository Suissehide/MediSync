import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { useAppForm } from '../../hooks/formConfig.tsx'
import { isApiError } from '../../libs/httpErrorHandler.ts'
import { useConsumeAccessLink, useLogin } from '../../queries/useAuth.ts'

type AccessLinkSearch = { token: string }

// LE JETON EST UN MOT DE PASSE À USAGE UNIQUE (brief tâche 13) : il arrive
// ICI, dans l'URL du navigateur — c'est ainsi qu'on le transmet à la
// personne — mais ne doit JAMAIS repartir dans l'URL d'un appel d'API : il
// part dans le CORPS de `POST /auth/access-link/consume`
// (`AuthApi.consumeAccessLink`), jamais dans une clé de cache de requête,
// jamais dans un journal de console. Voir `access-link.test.tsx`, qui
// reprend les quatre canaux de `accountSearchPanel.test.tsx`.
//
// Cette page vit sous `routes/auth/`, donc HORS de `_authenticated` :
// atteignable sans session (voir `access-link.test.tsx`, qui le vérifie
// plutôt que de le supposer).
export const Route = createFileRoute('/auth/access-link')({
  validateSearch: (search: Record<string, unknown>): AccessLinkSearch => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: AccessLinkPage,
})

// ARBITRAGE DE LÉO, TRANSMIS PAR LE BRIEF DE LA TÂCHE (pas dans le brief
// écrit) : c'est CETTE PAGE qui appelle la connexion ordinaire après
// consommation, JAMAIS la route de consommation elle-même — celle-ci ne
// rend qu'un `{ success }` (voir `accessLinkConsumeResponseSchema`, back),
// aucun cookie de session, aucune identité. La page appelle donc
// `POST /auth/sign-in` avec l'adresse et le mot de passe que la personne
// vient de saisir sur ce même formulaire.
function AccessLinkPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const consume = useConsumeAccessLink()
  const { loginMutation, isPending: isLoginPending } = useLogin()
  const [loginFailed, setLoginFailed] = useState(false)

  const form = useAppForm({
    defaultValues: { email: '', password: '', confirmPassword: '' },
    validators: {
      onSubmit: ({ value }) => {
        if (value.password !== value.confirmPassword) {
          return {
            form: 'Les mots de passe ne correspondent pas',
            fields: {
              confirmPassword: 'Les mots de passe ne correspondent pas',
            },
          }
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => {
      setLoginFailed(false)
      consume.consumeMutation(
        { token, password: value.password },
        {
          onSuccess: () => {
            loginMutation(
              { email: value.email, password: value.password },
              {
                onSuccess: async () => {
                  await navigate({ to: '/' })
                },
                onError: () => setLoginFailed(true),
              },
            )
          },
        },
      )
    },
  })

  // Aucun jeton dans l'URL : ne tente même pas d'appel — rien à consommer,
  // rien qui puisse fuir.
  if (!token) {
    return (
      <Shell>
        <Message text="Ce lien est invalide. Demandez-en un autre à votre établissement." />
        <RetourConnexion />
      </Shell>
    )
  }

  // Le compte a bien consommé son jeton avec succès, mais la connexion
  // automatique qui suit a échoué (adresse mal recopiée, par exemple) : le
  // jeton est désormais BRÛLÉ (usage unique), le reformulaire ne doit pas
  // réapparaître — la seule issue est de se connecter normalement.
  if (loginFailed) {
    return (
      <Shell>
        <Message text="Votre mot de passe a bien été enregistré, mais la connexion automatique a échoué. Reconnectez-vous avec votre adresse et votre nouveau mot de passe." />
        <RetourConnexion />
      </Shell>
    )
  }

  if (consume.isError) {
    const status = isApiError(consume.error) ? consume.error.status : undefined
    // 410 (lien invalide ou expiré) et 401 (compte désactivé) sont deux
    // choses DIFFÉRENTES : le back ne brûle jamais le jeton dans le second
    // cas (`accessLink.domain.ts#consume`), et le message affiché ne doit
    // pas laisser croire que « demander un autre lien » réglerait un compte
    // désactivé.
    if (status === 410) {
      return (
        <Shell>
          <Message text="Ce lien n'est plus valable. Demandez-en un autre à votre établissement." />
          <RetourConnexion />
        </Shell>
      )
    }
    if (status === 401) {
      return (
        <Shell>
          <Message text="Ce compte est désactivé. Contactez un administrateur de votre établissement." />
          <RetourConnexion />
        </Shell>
      )
    }
    // Toute autre erreur (mot de passe trop court, panne réseau...) laisse
    // repasser par LE MÊME formulaire : rien ne prouve que le jeton a été
    // consommé (une erreur de validation du corps ne l'atteint même pas,
    // voir `access-link.router.ts`), une nouvelle tentative doit rester
    // possible.
  }

  return (
    <div className="overflow-hidden w-full h-screen flex relative">
      <div className="absolute top-6 left-2 z-20">
        <h1 className="px-2 text-3xl font-bold">
          <span className="text-primary">Medi</span>Sync
        </h1>
      </div>

      <div className="flex-1 flex justify-end">
        <div className="z-10 w-auto sm:w-[450px] left-4 right-4 sm:left-auto top-1/2 -translate-y-1/2 bg-card/45 flex flex-col items-center px-6 py-6 sm:px-12 sm:py-8 rounded-2xl border border-gray-100 backdrop-blur-sm absolute sm:right-8">
          <h2 className="text-left w-full text-2xl font-bold mb-4">
            Choisissez votre mot de passe
          </h2>

          {consume.isError && (
            <p className="w-full text-sm text-destructive mb-2">
              Une erreur est survenue. Vérifiez les informations saisies et
              réessayez.
            </p>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="w-full flex flex-col gap-2"
          >
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : "L'e-mail est nécessaire",
              }}
            >
              {(field) => <field.Input type="email" label="Adresse e-mail" />}
            </form.AppField>

            <form.AppField
              name="password"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le mot de passe est nécessaire',
              }}
            >
              {(field) => <field.Password label="Nouveau mot de passe" />}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => (
                <field.Password label="Confirmer le mot de passe" />
              )}
            </form.AppField>

            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={consume.isPending || isLoginPending}
            >
              Définir le mot de passe et se connecter
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden w-full h-screen flex relative">
    <div className="absolute top-6 left-2 z-20">
      <h1 className="px-2 text-3xl font-bold">
        <span className="text-primary">Medi</span>Sync
      </h1>
    </div>
    <div className="flex-1 flex justify-end">
      <div className="z-10 w-auto sm:w-[450px] left-4 right-4 sm:left-auto top-1/2 -translate-y-1/2 bg-card/45 flex flex-col items-center gap-4 px-6 py-6 sm:px-12 sm:py-8 rounded-2xl border border-gray-100 backdrop-blur-sm absolute sm:right-8 text-center">
        {children}
      </div>
    </div>
  </div>
)

const Message = ({ text }: { text: string }) => (
  <p className="text-text-dark">{text}</p>
)

const RetourConnexion = () => {
  const navigate = useNavigate()
  return (
    <Button variant="outline" onClick={() => navigate({ to: '/auth' })}>
      Aller à la connexion
    </Button>
  )
}

export default AccessLinkPage

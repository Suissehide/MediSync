import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useState } from 'react'

import { AuthCard, AuthLayout } from '../../components/custom/authLayout.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useAppForm } from '../../hooks/formConfig.tsx'
import { isApiError } from '../../libs/httpErrorHandler.ts'
import { useConsumeAccessLink, useLogin } from '../../queries/useAuth.ts'

// LE JETON EST UN MOT DE PASSE À USAGE UNIQUE : il arrive
// ICI, dans le FRAGMENT de l'URL (`#…`, jamais envoyé à un serveur, donc
// absent des journaux d'accès) — c'est ainsi que l'e-mail le transmet à la
// personne — mais ne doit JAMAIS repartir dans l'URL d'un appel d'API : il
// part dans le CORPS de `POST /auth/access-link/consume`
// (`AuthApi.consumeAccessLink`), jamais dans une clé de cache de requête,
// jamais dans un journal de console. Voir `access-link.test.tsx`, qui
// reprend les quatre canaux de `accountSearchPanel.test.tsx` — PLUS un
// cinquième : le jeton ne doit
// pas non plus rester dans la barre d'adresse après une consommation
// réussie (voir `consumedSuccessfully`/`replace: true` plus bas).
//
// Cette page vit sous `routes/auth/`, donc HORS de `_authenticated` :
// atteignable sans session — vérifié sur le VRAI `routeTree.gen.ts` dans
// `access-link.test.tsx` (describe « atteignabilite sans session, sur le
// VRAI arbre de routes »), pas seulement sur un arbre de test synthétique
// qui ne pourrait rien prouver sur ce point précis.
export const Route = createFileRoute('/auth/access-link')({
  component: AccessLinkPage,
})

// ARBITRAGE DE LÉO : c'est CETTE PAGE qui appelle la connexion ordinaire après
// consommation, JAMAIS la route de consommation elle-même — celle-ci ne
// rend qu'un `{ success }` (voir `accessLinkConsumeResponseSchema`, back),
// aucun cookie de session, aucune identité. La page appelle donc
// `POST /auth/sign-in` avec l'adresse et le mot de passe que la personne
// vient de saisir sur ce même formulaire.
function AccessLinkPage() {
  const token = useLocation({ select: (location) => location.hash })
  const navigate = useNavigate()
  const consume = useConsumeAccessLink()
  const { loginMutation, isPending: isLoginPending } = useLogin()
  const [loginFailed, setLoginFailed] = useState(false)
  // Cinquième canal : entre la consommation réussie et la
  // connexion, `token` est purgé du fragment d'URL (voir plus bas) — le
  // composant se re-rend alors avec `token === ''`, ce qui retomberait sur
  // la branche « lien invalide » sans ce drapeau, pile pendant la fenêtre où
  // la connexion est en cours.
  const [consumedSuccessfully, setConsumedSuccessfully] = useState(false)

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
          onSuccess: async () => {
            setConsumedSuccessfully(true)
            // CINQUIÈME CANAL : sans ceci, le
            // jeton reste dans la barre d'adresse après une consommation
            // réussie — un retour arrière re-affiche le formulaire avec le
            // jeton encore visible dans l'URL, et une re-soumission
            // recevrait 410 (« demandez-en un autre ») alors que la
            // personne vient pourtant de réussir. `replace: true` change
            // l'entrée d'historique COURANTE au lieu d'en empiler une
            // nouvelle : un retour arrière ne peut plus jamais retomber sur
            // l'URL porteuse du jeton, elle n'existe plus dans l'historique.
            // Fait AVANT d'appeler la connexion, comme demandé.
            await navigate({ to: '/auth/access-link', replace: true })
            loginMutation(
              { email: value.email, password: value.password },
              {
                onSuccess: async () => {
                  await navigate({ to: '/', replace: true })
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
  // rien qui puisse fuir. Sauf si la consommation vient JUSTEMENT de
  // réussir (voir `consumedSuccessfully` ci-dessus) : la purge de l'URL
  // fait retomber `token` à la chaîne vide, ce n'est pas un lien invalide.
  if (!token && !consumedSuccessfully) {
    return (
      <Shell>
        <Message text="Ce lien est invalide. Demandez-en un autre à votre établissement, ou utilisez « Mot de passe oublié »." />
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
          <Message text="Ce lien n'est plus valable. Demandez-en un autre à votre établissement, ou utilisez « Mot de passe oublié »." />
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
    <AuthLayout>
      <AuthCard>
        <h2 className="text-left w-full text-2xl font-bold mb-4">
          Choisissez votre mot de passe
        </h2>

        {consume.isError && (
          <p className="w-full text-sm text-destructive mb-2">
            {consume.error instanceof Error
              ? consume.error.message
              : 'Une erreur est survenue. Réessayez.'}
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
              // Même message que `user/settings.tsx` (précédent existant) :
              // le back exige 12 caractères (`accessLinkConsumeSchema`),
              // et sans ce contrôle côté client, l'écran par lequel une
              // personne ENTRE dans l'application se contentait d'un
              // « une erreur est survenue » qui ne dit jamais quoi
              // corriger.
              onChange: ({ value }) => {
                if (!value) {
                  return 'Le mot de passe est nécessaire'
                }
                if (value.length < 12) {
                  return 'Le mot de passe doit contenir au moins 12 caractères'
                }
                return undefined
              },
            }}
          >
            {(field) => <field.Password label="Nouveau mot de passe" />}
          </form.AppField>

          <form.AppField name="confirmPassword">
            {(field) => <field.Password label="Confirmer le mot de passe" />}
          </form.AppField>

          <Button
            type="submit"
            className="w-full mt-2"
            isLoading={consume.isPending || isLoginPending}
          >
            Définir le mot de passe et se connecter
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <AuthLayout>
    <AuthCard className="gap-4 text-center">{children}</AuthCard>
  </AuthLayout>
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

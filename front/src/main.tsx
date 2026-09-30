import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import { registerStaleTenantHandler } from './api/fetchWithAuth.ts'
import RootLayout from './components/root.layout.tsx'
import {
  createTenantQueryClient,
  useTenantQueryClient,
} from './hooks/useTenantSwitch.ts'
import { meQueryOptions } from './queries/useMe.ts'
import { routeTree } from './routeTree.gen.ts'
import { useAuthStore } from './store/useAuthStore.ts'
import type { User } from './types/auth.ts'
import { isTenantRouteStale } from './utils/tenant-context.ts'
import 'dayjs/locale/fr'
import { GlobalStyles, StyledEngineProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import isoWeek from 'dayjs/plugin/isoWeek'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import utc from 'dayjs/plugin/utc'
import { Loader2Icon } from 'lucide-react'

dayjs.extend(isoWeek)
dayjs.extend(advancedFormat)
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)
dayjs.extend(utc)
dayjs.extend(localizedFormat)
dayjs.locale('fr')

// Premier client : celui d'avant tout contexte. Les suivants sont construits
// par `useTenantQueryClient`, un par couple etablissement/service.
const initialQueryClient = createTenantQueryClient()

// INVARIANT MULTI-TENANT — les deux moities du mecanisme, ecrites ici parce
// que c'est le fichier ou l'on vient quand on touche au routeur ou au client
// de requetes.
//
// 1. UN CLIENT NEUF PAR COUPLE etablissement/service (`useTenantQueryClient`,
//    plus bas dans `App`) : le cache du service precedent devient
//    inatteignable plutot que simplement perime.
// 2. LE DEMONTAGE DES ECRANS a chaque changement de couple, porte par le
//    `remountDeps: ({ params }) => params` des deux layouts de tenant
//    (`e/$establishmentId/s/$serviceId.tsx`, `e/$establishmentId/admin.tsx`).
//
// Aucune des deux ne suffit seule. React Query lie l'observateur au client A
// LA CONSTRUCTION et ne le relie jamais : sans demontage, un ecran garde
// l'observateur de l'ancien client et continue d'afficher le service
// precedent sous l'URL du nouveau. Et comme les cles de requete ne portent
// deliberement pas le tenant (D2), rien d'autre ne forcerait un
// rechargement : il n'existe aucun filet sous ces deux lignes.
//
// Si l'on ajoutait un jour `defaultRemountDeps` ici, ce serait en
// REMPLACEMENT des deux `remountDeps` locaux, jamais en doublon silencieux —
// et en acceptant qu'il remonte aussi sur `$patientID`. En l'etat, ce
// `createRouter` ne declare volontairement aucune dependance de remontage
// globale.
//
// CONDITION QUI ROUVRE LE CAS, ecrite ici parce que c'est ici qu'on viendrait
// l'enfreindre : cette absence est ce qui rend vraie une phrase de
// `front/CLAUDE.md` (§ « Also implicit »), selon laquelle aucune dependance de
// remontage ne s'applique aux ecrans vivant hors des deux layouts de tenant
// (`/user/settings`) — et c'est cette phrase qui justifie d'y interdire tout
// observateur de tenant, panneau des taches de la barre de navigation compris.
// Poser `defaultRemountDeps` ici la rend fausse, et RIEN NE LE SIGNALE : la
// suite du front a ete relancee entiere avec ce reglage pose, elle reste
// verte, et `src/test/layouts-de-tenant.test.ts` ne lit que les fichiers de
// `src/routes`, donc jamais celui-ci. Qui ajoute ce reglage corrige la phrase
// du guide dans le meme changement.
const router = createRouter({
  routeTree,
  context: {
    queryClient: initialQueryClient,
    authState: { user: null, isAuthenticated: false },
  },
  defaultPreload: 'intent',
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Un 404 de route de tenant PEUT signifier que l'arbre des appartenances est
// perime — affectation retiree pendant la session — mais peut tout aussi
// bien etre une simple ressource absente du service courant, couple encore
// valide : le back rend ce 404 deliberement neutre (pour ne rien reveler a
// qui sonde des identifiants au hasard), donc rien dans la reponse ne permet
// de trancher. On tranche ici, cote front : on recharge l'arbre des
// appartenances, puis on reverifie contre lui le couple VISE PAR L'URL EN
// ECHEC — jamais le contexte courant du store, qui a pu changer entre
// l'emission de la requete et la resolution du 404. `isTenantRouteStale`
// porte cette verification en reutilisant resolveTenantContext /
// resolveEstablishmentContext, les memes fonctions que les gardes de route.
// On ne navigue que si le couple a bien disparu : un 404 legitime ne
// provoque donc rien.
//
// Enregistre ici, et non dans fetchWithAuth.ts, pour que ce dernier ne
// depende ni du routeur ni du client de requetes.
//
// `router.options.context?.queryClient`, jamais une variable capturee au
// chargement du module : un client neuf est construit a chaque changement
// de contexte, et `AppRoutes` ne le pose sur
// `router.options.context` qu'au rendu suivant (meme mecanisme que
// `context.queryClient` dans `_authenticated.tsx`). Lire cette propriete au
// moment ou le rappel se declenche, plutot qu'une reference figee a l'appel
// de `registerStaleTenantHandler`, garantit de toujours viser le cache en
// usage — jamais un cache devenu inerte apres un changement de contexte.
registerStaleTenantHandler(async (pathname) => {
  const queryClient = router.options.context?.queryClient
  if (!queryClient) {
    return
  }

  let user: User
  try {
    // `staleTime: 0` force un aller-retour reseau : `invalidateQueries` ne
    // rend pas la donnee fraiche en valeur de retour pour une requete sans
    // observateur actif, et relire le cache a la main (`getQueryData`) est
    // interdit hors des deux emplacements nommes dans
    // `useTenantSwitch.ts`/`useSlot.ts` (`lecture-directe-du-cache.test.ts`).
    user = await queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 })
  } catch {
    // Session expiree ou back injoignable : sans arbre frais, on ne peut pas
    // confirmer que le couple vise a disparu. On ne navigue pas sur un
    // simple doute — `fetchWithAuth` a deja son propre traitement du 401.
    return
  }

  if (isTenantRouteStale(user, pathname)) {
    void router.navigate({ to: '/choose-context' })
  }
})

const rootElement = document.getElementById('root')
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <StyledEngineProvider enableCssLayer>
        <App />
      </StyledEngineProvider>
    </StrictMode>,
  )
}

// Detient le client courant. Il est expose a la fois au fournisseur de
// requetes et au contexte du routeur : la garde de `_authenticated` s'en sert
// pour `ensureQueryData`, et lire l'ancien client la ferait travailler dans
// un cache devenu inerte.
function App() {
  const queryClient = useTenantQueryClient(initialQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <RootLayout>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
          <AppRoutes queryClient={queryClient} />
          <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
          <ReactQueryDevtools initialIsOpen={false} position={'right'} />
        </LocalizationProvider>
      </RootLayout>
    </QueryClientProvider>
  )
}

function AppRoutes({ queryClient }: { queryClient: QueryClient }) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isInitialLoading = useAuthStore((state) => state.isInitialLoading)

  const authState = { user, isAuthenticated }

  if (isInitialLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Loader2Icon className="size-10 animate-spin text-foreground" />
      </div>
    )
  }

  return <RouterProvider router={router} context={{ queryClient, authState }} />
}

import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import { registerStaleTenantHandler } from './api/fetchWithAuth.ts'
import RootLayout from './components/root.layout.tsx'
import { createTenantQueryClient, useTenantQueryClient } from './hooks/useTenantSwitch.ts'
import { meQueryOptions } from './queries/useMe.ts'
import { routeTree } from './routeTree.gen.ts'
import { useAuthStore } from './store/useAuthStore.ts'
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

// Un 404 de tenant perime (cf. fetchWithAuth.ts) recharge l'arbre des
// appartenances puis renvoie au choix de contexte. Enregistre ici, et non
// dans fetchWithAuth.ts, pour que ce dernier ne depende ni du routeur ni du
// client de requetes.
//
// `router.options.context.queryClient`, jamais une variable capturee au
// chargement du module : un client neuf est construit a chaque changement
// de contexte (tache 10), et `AppRoutes` ne le pose sur
// `router.options.context` qu'au rendu suivant (meme mecanisme que
// `context.queryClient` dans `_authenticated.tsx`). Lire cette propriete au
// moment ou le rappel se declenche, plutot qu'une reference figee a l'appel
// de `registerStaleTenantHandler`, garantit de toujours viser le cache en
// usage — jamais un cache devenu inerte apres un changement de contexte.
registerStaleTenantHandler(() => {
  void router.options.context?.queryClient.invalidateQueries(meQueryOptions)
  void router.navigate({ to: '/choose-context' })
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

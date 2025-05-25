import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import RootLayout from './components/root.layout.tsx'

import { routeTree } from './routeTree.gen.ts'
import { useAuthStore } from './store/useAuthStore.ts'

import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import isoWeek from 'dayjs/plugin/isoWeek'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import { Loader2Icon } from 'lucide-react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

dayjs.extend(isoWeek)
dayjs.extend(advancedFormat)
dayjs.locale('fr')

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      console.error('Query cache: ', JSON.stringify(error))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      console.error('Mutation cache: ', JSON.stringify(error))
    },
  }),
})

const router = createRouter({
  routeTree,
  context: { queryClient, authState: { user: null, isAuthenticated: false } },
  defaultPreload: 'intent',
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RootLayout>
          <AppRoutes />
          <ReactQueryDevtools initialIsOpen={false} position={'right'} />
        </RootLayout>
      </QueryClientProvider>
    </StrictMode>,
  )
}

function AppRoutes() {
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

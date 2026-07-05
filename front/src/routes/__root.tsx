import {
  type ErrorComponentProps,
  Outlet,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import React from 'react'
import type { AuthState } from '../types/auth.ts'
import type { QueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/button.tsx'
import { environment } from '../constants/config.constant.ts'

const TanStackRouterDevtools =
  environment !== 'development'
    ? () => null // Render nothing in production
    : React.lazy(() =>
        import('@tanstack/react-router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      )

type RouterContext = {
  queryClient: QueryClient
  authState: AuthState
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  errorComponent: RootErrorComponent,
})

function RootErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex items-center justify-center rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="text-text-dark text-xl font-semibold">
        Une erreur est survenue
      </h1>
      <p className="max-w-md text-sm text-text-light">
        Quelque chose s'est mal passé lors du chargement de la page. Vous pouvez
        réessayer ou recharger l'application.
      </p>
      {environment === 'development' && error?.message && (
        <pre className="max-w-md overflow-auto rounded-md bg-card p-3 text-left text-xs text-text-light">
          {error.message}
        </pre>
      )}
      <div className="flex gap-3">
        <Button variant="default" onClick={() => router.invalidate()}>
          Réessayer
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recharger la page
        </Button>
      </div>
    </div>
  )
}

function Root() {
  return (
    <>
      <Outlet />
      <React.Suspense>
        <TanStackRouterDevtools position="bottom-left" />
      </React.Suspense>
    </>
  )
}

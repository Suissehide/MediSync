import '../styles/_globals.css'

import type React from 'react'

import { ThemeProvider } from './themeProvider.tsx'
import { Toaster } from './ui/toaster.tsx'

// INVARIANT MULTI-TENANT : un composant place ici ne doit jamais interroger
// une API de tenant. Ce qui survit au changement d'etablissement/service
// garde l'observateur qu'il avait, donc l'ANCIEN client de requetes (React
// Query lie l'observateur au client a la construction et ne le relie jamais)
// : il continuerait d'afficher, ou de recharger, la donnee d'un autre
// service. Les ecrans qui lisent une API de tenant vivent sous `$serviceId`
// / `admin` ; ces deux layouts sont demontes au changement PARCE QU'ILS
// DECLARENT `remountDeps: ({ params }) => params`, et pour aucune autre
// raison — sans cette ligne le routeur re-rend au lieu de remonter, et
// l'invariant ci-dessus ne tiendrait plus nulle part. Verrouille par
// `routes/_authenticated/e/$establishmentId/remontage.test.tsx`.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      accentColor="mint"
      grayColor="gray"
      panelBackground="solid"
      scaling="100%"
      radius="medium"
    >
      {children}
      <Toaster />
    </ThemeProvider>
  )
}

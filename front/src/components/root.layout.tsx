import '../styles/_globals.css'

import type React from 'react'

import { ThemeProvider } from './themeProvider.tsx'
import { Toaster } from './ui/toaster.tsx'

// INVARIANT MULTI-TENANT : un composant place ici ne doit jamais interroger
// l'API. Ce qui survit au changement d'etablissement/service garde
// l'observateur qu'il avait, donc l'ANCIEN client de requetes (React Query
// fige le client a la creation de l'observateur) : il continuerait d'afficher,
// ou de recharger, la donnee d'un autre service. Les ecrans qui lisent l'API
// vivent sous `$serviceId` / `admin`, qui sont demontes au changement.
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

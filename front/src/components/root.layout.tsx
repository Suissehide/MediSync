import '../styles/_globals.css'

import type React from 'react'

import { ThemeProvider } from './themeProvider.tsx'
import { Toaster } from './ui/toaster.tsx'

// INVARIANT MULTI-TENANT : un composant place ici ne doit jamais interroger
// une API de tenant. Ce qui survit au changement d'etablissement/service
// garde l'observateur qu'il avait, donc l'ANCIEN client de requetes (React
// Query lie l'observateur au client a la construction et ne le relie jamais)
// : il continuerait d'afficher, ou de recharger, la donnee d'un autre
// service. Tout ce qui lit une API de tenant n'est monte que sous
// `$serviceId` / `admin` ; ces deux layouts sont demontes au changement
// PARCE QU'ILS DECLARENT `remountDeps: ({ params }) => params`, et pour
// aucune autre raison — sans cette ligne le routeur re-rend au lieu de
// remonter, et l'invariant ci-dessus ne tiendrait plus nulle part.
//
// « Tout ce qui » et non « tout ecran qui » : un composant echappe a l'arbre
// des ecrans, la barre de navigation, rendue par `dashboard.layout.tsx` donc
// aussi par `/user/settings`, qui vit hors des deux layouts. Son panneau des
// taches lit une API de service ; il se garde par une CORRESPONDANCE DE
// ROUTE (`useMatchRoute`, dans `navbar.tsx`) et non par le contexte du
// store, lequel porte encore le dernier service visite sur ces ecrans-la. Y
// ajouter un widget qui lit une API de tenant exige la meme garde.
//
// Verrouille par
// `routes/_authenticated/e/$establishmentId/remontage.test.tsx` et
// `components/navbar.test.tsx`.
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

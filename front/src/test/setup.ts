import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Chaque test part d'un stockage local vide. C'est precisement ce qu'aucun
// test ne faisait a l'etape 1, ou un etat persiste d'une version anterieure a
// remplace l'application par un ecran d'erreur pour tous les comptes.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

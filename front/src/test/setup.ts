/// <reference types="vitest/jsdom" />
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Depuis Node 25, Node expose son propre `localStorage`/`sessionStorage`
// globaux (non fonctionnels sans l'option --localstorage-file). Comme ces
// proprietes existent deja sur `globalThis` avant que jsdom ne s'installe,
// vitest ne les remplace pas par les siennes : son mecanisme de recopie des
// globales de la fenetre jsdom ignore une cle deja presente si elle ne
// figure pas dans sa liste explicite, ce qui est le cas de `localStorage`.
// On reassigne donc nous-memes ces deux globales vers celles, fonctionnelles,
// que jsdom expose sur la fenetre de l'instance qu'il attache lui-meme a
// `globalThis.jsdom` (API documentee par vitest dans `vitest/jsdom.d.ts`).
// Sans ces deux lignes, `localStorage.clear()` ci-dessous leve une
// TypeError sur Node >= 25 : ne pas les retirer en les croyant inutiles.
// `jsdom` est la globale documentee par vitest (vitest/jsdom.d.ts), typee via
// la reference plus haut ; `globalThis.jsdom` n'est pas connu du type de
// `globalThis`, d'ou l'identifiant nu ci-dessous.
// biome-ignore lint/correctness/noUndeclaredVariables: cf. commentaire ci-dessus.
globalThis.localStorage = jsdom.window.localStorage
// biome-ignore lint/correctness/noUndeclaredVariables: idem, cf. plus haut.
globalThis.sessionStorage = jsdom.window.sessionStorage

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

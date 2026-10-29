import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Budget d'attente des utilitaires asynchrones (`waitFor`, `findBy*`), par defaut 1000 ms.
//
// POURQUOI L'AUGMENTER N'EST PAS MASQUER UN DEFAUT. La suite monte 93 fichiers qui rendent
// chacun un arbre React, en parallele : l'horloge dit 37 s la ou le temps-test cumule en dit
// 237. Sur une machine ainsi saturee, un rendu qui prend 80 ms a vide en prend plus de 1000, et
// des tests dont l'assertion est JUSTE echouaient — des tests DIFFERENTS a chaque execution,
// jamais les memes. En serie, les memes 93 fichiers passaient tous.
// Ce reglage ne relache aucune assertion : un test reellement casse echoue toujours, seulement
// plus tard. Il ne fait qu'arreter de confondre « l'ecran n'affiche pas ca » avec « la machine
// n'a pas eu le temps ».
configure({ asyncUtilTimeout: 5000 })

// Chaque test part d'un stockage local vide. C'est precisement ce qu'aucun
// test ne faisait auparavant, ou un etat persiste d'une version anterieure a
// remplace l'application par un ecran d'erreur pour tous les comptes.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

// jsdom n'implemente ni l'API de capture de pointeur (`Element.prototype.
// hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`) ni
// `scrollIntoView` — Radix UI (dont `RadixSelect`, utilise par
// `components/ui/select.tsx`) les appelle a l'ouverture d'un menu deroulant,
// ce qui levait `TypeError: target.hasPointerCapture is not a function` et
// empechait TOUT test d'interagir avec un `<Select>` non-recherchable
// (verifie par execution : aucun test du
// depot n'ouvrait un tel menu avant ce polyfill). Poser des no-ops suffit :
// aucun test n'a besoin du VRAI comportement de capture de pointeur, juste
// que Radix ne leve pas en l'appelant.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined
}
// L'editeur de design remet son cadre en haut au changement de zoom.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => undefined
}
// Le routeur restaure le defilement de la fenetre a chaque navigation.
window.scrollTo = () => undefined

// jsdom ne connait pas `ResizeObserver`, et un composant qui en construit un plante au
// montage — l'editeur de design en pose un pour calculer son echelle. Ce bouchon n'emet
// aucune mesure : jsdom ne met rien en page, un chiffre invente serait un mensonge. Les
// composants doivent donc garder une echelle de depart utilisable sans lui.
const sansEffet = () => undefined
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = sansEffet
    unobserve = sansEffet
    disconnect = sansEffet
  }
}

afterEach(() => {
  cleanup()
})

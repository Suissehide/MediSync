// Un fichier en `@vitest-environment node` (rendu PDF reel) n'a ni fenetre ni jsdom.
if (typeof window !== 'undefined') {
  await import('./setup-dom.ts')
}

// `jest.setTimeout` dans un fichier de `setupFilesAfterEnv`, et NON `testTimeout` dans la
// configuration du projet : mesure du 2026-10-15, un `beforeAll` de 7 s echoue a 5,1 s avec
// `testTimeout: 30000` pose sur le projet `e2e`. Jest ne propage ce reglage de projet ni aux
// hooks ni, semble-t-il, aux tests — le message d'echec continue de dire « Exceeded timeout of
// 5000 ms for a hook ». Le reglage d'origine (etape 2) etait donc inoperant, et ses deux
// executions completes vertes l'etaient par la charge du moment, pas par lui.
//
// Pourquoi ce budget : un `beforeAll` e2e vide la base, monte l'application et seme ses
// fixtures. Sur une machine chargee, trois executions d'affilee ont rendu 15, 28 puis 50
// echecs, tous « Exceeded timeout ... for a hook » dans des `beforeAll` de suites sans rapport
// entre elles ; les memes, relancees seules, passaient. C'est l'horloge, pas la logique —
// meme diagnostic que le budget d'attente du front (`front/src/test/setup.ts`). Les tests
// UNITAIRES, eux, gardent les 5 s par defaut : ce fichier n'est charge que par le projet e2e.
//
// Un test e2e qui s'approcherait vraiment de 30 s est un test a regarder, pas un reglage a
// relever.
jest.setTimeout(30000)

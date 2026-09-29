# MediSync — front

SPA React 19 + Vite. L'installation, la configuration et le démarrage de l'ensemble du projet sont décrits dans le
[README racine](../README.md) ; les conventions du front, dans [CLAUDE.md](./CLAUDE.md).

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement sur http://localhost:4270 (port strict) |
| `npm run build` | Vérification des types puis build de production |
| `npm run lint` | Lint avec Biome (`npx biome check --write src` pour formater et trier les imports) |
| `npm test` | Tests Vitest (`npm run test:watch` en continu) |

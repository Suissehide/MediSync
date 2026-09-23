# Étape 2 — Contexte front explicite : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** faire passer le contexte établissement/service du store vers l'URL, avec un sélecteur, sans qu'aucune donnée d'un service n'apparaisse jamais dans un autre.

**Architecture:** le couple est lu dans les paramètres de route par un layout, validé contre l'arbre des appartenances, puis écrit dans le store en `beforeLoad` — les deux fabriques d'URL existantes continuent de lire le store et ne changent pas. La sûreté ne repose pas sur la discipline d'écriture mais sur deux mécanismes entiers : vidage complet du cache de requêtes au changement de contexte, et réinitialisation ou indexation par service de tous les stores porteurs de données de service.

**Tech Stack:** React 19, Vite, TanStack Router (routage par fichiers, `autoCodeSplitting`), TanStack Query, Zustand, Radix + Tailwind, Biome. Back : Node 24, Fastify 5, Prisma 7, Jest 30.

**Spec:** `docs/superpowers/specs/2026-09-23-multi-tenant-etape-2-contexte-front-design.md`

## Global Constraints

- **Ne jamais démarrer de serveur de développement.** Le port 4270 appartient à Léo, qui lance le front lui-même.
- **Ne jamais migrer, réinitialiser ou écrire dans la base `medisync`.** Les tests back passent par `.env.test` et `medisync_test` uniquement.
- Commentaires, documentation et messages de commit en français. Les messages d'erreur `Boom` du back restent en anglais : `front/src/api/members.api.ts` les fait correspondre par égalité exacte au texte français affiché, et un message non répertorié fait retomber l'écran sur un texte générique.
- `front/src/utils/permissions.ts` et `back/src/main/utils/permissions.ts` sont identiques octet pour octet ; un test unitaire l'exige. Toute modification de l'un se fait dans l'autre.
- **`npm run validate` ne passe pas et n'est pas un critère.** `npm run lint:ci` (back) et `npm run lint` (front) échouent déjà sur `main`, dette antérieure à ce chantier. Les portes réelles sont : `cd back && npm run build && npm run lint && npm run test:unit && npm run test:e2e`, et `cd front && npm run build && npm run lint && npm run test`.
- Le back tourne en mode veille sur le port 3000 pendant la session ; ne pas le tuer, ne pas en lancer un second.
- Terminer chaque message de commit par : `Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe`

---

## Structure des fichiers

**Créés (front)**

| Fichier | Responsabilité |
|---|---|
| `front/src/utils/tenant-context.ts` | Résolution pure : paramètres de route + arbre d'appartenances → contexte, ou `null`. Contexte par défaut. Dernier contexte visité. Aucun import React. |
| `front/src/hooks/useTenantSwitch.ts` | Effet unique qui, à tout changement du couple, annule les requêtes en vol, vide le cache et réinitialise les stores non persistés. |
| `front/src/components/custom/tenantSelector.tsx` | Sélecteur « Établissement › Service » de la barre de navigation. |
| `front/src/routes/_authenticated/choose-context.tsx` | Page de choix en pleine page. |
| `front/src/routes/_authenticated/e/$establishmentId/admin.tsx` | Layout d'établissement, contexte sans service. |
| `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId.tsx` | Layout de service. |
| `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings.tsx` | Layout des réglages de service. |
| `front/src/routes/_authenticated/(redirects)/*.tsx` | Anciennes URLs, une redirection chacune. |
| `front/vitest.config.ts`, `front/src/test/setup.ts` | Harnais de test du front. |

**Déplacés (front)** — `git mv`, le contenu du composant ne change pas, seule la chaîne passée à `createFileRoute` et les imports le font.

| De | Vers |
|---|---|
| `_authenticated/dashboard.tsx`, `agenda.tsx`, `suivi.tsx` | `_authenticated/e/$establishmentId/s/$serviceId/` |
| `_authenticated/patient/index.tsx`, `patient/$patientID.tsx` | idem, sous `patient/` |
| `_authenticated/_admin/settings/{planning,thematic,soignant,location,diagnostic-template,activity-log}.tsx` | `…/s/$serviceId/_settings/` |
| `_authenticated/_admin/settings/user.tsx` | `_authenticated/e/$establishmentId/admin/members.tsx` |

**Supprimés (front)** : `_authenticated/_admin.tsx` (remplacé par `_settings.tsx`), `front/src/store/useCartStore.ts` (démonstration sans rapport avec le métier).

**Modifiés (back)** : `infra/orm/tenant-guard.ts` (contrôle des inclusions), `domain/membership.domain.ts` (auto-rétrogradation), `prisma/seed.ts` et `prisma/seed/tenant.ts` (second service).

---

## Task 1 : alias de chemin `@/`

Onze fichiers de route descendent de quatre niveaux dans l'arborescence. Sans alias, chacun de leurs imports relatifs (`../../components/...`) devient `../../../../../components/...` et la moindre erreur de comptage ne se voit qu'à l'exécution. L'alias rend chaque déplacement mécanique : `git mv` plus une ligne.

**Files:**
- Modify: `front/vite.config.ts`
- Modify: `front/tsconfig.app.json`

**Interfaces:**
- Consumes: rien.
- Produces: `@/` résout vers `front/src/`. Toutes les tâches suivantes l'emploient dans les fichiers qu'elles créent ou déplacent.

- [ ] **Step 1 : déclarer l'alias pour Vite**

Dans `front/vite.config.ts`, ajouter l'import et la section `resolve` :

```ts
import { fileURLToPath, URL } from 'node:url'
```

et, dans l'objet passé à `defineConfig`, à côté de `plugins` :

```ts
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
```

- [ ] **Step 2 : déclarer l'alias pour TypeScript**

Dans `front/tsconfig.app.json`, à l'intérieur de `compilerOptions` :

```json
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
```

- [ ] **Step 3 : vérifier que l'alias résout**

Ajouter temporairement en tête de `front/src/main.tsx` :

```ts
import { useAuthStore as _aliasProbe } from '@/store/useAuthStore.ts'
```

Lancer `cd front && npm run build`.
Attendu : le build réussit. Retirer ensuite la ligne de sonde et relancer `npm run build` pour confirmer.

- [ ] **Step 4 : commit**

```bash
git add front/vite.config.ts front/tsconfig.app.json
git commit -m "chore(front): alias de chemin @/ vers src

Les fichiers de route vont descendre de quatre niveaux. Sans alias, chacun de
leurs imports relatifs se rallonge d'autant et une erreur de comptage ne se
voit qu'a l'execution.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 2 : harnais de test du front

Le front n'a aucun test. C'est cette absence qui a laissé passer, à l'étape 1, le défaut de l'état d'authentification persisté : aucun test ne partait d'un `localStorage` peuplé. Les tâches suivantes en ont besoin dès la tâche 3.

**Files:**
- Modify: `front/package.json`
- Create: `front/vitest.config.ts`
- Create: `front/src/test/setup.ts`
- Create: `front/src/test/smoke.test.ts`

**Interfaces:**
- Consumes: l'alias `@/` de la tâche 1.
- Produces: `npm test` dans `front/` lance Vitest ; `@/test/setup.ts` est chargé avant chaque fichier ; `jsdom` est l'environnement par défaut.

- [ ] **Step 1 : installer les dépendances**

```bash
cd front && npm install -D vitest@2 jsdom@25 @testing-library/react@16 @testing-library/jest-dom@6 @testing-library/user-event@14
```

- [ ] **Step 2 : configurer Vitest**

Créer `front/vitest.config.ts` :

```ts
import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

// Configuration distincte de `vite.config.ts` : on ne veut ni le plugin de
// routage (qui regenere routeTree.gen.ts) ni Tailwind pendant les tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

- [ ] **Step 3 : fichier de mise en place**

Créer `front/src/test/setup.ts` :

```ts
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
```

- [ ] **Step 4 : déclarer le script**

Dans `front/package.json`, section `scripts` :

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 5 : test de fumée**

Créer `front/src/test/smoke.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

describe('harnais de test', () => {
  it('dispose de jsdom et d un stockage local vide', () => {
    expect(typeof document).toBe('object')
    expect(localStorage.length).toBe(0)
    localStorage.setItem('x', '1')
    expect(localStorage.getItem('x')).toBe('1')
  })
})
```

- [ ] **Step 6 : lancer**

```bash
cd front && npm test
```
Attendu : 1 test passé.

- [ ] **Step 7 : commit**

```bash
git add front/package.json front/package-lock.json front/vitest.config.ts front/src/test
git commit -m "test(front): installer Vitest et Testing Library

Le front n'avait aucun test. C'est cette absence qui a laisse passer le defaut
de l'etat d'authentification persiste : aucun test ne partait d'un stockage
local peuple. Le fichier de mise en place vide donc le stockage avant chaque
test, pour que le peupler soit un geste explicite.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 3 : un contexte peut n'avoir aucun service

Les écrans d'administration vivent sous `/e/$establishmentId/admin`, sans service. Le contexte doit donc pouvoir porter un établissement seul. `hasPermission` accepte déjà `serviceRole: null` et refuse dans ce cas toute permission de service : rien à changer dans la matrice.

**Files:**
- Modify: `front/src/types/auth.ts`
- Modify: `front/src/constants/config.constant.ts`
- Test: `front/src/constants/config.constant.test.ts`

**Interfaces:**
- Consumes: `@/` (tâche 1), Vitest (tâche 2).
- Produces: `TenantContext.serviceId: string | null` et `serviceRole: ServiceRole | null`. `establishmentApiUrl()` fonctionne sans service ; `tenantApiUrl()` lève un message explicite si on l'appelle sans.

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `front/src/constants/config.constant.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { establishmentApiUrl, tenantApiUrl } from '@/constants/config.constant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'

const withService = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}
const withoutService = { ...withService, serviceId: null, serviceRole: null }

describe('fabriques d URL', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('compose les deux prefixes quand le contexte porte un service', () => {
    useAuthStore.setState({ context: withService })
    expect(tenantApiUrl()).toMatch(/\/e\/e1\/s\/s1$/)
    expect(establishmentApiUrl()).toMatch(/\/e\/e1\/admin$/)
  })

  // Un administrateur sur /e/$id/admin n'a pas de service : l'URL
  // d'etablissement doit fonctionner, celle de service doit refuser
  // bruyamment plutot que composer `/s/null`.
  it('compose l URL d etablissement sans service, et refuse celle de service', () => {
    useAuthStore.setState({ context: withoutService })
    expect(establishmentApiUrl()).toMatch(/\/e\/e1\/admin$/)
    expect(() => tenantApiUrl()).toThrow(/service/i)
  })

  it('refuse les deux sans contexte du tout', () => {
    expect(() => tenantApiUrl()).toThrow()
    expect(() => establishmentApiUrl()).toThrow()
  })
})
```

- [ ] **Step 2 : lancer, constater l'échec**

```bash
cd front && npm test -- config.constant
```
Attendu : échec de compilation TypeScript sur `serviceId: null`, le type ne l'admet pas encore.

- [ ] **Step 3 : élargir le type**

Dans `front/src/types/auth.ts`, remplacer le bloc `TenantContext` par :

```ts
// Contexte établissement/service courant, lu dans l'URL par le layout
// correspondant. `serviceId` et `serviceRole` sont nuls sur les écrans
// d'administration d'établissement, qui vivent sous une URL sans service.
export type TenantContext = {
  establishmentId: string
  serviceId: string | null
  establishmentRole: EstablishmentRole
  serviceRole: ServiceRole | null
  soignantId: string | null
}
```

- [ ] **Step 4 : adapter les fabriques**

Dans `front/src/constants/config.constant.ts`, remplacer `requireContext` et `tenantApiUrl` par :

```ts
const requireContext = () => {
  const context = useAuthStore.getState().context
  if (!context) {
    throw new Error('Aucun contexte établissement/service')
  }
  return context
}

// Préfixes calculés à l'appel, jamais au chargement du module : le contexte
// n'existe pas encore quand les modules sont importés.
export const tenantApiUrl = () => {
  const { establishmentId, serviceId } = requireContext()
  if (serviceId === null) {
    throw new Error(
      'Contexte sans service : cet appel appartient à un écran de service',
    )
  }
  return `${apiUrl}/e/${establishmentId}/s/${serviceId}`
}
```

`establishmentApiUrl` reste inchangé : il ne lit que `establishmentId`.

- [ ] **Step 5 : corriger les usages que le typage révèle**

```bash
cd front && npx tsc --noEmit -p tsconfig.app.json
```

Traiter chaque erreur signalée. `deriveContext` dans `front/src/store/useAuthStore.ts` renvoie aujourd'hui un `serviceId` toujours défini : son corps reste valide, le type s'élargit seulement. Ne pas ajouter d'assertion non nulle (`!`) : là où un service est requis, le vérifier.

- [ ] **Step 6 : lancer les tests**

```bash
cd front && npm test && npm run build
```
Attendu : les trois tests passent, le build réussit.

- [ ] **Step 7 : commit**

```bash
git add front/src/types/auth.ts front/src/constants/config.constant.ts front/src/constants/config.constant.test.ts
git commit -m "feat(front): un contexte peut ne porter aucun service

Les ecrans d'administration vivent sous une URL sans service. Le contexte
l'admet desormais, l'URL d'etablissement se compose sans, et celle de service
refuse bruyamment plutot que de produire un chemin contenant null.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 4 : résolution du contexte, pure et testée

Le cœur de l'étape. Un module sans React, sans store, sans routeur : des paramètres d'URL et un arbre d'appartenances entrent, un contexte ou `null` sort. C'est ce qui le rend testable exhaustivement, et c'est là que toutes les gardes de route iront puiser.

**Files:**
- Create: `front/src/utils/tenant-context.ts`
- Test: `front/src/utils/tenant-context.test.ts`

**Interfaces:**
- Consumes: `User` et `TenantContext` de `@/types/auth.ts` (tâche 3).
- Produces :
  - `resolveTenantContext(user: User | null, params: { establishmentId?: string; serviceId?: string }): TenantContext | null`
  - `resolveEstablishmentContext(user: User | null, params: { establishmentId?: string }): TenantContext | null` — exige `role === 'ADMIN'`
  - `defaultTenantContext(user: User | null): TenantContext | null`
  - `rememberContext(userId: string, context: TenantContext): void`
  - `forgetContext(userId: string): void`
  - `LAST_CONTEXT_KEY(userId: string): string`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `front/src/utils/tenant-context.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import {
  defaultTenantContext,
  rememberContext,
  resolveEstablishmentContext,
  resolveTenantContext,
} from '@/utils/tenant-context.ts'

const user: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      soignantId: 'so1',
      services: [
        { id: 's1', name: 'Cardio', role: 'COORDINATEUR' },
        { id: 's2', name: 'Pneumo', role: 'LECTURE' },
      ],
    },
    {
      id: 'e2',
      name: 'Clinique',
      role: 'MEMBER',
      soignantId: null,
      services: [{ id: 's3', name: 'Reeduc', role: 'INTERVENANT' }],
    },
  ],
}

describe('resolveTenantContext', () => {
  it('resout un couple present dans les appartenances', () => {
    expect(resolveTenantContext(user, { establishmentId: 'e1', serviceId: 's2' })).toEqual({
      establishmentId: 'e1',
      serviceId: 's2',
      establishmentRole: 'ADMIN',
      serviceRole: 'LECTURE',
      soignantId: 'so1',
    })
  })

  it('refuse un service qui appartient a un autre etablissement', () => {
    expect(resolveTenantContext(user, { establishmentId: 'e2', serviceId: 's1' })).toBeNull()
  })

  it('refuse un etablissement inconnu, un service inconnu, un parametre manquant', () => {
    expect(resolveTenantContext(user, { establishmentId: 'zz', serviceId: 's1' })).toBeNull()
    expect(resolveTenantContext(user, { establishmentId: 'e1', serviceId: 'zz' })).toBeNull()
    expect(resolveTenantContext(user, { establishmentId: 'e1' })).toBeNull()
    expect(resolveTenantContext(null, { establishmentId: 'e1', serviceId: 's1' })).toBeNull()
  })
})

describe('resolveEstablishmentContext', () => {
  it('resout un etablissement dont on est administrateur, sans service', () => {
    expect(resolveEstablishmentContext(user, { establishmentId: 'e1' })).toEqual({
      establishmentId: 'e1',
      serviceId: null,
      establishmentRole: 'ADMIN',
      serviceRole: null,
      soignantId: 'so1',
    })
  })

  // Simple membre : l'ecran d'administration ne doit pas s'ouvrir, meme si
  // le back refuserait de toute facon.
  it('refuse un etablissement dont on n est que membre', () => {
    expect(resolveEstablishmentContext(user, { establishmentId: 'e2' })).toBeNull()
  })
})

describe('defaultTenantContext', () => {
  beforeEach(() => localStorage.clear())

  it('prend le premier couple quand rien n a ete visite', () => {
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  it('reprend le dernier couple visite', () => {
    rememberContext('u1', resolveTenantContext(user, { establishmentId: 'e2', serviceId: 's3' })!)
    expect(defaultTenantContext(user)).toMatchObject({ establishmentId: 'e2', serviceId: 's3' })
  })

  // Affectation retiree entre deux sessions : le favori ne doit pas gagner
  // sur les appartenances reelles.
  it('ignore un dernier couple visite devenu invalide', () => {
    localStorage.setItem('medisync/last-context/u1', JSON.stringify({ establishmentId: 'e9', serviceId: 's9' }))
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  // Poste partage : le favori d'une personne ne doit pas etre propose a une
  // autre, d'ou la cle portant l'identifiant.
  it('ne lit pas le dernier couple d un autre utilisateur', () => {
    localStorage.setItem('medisync/last-context/autre', JSON.stringify({ establishmentId: 'e2', serviceId: 's3' }))
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  it('rend null pour un utilisateur sans appartenance', () => {
    expect(defaultTenantContext({ ...user, establishments: [] })).toBeNull()
    expect(defaultTenantContext(null)).toBeNull()
  })
})
```

- [ ] **Step 2 : lancer, constater l'échec**

```bash
cd front && npm test -- tenant-context
```
Attendu : échec, le module n'existe pas.

- [ ] **Step 3 : écrire le module**

Créer `front/src/utils/tenant-context.ts` :

```ts
import type { TenantContext, User } from '@/types/auth.ts'

// Le dernier contexte visité est retenu par utilisateur : sur un poste
// partagé, le favori de l'un ne doit pas être proposé à l'autre.
export const LAST_CONTEXT_KEY = (userId: string) => `medisync/last-context/${userId}`

type Params = { establishmentId?: string; serviceId?: string }

const establishmentOf = (user: User | null, establishmentId?: string) =>
  !user || !establishmentId
    ? undefined
    : user.establishments.find((e) => e.id === establishmentId)

// Un couple de l'URL n'est accepté que s'il figure dans les appartenances.
// Le back refuserait de toute façon par un 404 ; refuser ici évite d'envoyer
// la requête et permet de rediriger vers le choix de contexte.
export const resolveTenantContext = (user: User | null, params: Params): TenantContext | null => {
  const establishment = establishmentOf(user, params.establishmentId)
  if (!establishment || !params.serviceId) {
    return null
  }
  const service = establishment.services.find((s) => s.id === params.serviceId)
  if (!service) {
    return null
  }
  return {
    establishmentId: establishment.id,
    serviceId: service.id,
    establishmentRole: establishment.role,
    serviceRole: service.role,
    soignantId: establishment.soignantId,
  }
}

// Contexte des écrans d'administration : un établissement, aucun service, et
// le rôle ADMIN exigé — un simple membre n'a rien à y faire.
export const resolveEstablishmentContext = (
  user: User | null,
  params: Pick<Params, 'establishmentId'>,
): TenantContext | null => {
  const establishment = establishmentOf(user, params.establishmentId)
  if (!establishment || establishment.role !== 'ADMIN') {
    return null
  }
  return {
    establishmentId: establishment.id,
    serviceId: null,
    establishmentRole: establishment.role,
    serviceRole: null,
    soignantId: establishment.soignantId,
  }
}

const readLastContext = (userId: string): Params | null => {
  try {
    const raw = localStorage.getItem(LAST_CONTEXT_KEY(userId))
    return raw ? (JSON.parse(raw) as Params) : null
  } catch {
    // Stockage indisponible ou contenu illisible : on retombe sur le premier
    // couple, jamais sur une exception.
    return null
  }
}

export const rememberContext = (userId: string, context: TenantContext): void => {
  if (context.serviceId === null) {
    return
  }
  try {
    localStorage.setItem(
      LAST_CONTEXT_KEY(userId),
      JSON.stringify({ establishmentId: context.establishmentId, serviceId: context.serviceId }),
    )
  } catch {
    // Rien à faire : le confort de retrouver son service ne vaut pas une
    // exception au chargement.
  }
}

export const forgetContext = (userId: string): void => {
  try {
    localStorage.removeItem(LAST_CONTEXT_KEY(userId))
  } catch {
    // idem
  }
}

// Dans l'ordre : le dernier visité s'il est toujours valide, sinon le premier
// couple de l'arbre, sinon rien — et la personne tombe sur /pending.
export const defaultTenantContext = (user: User | null): TenantContext | null => {
  if (!user) {
    return null
  }
  const last = readLastContext(user.id)
  if (last) {
    const remembered = resolveTenantContext(user, last)
    if (remembered) {
      return remembered
    }
  }
  for (const establishment of user.establishments) {
    const service = establishment.services[0]
    if (service) {
      return resolveTenantContext(user, { establishmentId: establishment.id, serviceId: service.id })
    }
  }
  return null
}
```

- [ ] **Step 4 : lancer les tests**

```bash
cd front && npm test -- tenant-context
```
Attendu : les onze tests passent.

- [ ] **Step 5 : commit**

```bash
git add front/src/utils/tenant-context.ts front/src/utils/tenant-context.test.ts
git commit -m "feat(front): resolution pure du contexte depuis l URL

Des parametres d'URL et un arbre d'appartenances entrent, un contexte ou null
sort. Aucun import React, aucun store : c'est ce qui le rend testable
exhaustivement, et toutes les gardes de route y puiseront.

Le dernier contexte visite est retenu sous une cle portant l'identifiant de
l'utilisateur : sur un poste partage, le favori de l'un ne doit pas etre
propose a l'autre. Un favori devenu invalide ne gagne jamais sur les
appartenances reelles.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 5 : rafraîchir l'utilisateur au chargement

Défaut hérité de l'étape 1 : rien ne rappelle `/me` au chargement, le store persisté fait foi jusqu'à la connexion suivante. Une affectation accordée ou retirée n'apparaît donc qu'après une déconnexion. Tolérable avec un contexte unique, plus du tout dès qu'il se choisit — les gardes valident contre cet arbre.

`AuthApi.me()` existe déjà et n'est appelée nulle part.

**Files:**
- Modify: `front/src/routes/_authenticated.tsx`
- Create: `front/src/queries/useMe.ts`

**Interfaces:**
- Consumes: `AuthApi.me` (existant), `defaultTenantContext` (tâche 4), `RouterContext.queryClient`.
- Produces: `meQueryOptions` réutilisable ; après le `beforeLoad` de `_authenticated`, `useAuthStore.getState().user` est frais.

- [ ] **Step 1 : options de requête partagées**

Créer `front/src/queries/useMe.ts` :

```ts
import { queryOptions } from '@tanstack/react-query'

import { AuthApi } from '@/api/auth.api.ts'
import { AUTH } from '@/constants/process.constant.ts'

// Hors tenant : cette requete ne porte aucun prefixe et survit donc au vidage
// de cache du changement de contexte — elle en est meme la source, puisque
// les gardes valident contre l'arbre des appartenances qu'elle renvoie.
export const meQueryOptions = queryOptions({
  queryKey: [AUTH.ME],
  queryFn: AuthApi.me,
  staleTime: 30_000,
})
```

Si `AUTH.ME` n'existe pas dans `front/src/constants/process.constant.ts`, l'ajouter au catalogue `AUTH` avec la valeur `'getMe'`, en suivant la forme des entrées voisines.

- [ ] **Step 2 : charger `/me` dans la garde**

Remplacer `front/src/routes/_authenticated.tsx` par :

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { meQueryOptions } from '@/queries/useMe.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({ to: '/auth', search: { redirect: location.href } })
    }

    // Le store persiste survit aux rechargements : sans ce rappel, une
    // affectation accordee ou retiree n'apparaitrait qu'apres une
    // deconnexion. Les gardes de contexte validant contre cet arbre, il doit
    // etre frais avant qu'elles ne s'executent.
    try {
      const user = await context.queryClient.ensureQueryData(meQueryOptions)
      useAuthStore.getState().update(user)
    } catch {
      // Session expiree ou back injoignable : `fetchWithAuth` a deja tente le
      // rafraichissement. On laisse l'arbre persiste servir, plutot que de
      // bloquer l'application sur une panne reseau.
    }
  },
  component: () => <Outlet />,
})
```

Noter ce qui disparaît : la redirection vers `/pending` fondée sur `deriveContext`. Elle appartient désormais à `_authenticated/index.tsx` (tâche 6), parce que `_authenticated` couvre aussi `choose-context`, qu'une personne sans contexte doit pouvoir atteindre.

- [ ] **Step 3 : vérifier**

```bash
cd front && npm run build && npm test
```
Attendu : build et tests verts.

- [ ] **Step 4 : commit**

```bash
git add front/src/routes/_authenticated.tsx front/src/queries/useMe.ts front/src/constants/process.constant.ts
git commit -m "fix(front): rafraichir l utilisateur au chargement

Rien ne rappelait /me : le store persiste faisait foi jusqu'a la connexion
suivante, donc une affectation accordee ou retiree n'apparaissait qu'apres une
deconnexion. Les gardes de contexte validant contre cet arbre, il doit etre
frais avant qu'elles ne s'executent.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 6 : layout de service et déplacement des cinq écrans

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId.tsx`
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/index.tsx`
- Create: `front/src/routes/_authenticated/index.tsx` (remplace l'existant)
- Move: `dashboard.tsx`, `agenda.tsx`, `suivi.tsx`, `patient/index.tsx`, `patient/$patientID.tsx`

**Interfaces:**
- Consumes: `resolveTenantContext`, `defaultTenantContext`, `rememberContext` (tâche 4).
- Produces: les routes `/e/$establishmentId/s/$serviceId/{dashboard,agenda,suivi,patient,patient/$patientID}`. Le contexte est posé dans le store avant tout chargeur enfant.

- [ ] **Step 1 : le layout**

Créer `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId.tsx` :

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { rememberContext, resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId')({
  // `beforeLoad` et non un effet de rendu : c'est la seule position qui
  // garantisse qu'aucun chargeur enfant ne parte avec le contexte precedent.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!tenant) {
      throw redirect({ to: '/choose-context' })
    }
    useAuthStore.getState().setContext(tenant)
    if (context.authState.user) {
      rememberContext(context.authState.user.id, tenant)
    }
  },
  component: () => <Outlet />,
})
```

- [ ] **Step 2 : ajouter `setContext` au store**

Dans `front/src/store/useAuthStore.ts`, ajouter à `AuthStoreActions` :

```ts
  setContext: (context: TenantContext) => void
```

et à l'implémentation, à côté de `update` :

```ts
          // Pose le contexte lu dans l'URL. Ecrit sans condition : le layout
          // l'a deja valide contre les appartenances.
          setContext: (context: TenantContext) => {
            set({ context })
          },
```

- [ ] **Step 3 : index du service**

Créer `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/index.tsx` :

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/e/$establishmentId/s/$serviceId/dashboard',
      params,
    })
  },
})
```

- [ ] **Step 4 : index de l'application**

Remplacer `front/src/routes/_authenticated/index.tsx` par :

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

import { defaultTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (!tenant || tenant.serviceId === null) {
      throw redirect({ to: '/pending' })
    }
    throw redirect({
      to: '/e/$establishmentId/s/$serviceId/dashboard',
      params: { establishmentId: tenant.establishmentId, serviceId: tenant.serviceId },
    })
  },
})
```

L'ancien composant naviguait depuis le corps du rendu (`router.navigate` appelé pendant le rendu, effet de bord hors `useEffect`). La redirection en `beforeLoad` le remplace et supprime au passage ce défaut.

- [ ] **Step 5 : déplacer les cinq écrans**

```bash
cd front/src/routes/_authenticated
mkdir -p e/\$establishmentId/s/\$serviceId/patient
git mv dashboard.tsx e/\$establishmentId/s/\$serviceId/dashboard.tsx
git mv agenda.tsx e/\$establishmentId/s/\$serviceId/agenda.tsx
git mv suivi.tsx e/\$establishmentId/s/\$serviceId/suivi.tsx
git mv patient/index.tsx e/\$establishmentId/s/\$serviceId/patient/index.tsx
git mv patient/\$patientID.tsx e/\$establishmentId/s/\$serviceId/patient/\$patientID.tsx
rmdir patient
```

- [ ] **Step 6 : corriger chaque fichier déplacé**

Dans chacun des cinq, deux changements et deux seulement :

1. La chaîne de `createFileRoute` prend le nouveau chemin. Par exemple, dans `agenda.tsx` :

```tsx
export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId/agenda')({
```

2. Tous les imports relatifs (`'../../components/...'`, `'../../queries/...'`) passent à l'alias (`'@/components/...'`, `'@/queries/...'`). C'est la raison d'être de la tâche 1 : la profondeur relative a changé de quatre niveaux.

**Ne pas toucher au corps des composants.** Un déplacement qui modifie aussi le comportement ne se relit pas.

Pour `patient/$patientID.tsx`, vérifier que les navigations internes (`router.navigate({ to: '/patient' })`) passent aux nouvelles routes avec leurs paramètres :

```tsx
router.navigate({
  to: '/e/$establishmentId/s/$serviceId/patient',
  params: { establishmentId, serviceId },
})
```

où `establishmentId` et `serviceId` viennent de `Route.useParams()`.

- [ ] **Step 7 : vérifier**

```bash
cd front && npm run build
```
Attendu : le build réussit et `routeTree.gen.ts` est régénéré avec les nouveaux chemins. Si le plugin de routage n'a pas régénéré, lancer `npm run build` une seconde fois — il régénère à la première passe et compile à la suivante.

- [ ] **Step 8 : commit**

```bash
git add -A front/src/routes front/src/store/useAuthStore.ts
git commit -m "feat(front): layout de service et ecrans sous /e/:id/s/:id

Le couple est lu dans l'URL, valide contre les appartenances puis pose dans le
store en beforeLoad — la seule position qui garantisse qu'aucun chargeur
enfant ne parte avec le contexte precedent.

Les cinq ecrans sont deplaces sans que leur corps change : seuls le chemin de
route et la profondeur des imports bougent. L'index de l'application redirige
desormais en beforeLoad au lieu de naviguer depuis le rendu.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 7 : réglages de service et gardes en `beforeLoad`

Six des sept écrans de réglages ne se gardent aujourd'hui qu'au rendu, par un `Navigate`. Une garde au rendu laisse partir les requêtes du chargeur avant de rediriger : la donnée est demandée, et seul le back la refuse. Cette tâche les porte toutes en `beforeLoad`, comme `planning.tsx` le fait déjà.

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings.tsx`
- Move: les six écrans de `_authenticated/_admin/settings/` sauf `user.tsx`
- Delete: `front/src/routes/_authenticated/_admin.tsx`

**Interfaces:**
- Consumes: `can` de `@/hooks/useCan.ts`, `resolveTenantContext` (tâche 4).
- Produces: routes `/e/$establishmentId/s/$serviceId/{planning,thematic,soignant,location,diagnostic-template,activity-log}`.

- [ ] **Step 1 : le layout de réglages**

Créer `.../s/$serviceId/_settings.tsx` :

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '@/hooks/useCan.ts'
import type { Permission } from '@/utils/permissions.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Permissions couvrant les ecrans de reglages de service. La branche admet
// quiconque detient au moins l'une d'elles ; chaque ecran se garde ensuite par
// la sienne. `members:manage` n'y figure plus : l'ecran Membres administre des
// appartenances d'etablissement et vit desormais sous /e/:id/admin.
const SETTINGS_PERMISSIONS: Permission[] = [
  'planning:write',
  'soignants:manage',
  'referentials:write',
  'locations:manage',
  'activity-log:read',
]

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!SETTINGS_PERMISSIONS.some((permission) => can(tenant, permission))) {
      throw redirect({ to: '/e/$establishmentId/s/$serviceId/dashboard', params })
    }
  },
  component: () => <Outlet />,
})
```

- [ ] **Step 2 : déplacer les six écrans**

```bash
cd front/src/routes/_authenticated
mkdir -p e/\$establishmentId/s/\$serviceId/_settings
for f in planning thematic soignant location diagnostic-template activity-log; do
  git mv _admin/settings/$f.tsx e/\$establishmentId/s/\$serviceId/_settings/$f.tsx
done
```

- [ ] **Step 3 : donner à chacun sa garde**

Dans chacun des six, trois changements :

1. Le chemin de `createFileRoute`, par exemple :

```tsx
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/thematic',
)({
```

2. Les imports relatifs passent à l'alias `@/`.

3. Une garde en `beforeLoad`, avec la permission que l'écran exige réellement. Table à appliquer, sans en inventer :

| Écran | Permission |
|---|---|
| `planning.tsx` | `planning:write` |
| `thematic.tsx` | `referentials:write` |
| `diagnostic-template.tsx` | `referentials:write` |
| `soignant.tsx` | `soignants:manage` |
| `location.tsx` | `locations:manage` |
| `activity-log.tsx` | `activity-log:read` |

Forme, identique dans les six (exemple pour `thematic.tsx`) :

```tsx
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({ to: '/e/$establishmentId/s/$serviceId/dashboard', params })
    }
  },
```

Retirer le `Navigate` de repli devenu redondant dans le corps du composant, **et seulement lui** : le `useCan` qui masque des boutons dans le même écran reste.

- [ ] **Step 4 : supprimer l'ancien layout**

```bash
git rm front/src/routes/_authenticated/_admin.tsx
```

- [ ] **Step 5 : vérifier**

```bash
cd front && npm run build
```

- [ ] **Step 6 : commit**

```bash
git add -A front/src/routes
git commit -m "feat(front): reglages de service sous le layout _settings

Six des sept ecrans ne se gardaient qu'au rendu, par un Navigate : le chargeur
partait avant la redirection, donc la donnee etait demandee et seul le back la
refusait. Chacun porte desormais sa garde en beforeLoad, avec la permission
qu'il exige reellement.

members:manage quitte cette liste : l'ecran Membres administre des
appartenances d'etablissement et part sous /e/:id/admin.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 8 : layout d'établissement et écran Membres

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/admin.tsx`
- Move: `_authenticated/_admin/settings/user.tsx` → `_authenticated/e/$establishmentId/admin/members.tsx`

**Interfaces:**
- Consumes: `resolveEstablishmentContext` (tâche 4), `setContext` (tâche 6).
- Produces: route `/e/$establishmentId/admin/members`, avec un contexte sans service.

- [ ] **Step 1 : le layout**

Créer `front/src/routes/_authenticated/e/$establishmentId/admin.tsx` :

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Contexte sans service : c'est ce qui permet a un administrateur sans
// affectation de service d'atteindre malgre tout l'administration. Ne jamais
// memoriser ce contexte comme « dernier visite » — il ne designe pas un
// service et ne peut donc pas servir de destination par defaut.
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin')({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!tenant) {
      throw redirect({ to: '/choose-context' })
    }
    useAuthStore.getState().setContext(tenant)
  },
  component: () => <Outlet />,
})
```

- [ ] **Step 2 : déplacer l'écran**

```bash
cd front/src/routes/_authenticated
mkdir -p e/\$establishmentId/admin
git mv _admin/settings/user.tsx e/\$establishmentId/admin/members.tsx
rmdir _admin/settings _admin 2>/dev/null || true
```

- [ ] **Step 3 : adapter l'écran**

Chemin de route :

```tsx
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin/members')({
```

Garde en `beforeLoad` sur `members:manage`, avec `resolveEstablishmentContext` :

```tsx
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'members:manage')) {
      throw redirect({ to: '/' })
    }
  },
```

Imports en `@/`. Retirer le `<Navigate to="/" />` de repli, devenu redondant.

**Attention** : cet écran lit aujourd'hui `useAuthStore((state) => state.context)` pour composer l'ajout d'un membre, et `serviceId` y est maintenant `null`. Vérifier chaque usage. Le formulaire d'ajout (`addMemberForm.tsx`) passe `serviceId: context?.serviceId ?? ''` : cette valeur vide était déjà refusée par le schéma du back. Le corriger ici — le formulaire doit proposer les **services de l'établissement**, lus dans l'arbre des appartenances, et n'envoyer d'affectation que si l'un est choisi.

- [ ] **Step 4 : vérifier**

```bash
cd front && npm run build
```

- [ ] **Step 5 : commit**

```bash
git add -A front/src/routes front/src/components
git commit -m "feat(front): ecran Membres sous /e/:id/admin, contexte sans service

Le layout d'etablissement pose un contexte sans service, ce qui permet a un
administrateur sans affectation d'atteindre malgre tout l'administration —
c'etait le fond du probleme que l'etape 1 avait contourne par un garde.

Le formulaire d'ajout ne compose plus l'affectation a partir du service
courant, qui n'existe plus ici : il propose les services de l'etablissement.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 9 : anciennes URLs

Elles restent définitivement : un fichier de quelques lignes chacune, contre des liens mis en favori depuis des mois. Une redirection ne devine jamais le service, elle applique la règle du contexte par défaut.

**Files:**
- Create: `front/src/routes/_authenticated/dashboard.tsx`, `agenda.tsx`, `suivi.tsx`, `patient/index.tsx`, `patient/$patientID.tsx`, `settings/planning.tsx`, `settings/thematic.tsx`, `settings/soignant.tsx`, `settings/location.tsx`, `settings/diagnostic-template.tsx`, `settings/activity-log.tsx`, `settings/user.tsx`

**Interfaces:**
- Consumes: `defaultTenantContext` (tâche 4).
- Produces: aucune nouvelle interface ; douze redirections.

- [ ] **Step 1 : fabrique commune**

Créer `front/src/utils/legacy-redirect.ts` :

```ts
import { redirect } from '@tanstack/react-router'

import type { User } from '@/types/auth.ts'
import { defaultTenantContext } from '@/utils/tenant-context.ts'

// Les anciennes URLs ne portent aucun service. On applique la regle du
// contexte par defaut, jamais une devinette.
export const redirectToDefaultService = (user: User | null, to: string, extra?: Record<string, string>): never => {
  const tenant = defaultTenantContext(user)
  if (!tenant || tenant.serviceId === null) {
    throw redirect({ to: '/pending' })
  }
  throw redirect({
    to,
    params: {
      establishmentId: tenant.establishmentId,
      serviceId: tenant.serviceId,
      ...extra,
    },
  })
}
```

- [ ] **Step 2 : les douze redirections**

Chacune sur ce modèle. `front/src/routes/_authenticated/agenda.tsx` :

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { redirectToDefaultService } from '@/utils/legacy-redirect.ts'

export const Route = createFileRoute('/_authenticated/agenda')({
  beforeLoad: ({ context }) =>
    redirectToDefaultService(
      context.authState.user,
      '/e/$establishmentId/s/$serviceId/agenda',
    ),
})
```

`front/src/routes/_authenticated/patient/$patientID.tsx` transmet en plus son paramètre :

```tsx
export const Route = createFileRoute('/_authenticated/patient/$patientID')({
  beforeLoad: ({ context, params }) =>
    redirectToDefaultService(
      context.authState.user,
      '/e/$establishmentId/s/$serviceId/patient/$patientID',
      { patientID: params.patientID },
    ),
})
```

`front/src/routes/_authenticated/settings/user.tsx` vise l'administration, qui n'a pas de service :

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

import { defaultTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/settings/user')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (!tenant) {
      throw redirect({ to: '/pending' })
    }
    throw redirect({
      to: '/e/$establishmentId/admin/members',
      params: { establishmentId: tenant.establishmentId },
    })
  },
})
```

Les cinq autres `settings/*` suivent le modèle d'`agenda.tsx`, chacune vers `/e/$establishmentId/s/$serviceId/<nom>`.

- [ ] **Step 3 : vérifier**

```bash
cd front && npm run build
```
Attendu : aucune collision de route dans `routeTree.gen.ts`.

- [ ] **Step 4 : commit**

```bash
git add -A front/src/routes front/src/utils/legacy-redirect.ts
git commit -m "feat(front): conserver les anciennes URLs en redirection

Elles restent definitivement, pas le temps d'une depreciation : quelques
lignes chacune contre des liens mis en favori depuis des mois. Une redirection
ne devine jamais le service, elle applique la regle du contexte par defaut.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 10 : ne jamais montrer la donnée d'un autre service

**La tâche qui justifie l'étape.** Les clés de requête n'ont aucun préfixe de tenant, sur quatre-vingts appels. Les préfixer toutes serait quatre-vingts occasions d'en oublier une, et une seule suffit à montrer les patients du service A dans le service B. On vide donc le cache en entier : un seul point d'application, impossible à appliquer à moitié.

**Files:**
- Create: `front/src/hooks/useTenantSwitch.ts`
- Create: `front/src/hooks/useTenantSwitch.test.ts`
- Modify: `front/src/components/root.layout.tsx` (ou le point de montage identifié à l'étape 1)
- Modify: les trois stores non persistés

**Interfaces:**
- Consumes: `useAuthStore` (contexte courant), `useQueryClient`.
- Produces: `useTenantSwitch()` — monté une fois, sous le fournisseur de requêtes ; `resetOnTenantChange()` exporté pour les tests.

- [ ] **Step 1 : écrire le test qui compte, et le voir échouer**

Créer `front/src/hooks/useTenantSwitch.test.ts` :

```ts
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { resetOnTenantChange } from '@/hooks/useTenantSwitch.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'

describe('changement de contexte', () => {
  it('vide entierement le cache de requetes', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['patients'], [{ id: 'p1', nom: 'Service A' }])
    queryClient.setQueryData(['soignants'], [{ id: 'so1' }])

    await resetOnTenantChange(queryClient)

    expect(queryClient.getQueryData(['patients'])).toBeUndefined()
    expect(queryClient.getQueryData(['soignants'])).toBeUndefined()
  })

  // L'annulation doit preceder le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider, et la donnee du service
  // precedent reapparaitrait seule.
  it('annule les requetes en vol avant de vider', async () => {
    const queryClient = new QueryClient()
    const order: string[] = []
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => {
      order.push('cancel')
    })
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      order.push('clear')
    })

    await resetOnTenantChange(queryClient)

    expect(order).toEqual(['cancel', 'clear'])
  })

  it('reinitialise les stores non persistes', async () => {
    useDiagnosticStore.setState({ selectedId: 'd1' })
    await resetOnTenantChange(new QueryClient())
    expect(useDiagnosticStore.getState().selectedId).toBeNull()
  })
})
```

```bash
cd front && npm test -- useTenantSwitch
```
Attendu : échec, le module n'existe pas.

- [ ] **Step 2 : donner une réinitialisation aux trois stores non persistés**

Dans `useDiagnosticStore.ts`, `useDiagnosticTemplateStore.ts` et `usePathwayTemplateEditStore.ts`, ajouter une action `reset` remettant l'état à ses valeurs initiales. Exemple pour `useDiagnosticStore.ts` :

```ts
  // Appelee au changement de contexte : une selection en cours ne veut rien
  // dire dans un autre service.
  reset: () => set({ selectedId: null }),
```

Déclarer `reset: () => void` dans l'interface d'état de chacun.

- [ ] **Step 3 : écrire le module**

Créer `front/src/hooks/useTenantSwitch.ts` :

```ts
import type { QueryClient } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'

// Les cles de requete ne portent aucun prefixe de tenant, sur quatre-vingts
// appels. Les prefixer toutes serait quatre-vingts occasions d'en oublier une,
// et une seule suffit a montrer les patients d'un service dans un autre. On
// vide donc le cache en entier : un seul point d'application, impossible a
// appliquer a moitie. Le prix est un rechargement complet a chaque changement
// de contexte — une operation rare.
export const resetOnTenantChange = async (queryClient: QueryClient): Promise<void> => {
  // L'annulation precede le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider.
  await queryClient.cancelQueries()
  queryClient.clear()

  useDiagnosticStore.getState().reset()
  useDiagnosticTemplateStore.getState().reset()
  usePathwayTemplateEditStore.getState().reset()
}

// Monte une seule fois, sous le fournisseur de requetes. Compare le couple et
// non l'objet : le store reecrit un contexte equivalent a chaque navigation
// dans le meme service, ce qui viderait le cache a chaque page.
export const useTenantSwitch = (): void => {
  const queryClient = useQueryClient()
  const context = useAuthStore((state) => state.context)
  const key = context ? `${context.establishmentId}/${context.serviceId ?? ''}` : ''
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current !== null && previous.current !== key) {
      void resetOnTenantChange(queryClient)
    }
    previous.current = key
  }, [key, queryClient])
}
```

- [ ] **Step 4 : monter le crochet**

Dans `front/src/main.tsx`, à l'intérieur de `AppRoutes` (qui est déjà sous `QueryClientProvider`), ajouter l'appel en tête du composant :

```tsx
function AppRoutes() {
  useTenantSwitch()
  const user = useAuthStore((state) => state.user)
```

avec l'import correspondant.

- [ ] **Step 5 : lancer**

```bash
cd front && npm test && npm run build
```
Attendu : les trois tests passent.

- [ ] **Step 6 : prouver que le test verrouille**

Retirer temporairement la ligne `queryClient.clear()` du module, relancer `npm test -- useTenantSwitch`, constater l'échec du premier test, remettre la ligne. Consigner ce qui a été observé dans le rapport : un test qui ne devient pas rouge sans son mécanisme ne verrouille rien.

- [ ] **Step 7 : commit**

```bash
git add front/src/hooks/useTenantSwitch.ts front/src/hooks/useTenantSwitch.test.ts front/src/store front/src/main.tsx
git commit -m "feat(front): vider le cache et les selections au changement de contexte

C'est la tache qui justifie l'etape. Les cles de requete n'ont aucun prefixe
de tenant sur quatre-vingts appels ; les prefixer serait quatre-vingts
occasions d'en oublier une, et une seule suffit a montrer les patients d'un
service dans un autre. Le cache est donc vide en entier : un seul point
d'application, impossible a appliquer a moitie.

L'annulation des requetes en vol precede le vidage, faute de quoi une reponse
en retard reecrirait dans le cache qu'on vient de vider.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 11 : stores persistés indexés par service

Quatre stores persistent des identifiants propres à un service sans les qualifier. Les réinitialiser **et** les indexer serait contradictoire : l'indexation suffit, et elle préserve le confort de retrouver ses réglages en revenant dans un service.

**Files:**
- Modify: `useSoignantStore.ts`, `useDashboardFilterStore.ts`, `useTodoStore.ts`, `usePlanningStore.ts`
- Delete: `front/src/store/useCartStore.ts`
- Test: `front/src/store/persisted-scope.test.ts`

**Interfaces:**
- Consumes: `useAuthStore.getState().context`.
- Produces: chaque store persisté écrit sous `<nom>/<serviceId>`.

- [ ] **Step 1 : le test**

Créer `front/src/store/persisted-scope.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { scopedStorageName } from '@/store/scoped-storage.ts'

describe('nom de stockage indexe par service', () => {
  it('suffixe par le service courant', () => {
    expect(scopedStorageName('soignant-store', { serviceId: 's1' })).toBe('soignant-store/s1')
  })

  // Sans service (ecrans d'administration) ou sans contexte : un tiroir
  // neutre, jamais celui d'un service.
  it('retombe sur un tiroir neutre sans service', () => {
    expect(scopedStorageName('soignant-store', { serviceId: null })).toBe('soignant-store/-')
    expect(scopedStorageName('soignant-store', null)).toBe('soignant-store/-')
  })
})
```

- [ ] **Step 2 : la fabrique de noms**

Créer `front/src/store/scoped-storage.ts` :

```ts
import type { TenantContext } from '@/types/auth.ts'

// Un store persiste qui porte des identifiants de service doit changer de
// tiroir avec le service, faute de quoi un retour dans un service affiche les
// filtres d'un autre.
export const scopedStorageName = (
  base: string,
  context: Pick<TenantContext, 'serviceId'> | null,
): string => `${base}/${context?.serviceId ?? '-'}`
```

- [ ] **Step 3 : appliquer aux quatre stores**

Pour chacun, remplacer le `name` fixe de `persist` par un nom calculé au moment de l'hydratation. `zustand/persist` accepte un `name` chaîne ; comme le service n'est pas connu au chargement du module, utiliser l'option `storage` avec une clé calculée à l'appel. Forme à appliquer, exemple pour `useSoignantStore.ts` :

```ts
import { createJSONStorage, persist } from 'zustand/middleware'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { scopedStorageName } from '@/store/scoped-storage.ts'

// Le nom est calcule a chaque acces, pas au chargement du module : le service
// n'est pas connu quand les modules sont importes.
const scopedStorage = (base: string) =>
  createJSONStorage(() => ({
    getItem: (_key: string) =>
      localStorage.getItem(scopedStorageName(base, useAuthStore.getState().context)),
    setItem: (_key: string, value: string) =>
      localStorage.setItem(scopedStorageName(base, useAuthStore.getState().context), value),
    removeItem: (_key: string) =>
      localStorage.removeItem(scopedStorageName(base, useAuthStore.getState().context)),
  }))
```

puis, dans les options de `persist` :

```ts
      name: 'soignant-store',
      storage: scopedStorage('soignant-store'),
```

Extraire `scopedStorage` dans `scoped-storage.ts` plutôt que de le recopier quatre fois.

**Attention** : `zustand` ne réhydrate qu'au chargement du module. Après un changement de service, appeler la réhydratation depuis `resetOnTenantChange` (tâche 10) :

```ts
  useSoignantStore.persist.rehydrate()
  useDashboardFilterStore.persist.rehydrate()
  useTodoStore.persist.rehydrate()
  usePlanningStore.persist.rehydrate()
```

- [ ] **Step 4 : supprimer le store de démonstration**

```bash
git rm front/src/store/useCartStore.ts
cd front && grep -rn "useCartStore" src || echo "aucun usage"
```
S'il subsiste des usages, supprimer aussi les composants concernés : ils appartiennent à la même démonstration.

- [ ] **Step 5 : vérifier**

```bash
cd front && npm test && npm run build
```

- [ ] **Step 6 : commit**

```bash
git add -A front/src/store
git commit -m "feat(front): indexer par service les stores persistes

Quatre stores persistaient des identifiants de soignants, de modeles de
parcours et de taches vues sans les qualifier : un retour dans un service
affichait les filtres d'un autre. Chacun change desormais de tiroir avec le
service.

Les reinitialiser ET les indexer aurait ete contradictoire : l'indexation
suffit, et elle preserve le confort de retrouver ses reglages.

useCartStore, reliquat de demonstration sans rapport avec le metier, est
supprime.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 12 : sélecteur et page de choix

**Files:**
- Create: `front/src/components/custom/tenantSelector.tsx`
- Create: `front/src/routes/_authenticated/choose-context.tsx`
- Modify: `front/src/components/navbar.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (utilisateur et contexte), `useRouter`.
- Produces: `<TenantSelector />`, route `/choose-context`.

- [ ] **Step 1 : le sélecteur**

Créer `front/src/components/custom/tenantSelector.tsx` :

```tsx
import { useRouter } from '@tanstack/react-router'
import { Building2, ChevronDown } from 'lucide-react'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'

// Affiche seulement si plus d'un couple est accessible : la tres grande
// majorite des comptes n'en a qu'un et ne doit pas voir apparaitre une
// commande sans objet.
export const TenantSelector = () => {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const context = useAuthStore((state) => state.context)

  const couples = (user?.establishments ?? []).flatMap((establishment) =>
    establishment.services.map((service) => ({ establishment, service })),
  )

  if (couples.length <= 1) {
    return null
  }

  const current = couples.find(
    (c) => c.establishment.id === context?.establishmentId && c.service.id === context?.serviceId,
  )

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button variant="none" className="gap-2 px-2 max-w-60 truncate" aria-label="Changer de service">
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate text-sm">
            {current ? `${current.establishment.name} › ${current.service.name}` : 'Choisir un service'}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2}>
        {couples.map(({ establishment, service }) => (
          <PopoverMenuItem
            key={`${establishment.id}/${service.id}`}
            icon={<Building2 className="w-4 h-4" />}
            onClick={() =>
              // Une fiche patient precise n'a pas d'equivalent dans un autre
              // service tant que l'etape 3 n'a pas cree les sous-dossiers :
              // on ramene donc toujours a l'index du service.
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/dashboard',
                params: { establishmentId: establishment.id, serviceId: service.id },
              })
            }
          >
            {establishment.name} › {service.name}
          </PopoverMenuItem>
        ))}
      </PopoverContent>
    </PopoverRoot>
  )
}
```

- [ ] **Step 2 : le poser dans la barre**

Dans `front/src/components/navbar.tsx`, à l'intérieur du bloc `w-60` qui contient le logo et le bouton de repli, après ce bouton :

```tsx
        <TenantSelector />
```

- [ ] **Step 3 : la page de choix**

Créer `front/src/routes/_authenticated/choose-context.tsx` : une page pleine page listant les couples groupés par établissement, chacun un bouton menant à `/e/$establishmentId/s/$serviceId/dashboard`. Si l'utilisateur n'a aucun couple, rediriger vers `/pending` en `beforeLoad`. Réutiliser la même dérivation `couples` que le sélecteur en l'extrayant dans `@/utils/tenant-context.ts` sous le nom `accessibleCouples(user)`, plutôt que de la recopier.

- [ ] **Step 4 : test du sélecteur**

Créer `front/src/components/custom/tenantSelector.test.tsx`, avec Testing Library : le sélecteur ne rend rien pour un utilisateur à un seul couple, et rend autant d'entrées que de couples pour un utilisateur qui en a trois. Monter le composant avec un routeur de test minimal.

- [ ] **Step 5 : vérifier et commiter**

```bash
cd front && npm test && npm run build
git add -A front/src
git commit -m "feat(front): selecteur de service et page de choix

Le selecteur n'apparait qu'au-dela d'un couple accessible : la tres grande
majorite des comptes n'en a qu'un et ne doit pas voir une commande sans objet.

Changer de service ramene a l'index : une fiche patient precise n'a pas
d'equivalent ailleurs tant que l'etape 3 n'a pas cree les sous-dossiers.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 13 : un 404 du back renvoie au choix de contexte

Un couple valide côté front mais refusé par le back signifie une seule chose : l'arbre des appartenances du front est périmé — affectation retirée pendant la session. Le back fait foi.

**Files:**
- Modify: `front/src/api/fetchWithAuth.ts`
- Modify: `front/src/main.tsx` (fournir le routeur au gestionnaire)

**Interfaces:**
- Consumes: `meQueryOptions` (tâche 5).
- Produces: un 404 sur une URL commençant par `/e/` déclenche un rechargement de `/me` puis une navigation vers `/choose-context`.

- [ ] **Step 1 : le traitement**

Dans `front/src/api/fetchWithAuth.ts`, après la réponse et le traitement existant du 401, ajouter :

```ts
  // Un 404 sur une route de tenant, alors que le front croyait le couple
  // valide, signifie que son arbre des appartenances est perime : le back
  // fait foi. On le recharge et on renvoie au choix de contexte, plutot que
  // d'afficher une erreur incomprehensible.
  if (response.status === 404 && new URL(response.url).pathname.startsWith('/e/')) {
    onStaleTenant?.()
  }
```

où `onStaleTenant` est un rappel enregistré depuis `main.tsx`, pour que ce module ne dépende ni du routeur ni du client de requêtes.

- [ ] **Step 2 : enregistrer le rappel**

Dans `front/src/main.tsx`, après la création du routeur :

```ts
registerStaleTenantHandler(() => {
  void queryClient.invalidateQueries(meQueryOptions)
  void router.navigate({ to: '/choose-context' })
})
```

- [ ] **Step 3 : test**

Dans `front/src/api/fetchWithAuth.test.ts`, vérifier que le rappel est appelé pour un 404 sur `/e/...`, et **pas** pour un 404 sur `/me` ni sur une ressource absente hors tenant. Simuler `fetch`.

- [ ] **Step 4 : commit**

```bash
git add front/src/api front/src/main.tsx
git commit -m "feat(front): un 404 de tenant renvoie au choix de contexte

Un couple valide cote front mais refuse par le back signifie que l'arbre des
appartenances du front est perime — affectation retiree pendant la session. Le
back fait foi : on le recharge et on renvoie au choix, plutot que d'afficher
une erreur incomprehensible.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 14 : garde-fou Prisma, contrôle des inclusions étendu

Le garde-fou ne descend dans les `include` que depuis un modèle **global**. Une lecture partant d'un modèle d'établissement et incluant un modèle de service n'est pas contrôlée. C'était la cause de la fuite trouvée à l'étape 1 sur les problèmes d'inscription, corrigée alors repository par repository. L'étape 3 va créer exactement cette forme de lecture, du patient vers son sous-dossier.

**Files:**
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Test: `back/src/test/unit/infra/tenant-guard.test.ts`

**Interfaces:**
- Consumes: `SERVICE_MODELS`, `ESTABLISHMENT_MODELS`, `GLOBAL_TENANT_RELATIONS` existants.
- Produces: une table `TENANT_CHILD_RELATIONS` déclarant, pour chaque modèle d'établissement, ses relations vers des modèles de service ; une inclusion non déclarée est refusée avec un message nommant l'entrée à ajouter.

- [ ] **Step 1 : les tests**

Ajouter à `back/src/test/unit/infra/tenant-guard.test.ts` :

```ts
describe('inclusions depuis un modele d etablissement', () => {
  const store = { kind: 'tenant' as const, tenant: tenantFixture }

  // Fuite reelle trouvee a l'etape 1 : un patient (etablissement) incluant
  // ses problemes d'inscription (service) remontait ceux de tous les services.
  it('refuse une inclusion vers un modele de service sans filtre', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Patient',
          operation: 'findMany',
          args: { where: { establishmentId: 'e1' }, include: { enrollmentIssues: true } },
        },
        store,
      ),
    ).toThrow(/enrollmentIssues/)
  })

  it('accepte la meme inclusion filtree sur le service courant', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Patient',
          operation: 'findMany',
          args: {
            where: { establishmentId: 'e1' },
            include: { enrollmentIssues: { where: { serviceId: 's1' } } },
          },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('laisse passer une inclusion vers un modele du meme niveau', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Patient', operation: 'findMany', args: { where: { establishmentId: 'e1' }, include: { establishment: true } } },
        store,
      ),
    ).not.toThrow()
  })
})
```

Adapter les noms de relations à `back/prisma/schema.prisma` : lire le modèle `Patient` et reprendre les noms exacts, n'en inventer aucun.

- [ ] **Step 2 : lancer, constater l'échec**

```bash
cd back && npm run test:unit -- --ci
```
Attendu : le premier test échoue, l'inclusion passe aujourd'hui sans contrôle.

- [ ] **Step 3 : implémenter**

Déclarer, à côté des tables existantes, les relations d'un modèle d'établissement vers un modèle de service, en lisant le schéma. Puis, dans `assertTenantScope`, pour un modèle de la famille `establishment` en lecture : parcourir `include` et `select`, et pour toute relation déclarée dans cette table, exiger que sa valeur soit un objet portant un `where` avec la colonne `serviceId` du tenant courant. Refuser sinon, avec un message qui nomme la relation et ce qu'il faut ajouter — même forme que les refus existants.

- [ ] **Step 4 : corriger les appels que cela casse**

```bash
cd back && npm run test:e2e
```
Chaque échec désigne une lecture réelle à filtrer. Les corriger dans le repository concerné, jamais en assouplissant le garde-fou.

- [ ] **Step 5 : commit**

```bash
git add back/src/main/infra/orm/tenant-guard.ts back/src/test/unit/infra/tenant-guard.test.ts back/src/main/infra/orm/repositories
git commit -m "feat(tenant-guard): controler les inclusions depuis un modele d etablissement

Le garde-fou ne descendait dans les include que depuis un modele global. Une
lecture partant d'un modele d'etablissement et incluant un modele de service
n'etait pas controlee : c'etait la cause de la fuite trouvee a l'etape 1 sur
les problemes d'inscription, corrigee alors repository par repository.

L'etape 3 va creer exactement cette forme de lecture, du patient vers son
sous-dossier. Le controle est donc pose avant d'en avoir besoin.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 15 : un administrateur ne peut plus se rétrograder, et retrouve le droit de vider ses services

Deux faces d'une même règle. `update` empêche déjà un administrateur de retirer ses propres services ; il ne l'empêche pas de passer son propre rôle à `MEMBER` et de perdre `members:manage`. Et le garde ajouté à l'étape 1 n'existait que parce qu'un administrateur sans service se retrouvait sans écran : les tâches 8 et 9 lui donnent l'administration sous une URL sans service, **ce garde perd donc sa raison d'être**.

**Files:**
- Modify: `back/src/main/domain/membership.domain.ts`
- Modify: `front/src/api/members.api.ts`
- Test: `back/src/test/unit/domain/membership.domain.test.ts`

**Interfaces:**
- Consumes: `isSelf`, `OWN_SERVICES_REQUIRED` existants.
- Produces: un refus `409` sur l'auto-rétrogradation, avec un message anglais répertorié côté front.

- [ ] **Step 1 : les tests**

Dans `back/src/test/unit/domain/membership.domain.test.ts` :
- remplacer le cas « refuse a l utilisateur courant de vider sa propre liste de services » par son inverse : l'opération est désormais **permise** ;
- supprimer le cas « laisse l utilisateur courant enregistrer sa propre ligne quand il n avait deja aucun service », devenu sans objet ;
- ajouter :

```ts
  // Sans ce garde, un administrateur se retrograde en MEMBER, perd
  // members:manage, et ne peut plus se retablir lui-meme.
  it('refuse a l utilisateur courant de se retrograder en MEMBER', async () => {
    const { domain, ctx, calls } = build([row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })], 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' })),
      409,
      SELF_DEMOTION,
    )
    expect(calls).toEqual([])
  })

  it('laisse retrograder un autre administrateur quand il en reste un', async () => {
    const { domain, ctx, calls } = build([row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })], 2)
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    expect(calls).toEqual(['update'])
  })
```

avec `const SELF_DEMOTION = 'Cannot remove your own administrator role'`.

- [ ] **Step 2 : implémenter**

Dans `membership.domain.ts` : supprimer `assertKeepsOwnService`, la constante `OWN_SERVICES_REQUIRED` et son appel dans `update`. Ajouter à la place, avec sa constante de message :

```ts
// Un administrateur qui se retrograde perd `members:manage`, donc le droit de
// se retablir : seul un collegue pourrait le faire. Retrograder quelqu'un
// d'autre reste permis.
private assertNotSelfDemotion(
  membership: MembershipRowDomain,
  role: EstablishmentRole | undefined,
): void {
  if (role === 'MEMBER' && this.isSelf(membership)) {
    throw Boom.conflict(SELF_DEMOTION)
  }
}
```

appelé dans `update` avant `assertReferences`.

- [ ] **Step 3 : côté front**

Dans `front/src/api/members.api.ts`, retirer l'entrée `'Cannot remove all of your own services'` de `CONFLICT_MESSAGES` et ajouter :

```ts
  'Cannot remove your own administrator role': {
    title: 'Retrait de votre propre rôle',
    message:
      "Vous ne pouvez pas retirer votre propre rôle d'administrateur : vous perdriez le droit de vous le rendre. Demandez à un autre administrateur de le faire.",
  },
```

- [ ] **Step 4 : vérifier**

```bash
cd back && npm run test:unit -- --ci && npm run test:e2e
cd ../front && npm run build
```

- [ ] **Step 5 : commit**

```bash
git add back/src/main/domain/membership.domain.ts back/src/test/unit/domain/membership.domain.test.ts front/src/api/members.api.ts
git commit -m "feat(membership): interdire l auto-retrogradation, liberer le vidage de services

Deux faces d'une meme regle. Se retrograder en MEMBER fait perdre
members:manage, donc le droit de se retablir : seul un collegue le pourrait.

Le garde de l'etape 1 sur le vidage de ses propres services n'existait que
parce qu'un administrateur sans service se retrouvait sans aucun ecran. Il
dispose desormais de l'administration sous une URL sans service : ce garde
perd sa raison d'etre et disparait, avec son test.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 16 : seed à deux services

Sans cela, ni le sélecteur ni le cloisonnement ne se vérifient sans manipuler la base à la main. Le seed est déjà paramétré par tenant, ce qui rend l'ajout mécanique.

**Files:**
- Modify: `back/prisma/seed.ts`, `back/prisma/seed/tenant.ts`, `back/prisma/seed/user.ts`

**Interfaces:**
- Consumes: les fonctions de seed existantes, qui prennent toutes `tenant` en argument.
- Produces: un établissement, deux services, un utilisateur membre des deux et un membre d'un seul.

- [ ] **Step 1 : deux services**

`seedTenant` renvoie `{ establishment, service }`. Le faire renvoyer `{ establishment, services: [serviceA, serviceB] }`, en conservant des noms parlants (« Cardiologie », « Pneumologie »).

- [ ] **Step 2 : peupler les deux**

Dans `seed.ts`, appeler la chaîne existante une fois par service. Les données de chacun doivent être **distinctes et reconnaissables** — un patient nommé différemment dans chaque service — faute de quoi un défaut de cloisonnement ne se verrait pas à l'œil.

- [ ] **Step 3 : trois comptes**

- un administrateur d'établissement, coordinateur des **deux** services : c'est lui qui exerce le sélecteur ;
- un intervenant du **seul** service A : c'est lui qui prouve qu'aucun sélecteur n'apparaît et qu'aucune donnée de B n'est joignable ;
- un secrétariat du service A, pour exercer le filtrage clinique à l'écran.

- [ ] **Step 4 : vérifier sur la base de test uniquement**

```bash
cd back && npm run with:dotenv -- -e .env.test.local -e .env.test -- prisma db seed
```
**Ne jamais lancer le seed sur `medisync`** : il crée sans condition et produirait un second arbre de données en double.

Vérifier ensuite les comptes :

```bash
docker exec medisync-postgres psql -U postgres -d medisync_test -tAc \
  'select u.email, em.role, count(sm.id) from "User" u join "EstablishmentMembership" em on em."userId"=u.id left join "ServiceMembership" sm on sm."establishmentMembershipId"=em.id group by 1,2;'
```
Attendu : trois comptes, avec respectivement deux, une et une appartenance de service.

- [ ] **Step 5 : commit**

```bash
git add back/prisma
git commit -m "feat(seed): un etablissement, deux services, trois comptes

Sans cela, ni le selecteur ni le cloisonnement ne se verifient sans manipuler
la base a la main. Les donnees des deux services sont volontairement
distinctes : un defaut de cloisonnement doit se voir a l'oeil.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 17 : conventions écrites et vérification manuelle

Les trois défauts trouvés après la fusion de l'étape 1 avaient une cause commune : une hypothèse tenue pour vraie par un type ou par une convention, que rien n'exécutait. Deux conventions nouvelles naissent de cette étape et doivent être écrites là où le prochain implémenteur les lira.

**Files:**
- Create: `front/CLAUDE.md`
- Modify: `docs/multi-tenant/decisions-etape-1.md` → créer `docs/multi-tenant/decisions-etape-2.md`
- Create: `docs/multi-tenant/verification-etape-2.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la documentation de l'étape.

- [ ] **Step 1 : guide du front**

Le dépôt a un `back/CLAUDE.md` mais rien côté front. Créer `front/CLAUDE.md` couvrant, dans le style du guide back : la disposition des dossiers, l'alias `@/`, le routage par fichiers et la convention des layouts, et surtout les deux règles issues de cette étape :

> **Le contexte est implicite et vient de l'URL.** Les deux fabriques de `constants/config.constant.ts` le lisent dans le store, où un layout de route l'a posé en `beforeLoad`. N'appelez jamais `tenantApiUrl()` depuis un écran qui n'est pas sous le layout de service : elle lève.
>
> **Les clés de requête ne portent pas le tenant, et c'est délibéré.** Le cache est vidé en entier au changement de contexte (`hooks/useTenantSwitch.ts`). Ne préfixez pas les clés « pour faire mieux » : deux mécanismes concurrents, dont l'un incomplet, valent moins qu'un seul entier. Si vous ajoutez une requête, vous n'avez rien à faire.

- [ ] **Step 2 : décisions de l'étape**

Créer `docs/multi-tenant/decisions-etape-2.md` sur le modèle de celui de l'étape 1 : chaque décision, son motif, et ce qu'elle coûte si elle est fausse. Y consigner au minimum le choix du contexte implicite contre le passage explicite, le vidage de cache contre le préfixage des clés, l'indexation des stores persistés contre leur réinitialisation, et la disparition du garde sur le vidage de ses propres services.

- [ ] **Step 3 : vérification manuelle**

Créer `docs/multi-tenant/verification-etape-2.md` : une liste numérotée, chaque point disant ce qu'on fait et ce qu'on doit observer. Au minimum :

1. Compte à un seul service : aucun sélecteur dans la barre, l'application est indiscernable d'avant.
2. Compte à deux services : le sélecteur apparaît, en changer recharge l'écran sur les données de l'autre service.
3. Après changement, ouvrir la liste des patients : **aucune ligne du service précédent**, y compris pendant le chargement.
4. Les filtres de soignants cochés dans le service A sont retrouvés en y revenant, et ne s'appliquent pas dans B.
5. Une ancienne URL (`/agenda`) mène au service par défaut, paramètres conservés.
6. Une URL de service auquel on n'appartient pas mène à la page de choix, pas à une erreur.
7. Un administrateur atteint l'écran Membres sans passer par un service.
8. Déconnexion, reconnexion : le dernier service visité est proposé.

- [ ] **Step 4 : vérifier les portes**

```bash
cd back && npm run build && npm run lint && npm run test:unit -- --ci && npm run test:e2e
cd ../front && npm run build && npm run lint && npm test
```
Attendu : tout vert. Rappel : `npm run validate` n'est pas un critère, il échoue déjà sur `main`.

- [ ] **Step 5 : commit**

```bash
git add front/CLAUDE.md docs/multi-tenant
git commit -m "docs: conventions du front et verification de l etape 2

Les trois defauts trouves apres la fusion de l'etape 1 avaient une cause
commune : une hypothese tenue pour vraie par une convention que rien
n'executait. Les deux conventions nees de cette etape — contexte implicite
venu de l'URL, cles de requete volontairement non prefixees — sont donc
ecrites la ou le prochain implementeur les lira.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Auto-relecture du plan

**Couverture de la spécification.** Section 1 → tâches 6 à 9 et 12. Section 2 (décision gouvernante) → tâches 3, 10, 11. Section 3.1 → tâches 6, 7, 8. Section 3.2 → gardes des tâches 6, 7, 8. Section 3.3 → tâche 9. Section 4.1 → tâches 3 et 6. Section 4.2 → tâche 4. Section 4.3 → tâche 13. Section 4.4 → tâche 5. Section 5.1 → tâche 10. Section 5.2 → tâches 10 et 11. Section 5.3 → aucune tâche, et c'est voulu : `useCan` ne change pas. Section 6 → tâche 12. Section 7.1 → tâche 8 (le back n'avait rien à changer). Section 7.2 → tâche 14. Section 7.3 → tâche 15. Section 7.4 → tâche 16. Section 8 → tâches 2, 4, 10, 14, 15, 17. Section 9 → tâche 17.

**Conflits entre tâches.**

| Paire | Ce qui se partage | Constat |
|---|---|---|
| 1 → 6, 7, 8, 9 | l'alias `@/` | La tâche 1 doit précéder tout déplacement, sinon les imports se rallongent de quatre niveaux. Ordre respecté. |
| 3 → 4, 6, 8 | `TenantContext.serviceId` nullable | La tâche 3 élargit le type avant que 4 ne le produise et que 8 n'en pose un sans service. Ordre respecté. |
| 4 → 6, 8, 9, 12 | les fonctions de résolution | Produites en 4, consommées ensuite. Ordre respecté. |
| 6 → 7, 8 | `setContext` sur le store | Ajouté en 6, utilisé en 8. La tâche 7 ne pose pas de contexte : son layout est imbriqué **sous** celui de la tâche 6, qui l'a déjà posé. Vérifié. |
| 7 ↔ 8 | `_admin/settings/` | La tâche 7 déplace six fichiers, la tâche 8 le septième et supprime le dossier. La tâche 7 supprime `_admin.tsx`, la tâche 8 les dossiers vides. Pas de collision si l'ordre est tenu. |
| 9 ↔ 6, 7, 8 | les chemins d'anciennes URLs | La tâche 9 **recrée** des fichiers aux chemins que 6, 7 et 8 ont libérés. Elle doit venir après, sinon collision de routes. Ordre respecté. |
| 10 ↔ 11 | `resetOnTenantChange` | La tâche 10 l'écrit, la tâche 11 y ajoute les réhydratations. Dépendance explicite dans la tâche 11. |
| 14 ↔ e2e existants | le garde-fou | La tâche 14 resserre le garde-fou : des lectures existantes peuvent tomber. L'étape 4 de la tâche l'anticipe et impose de corriger l'appel, jamais d'assouplir le garde. |
| 15 ↔ étape 1 | le garde sur les services | La tâche 15 **supprime** un garde posé à l'étape 1 et son test. C'est délibéré et motivé ; à ne pas confondre avec une régression lors de la revue. |

**Cohérence des types.** `TenantContext` (tâche 3) est le seul type produit et consommé partout ; `serviceId: string | null` est respecté dans les tâches 4, 6, 8, 11 et 12, où chaque lecture d'un `serviceId` vérifie la nullité avant usage. `resolveTenantContext` et `resolveEstablishmentContext` rendent tous deux un `TenantContext | null`, jamais un type distinct. `scopedStorageName` prend un `Pick<TenantContext, 'serviceId'> | null`, compatible avec le contexte complet comme avec `null`.

**Points d'attention pour l'exécution.**

- La tâche 11 emploie `persist.rehydrate()`, qui n'existe que si le store est créé avec `persist` — c'est le cas des quatre visés, mais l'implémenteur doit vérifier que `zustand` expose bien `.persist` sur le store typé et non sur une variante.
- La tâche 7 et la tâche 8 suppriment des dossiers ; `rmdir` échoue si un fichier reste. C'est un signal utile, pas une erreur à contourner.
- La tâche 12 laisse délibérément la page `choose-context` en prose plutôt qu'en code : c'est un écran de présentation sans logique, et le détail de sa mise en forme n'a pas à être figé ici. Toutes les autres étapes de code donnent le code.

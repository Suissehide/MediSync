# Rôle des thématiques dans les indicateurs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque thématique porte un rôle (Diagnostic éducatif, Réactualisation, Bilan de fin, ou aucun) réglé par le chef de service ; les indicateurs ARS et Activité le lisent au lieu de comparer des noms.

**Architecture:** Enum Prisma + colonne nullable `Thematic.role`, préremplie par une migration SQL dont le bloc de préremplissage est aussi rejoué par le script d'import Draxa. La cohorte en mémoire (`findCohort`) charge le rôle de la thématique de chaque présence ; `isRole` le lit. L'API et l'écran Thématiques exposent le champ.

**Tech Stack:** Prisma + PostgreSQL, Fastify + Zod v4, Jest (back) ; React + TanStack Form + Vitest (front) ; Python 3 (script d'import).

**Spec:** `docs/superpowers/specs/2026-10-09-role-des-thematiques-design.md`

## Global Constraints

- Valeurs de l'enum, exactement : `DIAGNOSTIC_EDUCATIF`, `REACTUALISATION`, `BILAN_DE_FIN`. Null = aucun rôle.
- Libellés front, exactement : Aucun / Diagnostic éducatif / Réactualisation / Bilan de fin. Libellé du champ : « Rôle dans les indicateurs ».
- Nouvelle définition (seule modifiée) de « Bilans de fin » dans `ACTIVITY_DEFINITIONS` : « Présences à une thématique marquée « Bilan de fin » dans l'écran Thématiques. »
- Les logiques ARS et Activité ne changent pas, seule la reconnaissance des thématiques change.
- Biome (`npx biome check --write <fichiers>`), jamais `biome-ignore`. Commentaires : une ligne ou rien, en français.
- Back tests : `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts <fichier>`. Après avoir créé la migration, l'appliquer à la base de test : `cd back && npm run with:dotenv -- -e .env.test.local -e .env.test -- prisma migrate deploy`, puis `npx prisma generate`.
- Back `tsc -p .` a des erreurs préexistantes : « propre » = aucune erreur dans un fichier touché.
- Front tests : `cd front && npx vitest run <fichier>` ; typecheck `cd front && npx tsc -b`.
- Noms de tests en français sans accents. Commits en français (`feat(thematiques): …`).
- Jamais `git stash`.

## Review Focus

1. « Diagnostic Éducatif – Bilan CEPTA » doit devenir `DIAGNOSTIC_EDUCATIF`, pas `BILAN_DE_FIN` (le diagnostic l'emporte). Test Task 1.
2. Le préremplissage ne doit jamais écraser un rôle déjà posé (rejeu par le script d'import). Test Task 1.
3. Une mise à jour de thématique qui n'envoie pas `role` ne doit pas l'effacer ; `role: null` doit l'effacer. Test Task 2.
4. Une présence dont la thématique vient du modèle de créneau (rendez-vous sans thématique) porte le rôle de celle-ci. Test Task 3.
5. Un `INTERVENANT` (sans `referentials:write`) ne peut pas changer un rôle. Couvert par la sonde existante de la route de mise à jour des thématiques ; vérifier qu'elle existe, sinon l'ajouter (Task 2).

---

### Task 1: Enum, colonne et préremplissage

**Files:**
- Modify: `back/prisma/schema.prisma` (enum + `Thematic.role`)
- Create: `back/prisma/migrations/20261009130000_thematic_role/migration.sql`
- Test: `back/src/test/e2e/thematique-role-preremplissage.test.ts`

**Interfaces:**
- Produces: `ThematicRole` (enum Prisma, exporté par `generated/client`), `Thematic.role: ThematicRole | null`. Le bloc SQL entre les lignes `-- preremplissage-debut` et `-- preremplissage-fin` de la migration, sans point-virgule final dans le bloc (la Task 5 y ajoute une condition).

- [ ] **Step 1: Schéma**

Dans `schema.prisma`, à côté des autres enums :

```prisma
enum ThematicRole {
  DIAGNOSTIC_EDUCATIF
  REACTUALISATION
  BILAN_DE_FIN
}
```

et dans `model Thematic`, après `pdfNotice` :

```prisma
  // Rôle dans les indicateurs ARS et Activité ; null = aucun.
  role            ThematicRole?
```

- [ ] **Step 2: Migration**

`migration.sql` :

```sql
-- Rôle d'une thématique dans les indicateurs, réglé par le chef de service.
CREATE TYPE "ThematicRole" AS ENUM ('DIAGNOSTIC_EDUCATIF', 'REACTUALISATION', 'BILAN_DE_FIN');
ALTER TABLE "Thematic" ADD COLUMN "role" "ThematicRole";

-- Préremplissage depuis le nom, sans casse ni accents, préfixe toléré ; rejoué par deploy/scripts/import-draxa.py.
-- preremplissage-debut
UPDATE "Thematic" t SET "role" = r.role FROM (
  SELECT id, (CASE
    WHEN k LIKE '%diagnostic educatif%' THEN 'DIAGNOSTIC_EDUCATIF'
    WHEN k ~ '(^|[^a-z])reactu' THEN 'REACTUALISATION'
    WHEN k LIKE '%bilan de sortie%' OR k LIKE '%bilan de fin%' THEN 'BILAN_DE_FIN'
  END)::"ThematicRole" AS role
  FROM (SELECT id, lower(translate(name, 'ÉÈÊËéèêëÀÂàâÎÏîïÔôÙÛÜùûüÇç', 'EEEEeeeeAAaaIIiiOoUUUuuuCc')) AS k FROM "Thematic") n
) r
WHERE t.id = r.id AND t."role" IS NULL AND r.role IS NOT NULL
-- preremplissage-fin
;
```

- [ ] **Step 3: Appliquer à la base de test et régénérer le client**

Run: `cd back && npm run with:dotenv -- -e .env.test.local -e .env.test -- prisma migrate deploy && npx prisma generate`
Expected: « 1 migration applied ».

- [ ] **Step 4: Test du préremplissage**

`thematique-role-preremplissage.test.ts` : lit le bloc entre les deux marqueurs dans le fichier de migration, insère des thématiques, exécute le bloc avec `testDb.$executeRawUnsafe`, vérifie les rôles.

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { testDb, truncateAll } from './setup/db'
import { createEstablishment, createService } from './setup/fixtures'

const migration = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261009130000_thematic_role/migration.sql'),
  'utf8',
)
const bloc = migration.split('-- preremplissage-debut')[1]?.split('-- preremplissage-fin')[0] ?? ''

describe('preremplissage du role des thematiques', () => {
  let serviceId: string
  let establishmentId: string

  beforeAll(async () => {
    await truncateAll()
    establishmentId = (await createEstablishment('E-ROLE')).id
    serviceId = (await createService(establishmentId, 'S-ROLE')).id
  })

  afterAll(async () => {
    await testDb.$disconnect()
  })

  const creer = (name: string, role: 'REACTUALISATION' | null = null) =>
    testDb.thematic.create({ data: { name, serviceId, establishmentId, role } })

  it('reconnait les noms prefixes et laisse les autres sans role', async () => {
    const [de, cepta, reactu, bilan, fin, diet, deja] = await Promise.all([
      creer('SMCP Diagnostic éducatif'),
      creer('Diagnostic Éducatif – Bilan CEPTA'),
      creer('SMCP Réactu 2'),
      creer('Bilan de sortie'),
      creer('Bilan de fin de programme'),
      creer('Diététique'),
      creer('Bilan de sortie bis', 'REACTUALISATION'),
    ])
    expect(bloc).toContain('UPDATE')
    await testDb.$executeRawUnsafe(bloc)

    const role = async (id: string) =>
      (await testDb.thematic.findUniqueOrThrow({ where: { id } })).role
    expect(await role(de.id)).toBe('DIAGNOSTIC_EDUCATIF')
    // Review Focus 1 : le diagnostic l'emporte sur « Bilan ».
    expect(await role(cepta.id)).toBe('DIAGNOSTIC_EDUCATIF')
    expect(await role(reactu.id)).toBe('REACTUALISATION')
    expect(await role(bilan.id)).toBe('BILAN_DE_FIN')
    expect(await role(fin.id)).toBe('BILAN_DE_FIN')
    expect(await role(diet.id)).toBeNull()
    // Review Focus 2 : un rôle déjà posé n'est jamais écrasé.
    expect(await role(deja.id)).toBe('REACTUALISATION')
  })
})
```

Run it. Expected: PASS. Then confirm it detects a broken rule: temporarily change `'%diagnostic educatif%'` to `'%xyz%'` in the migration, re-run the test, see FAIL, restore the line (do not commit the broken version).

- [ ] **Step 5: Commit**

```bash
git add back/prisma back/src/test/e2e/thematique-role-preremplissage.test.ts
git commit -m "feat(thematiques): role dans les indicateurs, colonne et preremplissage"
```

---

### Task 2: API des thématiques

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/thematic.schema.ts`
- Modify: `back/src/main/types/domain/thematic.domain.interface.ts`, `back/src/main/types/infra/orm/repositories/thematic.repository.interface.ts`
- Modify: `back/src/main/infra/orm/repositories/thematic.repository.ts` (`create`, `update`)
- Modify (si besoin) : `back/src/main/domain/thematic.domain.ts` (s'il recopie les champs un à un)
- Test: `back/src/test/e2e/thematique-role.test.ts` ; `back/src/test/e2e/permissions.test.ts` si aucune sonde ne couvre `PATCH /thematic/:id`

**Interfaces:**
- Consumes: `ThematicRole` (Task 1).
- Produces: `role` dans la réponse des thématiques (`ThematicRole | null`) ; `role` optionnel et nullable en création et en mise à jour. Absent = inchangé (mise à jour) ou null (création).

- [ ] **Step 1: Test e2e**

Sur le modèle de `thematique-archivage.test.ts` (même fixtures, un `COORDINATEUR`) :
- `POST /thematic` avec `role: 'BILAN_DE_FIN'` → 201/200, réponse `role: 'BILAN_DE_FIN'` ;
- `PATCH /thematic/:id` avec `{ name: 'Autre nom' }` seul → le rôle reste `BILAN_DE_FIN` (Review Focus 3) ;
- `PATCH` avec `{ role: null }` → `role: null` ;
- `PATCH` avec `{ role: 'INCONNU' }` → 400 ;
- `GET /thematic` → chaque élément porte `role`.

Run it, expect FAIL (champ inconnu ou absent de la réponse).

- [ ] **Step 2: Implémenter**

Schéma Zod (`zod/v4`) :

```ts
const thematicRole = z.enum(['DIAGNOSTIC_EDUCATIF', 'REACTUALISATION', 'BILAN_DE_FIN'])
```

Ajouter `role: thematicRole.optional().nullable()` à `thematicEntity`, à `thematicResponseSchema` et à `updateThematicSchema`. Types domaine et repository : `role?: ThematicRole | null` (import depuis `generated/client`). Repository : `role: thematicCreateParams.role` en création, `role: thematicUpdateParams.role` en mise à jour (Prisma ignore `undefined`, ce qui garde le rôle si le champ est absent).

Vérifier qu'une sonde de `permissions.test.ts` couvre la mise à jour d'une thématique sous `referentials:write` ; sinon en ajouter une (`PATCH /thematic/<FAKE_ID>`, payload `{ role: null }`).

- [ ] **Step 3: Faire passer, lint, typecheck**

Run: le test e2e + `permissions.test.ts` + `thematique-archivage.test.ts` ; `npx biome check --write` sur les fichiers touchés ; `npx tsc --noEmit -p .` filtré sur les fichiers touchés.

- [ ] **Step 4: Commit**

```bash
git add back/src
git commit -m "feat(thematiques): role expose et modifiable par l'API"
```

---

### Task 3: Les indicateurs lisent le rôle

**Files:**
- Modify: `back/src/main/utils/ars-indicators.ts` (supprimer `ARS_THEMATIC_ROLES` et `ThematicRole` local ; `ArsPresence.thematicRole` ; `isRole`)
- Modify: `back/src/main/utils/activity-indicators.ts` (`finalReviews` sur `BILAN_DE_FIN`)
- Modify: `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` (charger le rôle)
- Modify: `back/src/test/unit/utils/ars-indicators.test.ts`, `back/src/test/unit/utils/activity-indicators.test.ts`, `back/src/test/e2e/indicateurs-ars.test.ts`
- Check: `back/src/main/interfaces/http/fastify/schemas/index.ts` (référence à `thematicName` ou à la liste ?)

**Interfaces:**
- Consumes: `ThematicRole` (Task 1).
- Produces: `ArsPresence.thematicRole: ThematicRole | null` ; `isRole(role: ThematicRole, p: ArsPresence): boolean`. `thematicName` reste (libellés de la carte des absences).

- [ ] **Step 1: Adapter les tests d'abord**

Unitaires : les fabriques `presence()` reçoivent `thematicRole: null` par défaut. Chaque fixture qui comptait sur un nom reconnu reçoit le rôle correspondant en plus de son nom : `'Diagnostic éducatif'` et ses variantes → `thematicRole: 'DIAGNOSTIC_EDUCATIF'`, `'Réactu N'` → `'REACTUALISATION'`. Supprimer le `describe` « rôles de thématiques » qui vérifiait la liste de noms. Dans `activity-indicators.test.ts`, le test « compte les diagnostics educatifs et les bilans de fin realises » utilise une présence `thematicRole: 'BILAN_DE_FIN'` pour les bilans et vérifie qu'une `REACTUALISATION` n'est plus comptée comme bilan. Ajouter un test : une présence nommée « SMCP Réactu 1 » avec `thematicRole: 'REACTUALISATION'` rend un programme complet (le nom n'importe plus).

e2e `indicateurs-ars.test.ts`, test `findCohort restitue…` : donner à la thématique du modèle de créneau un `role: 'REACTUALISATION'`, laisser le rendez-vous sans thématique propre, et vérifier `presence.thematicRole === 'REACTUALISATION'` (Review Focus 4).

Run: les trois fichiers. Expected: FAIL (champ inconnu).

- [ ] **Step 2: Implémenter**

`ars-indicators.ts` :

```ts
import type { AppointmentType, ThematicRole } from '../../generated/client'
// …
export type ArsPresence = { /* champs existants */ thematicRole: ThematicRole | null }
export const isRole = (role: ThematicRole, p: ArsPresence): boolean => p.thematicRole === role
```

Remplacer les appels `isRole('diagnosticEducatif', p.thematicName)` par `isRole('DIAGNOSTIC_EDUCATIF', p)` et `isRole('reactualisation', …)` par `isRole('REACTUALISATION', p)`. `activity-indicators.ts` : `educationalDiagnoses` → `'DIAGNOSTIC_EDUCATIF'`, `finalReviews` → `'BILAN_DE_FIN'`.

Repository : sélectionner `thematic: { select: { name: true, role: true } }` aux deux endroits (rendez-vous et modèle de créneau) et poser `thematicRole: ap.appointment.thematic?.role ?? ap.appointment.slot.slotTemplate.thematic?.role ?? null` — attention : la thématique retenue est celle du rendez-vous si elle existe, sinon celle du modèle ; prendre le rôle de **la même** thématique que le nom (si le rendez-vous a une thématique sans rôle, ne pas retomber sur le rôle du modèle). Écrire :

```ts
const thematique = ap.appointment.thematic ?? ap.appointment.slot.slotTemplate.thematic
// …
thematicName: thematique?.name ?? null,
thematicRole: thematique?.role ?? null,
```

- [ ] **Step 3: Faire passer**

Run: les trois fichiers de test + `src/test/e2e/activite.test.ts`. Lint, typecheck filtré.

- [ ] **Step 4: Commit**

```bash
git add back/src
git commit -m "feat(indicateurs): diagnostic, reactualisation et bilan de fin reconnus par le role de la thematique"
```

---

### Task 4: Écran Thématiques et définition

**Files:**
- Create: `front/src/constants/thematic.constant.ts` (si un fichier de constantes thématiques n'existe pas déjà ; sinon l'y ajouter)
- Modify: `front/src/types/thematic.ts`
- Modify: `front/src/components/custom/popup/addThematicForm.tsx`, `front/src/components/custom/popup/editThematicSoignantsForm.tsx`
- Modify: `front/src/columns/thematic.column.tsx`
- Modify: `front/src/constants/activity.constant.ts` (définition « Bilans de fin »)
- Test: un test Vitest du formulaire de modification (colocalisé, ex. `editThematicSoignantsForm.test.tsx`) ; `front/src/libs/activityCsv.test.ts` reste vert

**Interfaces:**
- Consumes: champ `role` de l'API (Task 2).
- Produces: `THEMATIC_ROLE: Record<'DIAGNOSTIC_EDUCATIF' | 'REACTUALISATION' | 'BILAN_DE_FIN', string>` = `{ DIAGNOSTIC_EDUCATIF: 'Diagnostic éducatif', REACTUALISATION: 'Réactualisation', BILAN_DE_FIN: 'Bilan de fin' }` ; `type ThematicRole = keyof typeof THEMATIC_ROLE`.

- [ ] **Step 1: Test du formulaire**

Monter le formulaire de modification (voir les tests de popups existants pour le harnais : QueryClient, mock de `fetch` sélectif), ouvrir, choisir « Bilan de fin » dans « Rôle dans les indicateurs », enregistrer, et vérifier que le `PATCH` envoyé contient `"role":"BILAN_DE_FIN"` et seulement les champs modifiés. Second cas : choisir « Aucun » sur une thématique qui avait un rôle → `"role":null`. Run, expect FAIL.

- [ ] **Step 2: Implémenter**

- Types : `role?: ThematicRole | null` dans `Thematic`, `CreateThematicParams`, `UpdateThematicParams`.
- Formulaires : un `field.Select` « Rôle dans les indicateurs » avec les options `[{ value: '', label: 'Aucun' }, ...THEMATIC_ROLE en options]` (utiliser `toSelectOptions` de `libs/utils.ts` pour le dictionnaire). Valeur du formulaire : chaîne (`''` = aucun) ; à l'envoi, `''` devient `null`. Dans `buildThematicPatch`, n'ajouter `role` que s'il diffère de `thematic.role ?? null`.
- Colonne : « Rôle », affiche `THEMATIC_ROLE[role]` ou « — ».
- `activity.constant.ts` : remplacer la définition de « Bilans de fin » par exactement « Présences à une thématique marquée « Bilan de fin » dans l'écran Thématiques. »

- [ ] **Step 3: Faire passer**

Run: le test du formulaire, `src/libs/activityCsv.test.ts`, la suite front complète une fois. `npx biome check --write` sur les fichiers touchés, `npx tsc -b`.

- [ ] **Step 4: Commit**

```bash
git add front/src
git commit -m "feat(thematiques): role dans les indicateurs dans l'ecran Thematiques"
```

---

### Task 5: Script d'import Draxa

**Files:**
- Modify: `deploy/scripts/import-draxa.py`

**Interfaces:**
- Consumes: le bloc `-- preremplissage-debut` … `-- preremplissage-fin` de la migration (Task 1).

- [ ] **Step 1: Rejouer le bloc pour le service importé**

Après la création des thématiques (boucle `lookup_or_create("Thematic", …)`), ajouter à `out` le bloc lu dans la migration, borné au service importé :

```python
MIGRATION_ROLE = Path(__file__).resolve().parents[2] / "back/prisma/migrations/20261009130000_thematic_role/migration.sql"


def prefill_thematic_roles():
    bloc = MIGRATION_ROLE.read_text().split("-- preremplissage-debut")[1].split("-- preremplissage-fin")[0]
    return bloc.rstrip() + "\n  AND t.\"serviceId\" = :'svc';"
```

(`from pathlib import Path` si absent ; le bloc se termine par la clause `WHERE …`, sans point-virgule.)

- [ ] **Step 2: Vérifier**

Run: `python3 -c "import importlib.util,sys; s=importlib.util.spec_from_file_location('m','deploy/scripts/import-draxa.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); out=m.prefill_thematic_roles(); assert 'UPDATE \"Thematic\"' in out and out.rstrip().endswith(\"= :'svc';\"), out; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add deploy/scripts/import-draxa.py
git commit -m "feat(import): roles des thematiques preremplis a l'import Draxa"
```

---

### Task 6: Vérification (contrôleur)

- [ ] Suites back et front complètes, merge de main dans le worktree, fusion sur main.
- [ ] Appliquer la migration à la base de dev (`cd back && npm run with:dotenv -- -e .env -e .env.local -- prisma migrate deploy`), puis relever sur l'écran Activité (année 2026) les diagnostics éducatifs, terminés et bilans de fin, et sur l'écran ARS les indicateurs 1.1 et 4.x ; comparer aux valeurs d'avant (1 DE, 2 terminés).

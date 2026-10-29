# Notifications, étape 3 (e-mails) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** envoyer les notifications par e-mail, sans données de santé, dès l'événement ou en résumé quotidien à 7 h, selon une colonne « E-mail » des préférences — aucun e-mail par défaut.

**Architecture :** chaque `Notification` porte un état d'e-mail (`PENDING`/`SENT`/`SKIPPED`). Une tâche planifiée d'une minute (`NotificationMailer.runOnce`, `runAsSystem`) lit les `PENDING`, applique les préférences du destinataire (`mail`, `digest`, services), envoie par le `Mailer` existant et marque l'état. Les gabarits sont des fonctions pures qui ne reçoivent jamais de donnée de santé.

**Tech Stack :** Fastify + Prisma + Zod v4 (Jest), nodemailer via `Mailer` existant, React 19 + TanStack Query + Radix (Vitest). Biome.

**Spec :** `docs/superpowers/specs/2026-10-29-notifications-etape-3-design.md`. Handoff 15b : `docs/superpowers/specs/handoffs/notifications-15/`.

## Global Constraints

- **Aucune donnée de santé dans un e-mail** : jamais de nom de patient, de thématique, de texte de tâche. Les gabarits ne reçoivent que des dates, une salle, un compte, un nom de collègue (mention), et le lien `FRONT_URL`.
- **Aucun e-mail par défaut** : `DEFAULT_PREFS = { level: 'custom', services: null, app: tout à true, mail: tout à false, reminderDelay: 'eve', digest: 'now' }`. Une préférence enregistrée sans `mail` → `mail` tout à `false` et `level: 'custom'`.
- Presets : Tout → `app` et `mail` tout à `true` ; Essentiel → `app` tout à `true`, `mail` à `true` pour `reminder`, `moved`, `mention` seulement ; modifier une case (app ou mail) → `custom`.
- Résumé : à partir de 7:00 Europe/Paris, notifications `PENDING` créées avant 7:00 ce jour-là, non lues ; les lues → `SKIPPED`. `REMINDER` toujours envoyé tout de suite.
- Dates des e-mails « jeu. 22/10 à 09:00 » à partir des heures stockées (heure de Paris écrite en UTC : afficher en `timeZone: 'UTC'`, ne jamais reconvertir).
- `Mailer.send(kind, mail)` : `kind` = `notification` ou `notification-digest` ; jamais de contenu au journal.
- Biome seulement, jamais `biome-ignore` ; commentaires d'une ligne ou rien, en français.
- Textes 15b : Tout « Toutes les notifications, dans l'app et par e-mail. » ; Essentiel « Tout dans l'app ; par e-mail, seulement les rappels, les RDV modifiés et les mentions. » ; « Dès l'événement » / « Un e-mail par notification. » ; « Résumé quotidien à 7 h » / « Un seul e-mail par jour. Les rappels restent envoyés à l'heure. » ; « À {email}, sans données de santé : un lien ouvre MediSync. »

### Exécution des tests

- Toujours au premier plan, timeout explicite ; jamais `run_in_background`.
- Back unitaires : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit > /private/tmp/claude-501/u.log 2>&1; grep -E "Tests:|Suites:|FAIL" /private/tmp/claude-501/u.log`
- Back e2e (toutes les suites, ~5 min) : `cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand --forceExit -c src/test/jest.config.ts --selectProjects e2e > /private/tmp/claude-501/e.log 2>&1; grep -E "^(PASS|FAIL)|Tests:|●" /private/tmp/claude-501/e.log | grep -v "● Console" | head -60`
- Front : `cd front && npx vitest run <chemins>` ; `npx tsc --noEmit -p tsconfig.app.json` (le `tsc` nu du front ne vérifie rien).
- Bases : `back/.env` → `medisync_notifs`, `back/.env.test.local` → `medisync_test_notifs`.
- Les tests e2e qui créent des séances futures utilisent `futur()` (`back/src/test/e2e/setup/dates.ts`), jamais une date figée comparée à l'horloge réelle.

## Review Focus

1. **Une donnée de santé qui fuit dans un e-mail** par un champ de payload ajouté plus tard : les gabarits ne doivent lire que des champs nommés autorisés. Test : Task 2, chaque type rendu avec un payload qui porte patient, thématique et texte.
2. **Comptes existants au déploiement** : aucun e-mail, et l'écran les montre en Personnalisé. Test : Task 1 (`normalizePrefs` d'une préférence de l'étape 2) et Task 3 (aucune préférence → aucun e-mail).
3. **Historique** : les notifications créées avant la migration ne partent jamais. Test : Task 3.
4. **Passages répétés chaque minute** : aucun e-mail en double. Test : Task 3, `runOnce` deux fois.
5. **Résumé** : un seul e-mail même si `runOnce` tourne à 7:00, 7:01, 7:02. Test : Task 3.

---

### Task 1 : État d'e-mail et préférences `mail` / `digest`

**Files :**
- Modify : `back/prisma/schema.prisma` ; migration `back/prisma/migrations/20261029100000_notifications_mail/migration.sql`
- Modify : `back/src/main/utils/notification-prefs.ts`, `back/src/test/unit/utils/notification-prefs.test.ts`
- Modify : `back/src/main/interfaces/http/fastify/schemas/notification-prefs.schema.ts`, `back/src/test/e2e/notification-prefs.test.ts`
- Modify : `front/src/types/notificationPrefs.ts` (types seulement ; l'écran est en Task 4)

**Interfaces :**
- Produces : enum Prisma `NotificationMailState { PENDING SENT SKIPPED }`, `Notification.mailState @default(PENDING)` + `@@index([mailState, createdAt])` ; `NotificationPrefs` gagne `mail: Record<NotificationPrefKey, boolean>` et `digest: 'now' | 'daily'` ; `DEFAULT_PREFS` (Global Constraints) ; `mailAllows(prefs, type, serviceId): boolean` ; `presetMail(level: 'all' | 'essential'): Record<NotificationPrefKey, boolean>`.

- [ ] **Step 1 : Tests (échouent)**

Unitaires `notification-prefs.test.ts` — remplacer les attentes de défaut de l'étape 2 et ajouter :

```ts
it('aucun e-mail par defaut, niveau personnalise', () => {
  expect(DEFAULT_PREFS).toMatchObject({ level: 'custom', digest: 'now' })
  expect(Object.values(DEFAULT_PREFS.mail).some(Boolean)).toBe(false)
  expect(Object.values(DEFAULT_PREFS.app).every(Boolean)).toBe(true)
})

it('une preference de l etape 2 (sans mail) passe en personnalise sans e-mail', () => {
  const p = normalizePrefs({ level: 'essential', services: null, reminderDelay: '1h', app: { absent: false } })
  expect(p.level).toBe('custom')
  expect(Object.values(p.mail).some(Boolean)).toBe(false)
  expect(p.app.absent).toBe(false)
  expect(p.reminderDelay).toBe('1h')
})

it('garde le niveau quand mail est present', () => {
  const p = normalizePrefs({ level: 'essential', mail: presetMail('essential'), digest: 'daily' })
  expect(p.level).toBe('essential')
  expect(p.digest).toBe('daily')
})

it('presets e-mail', () => {
  expect(Object.values(presetMail('all')).every(Boolean)).toBe(true)
  const e = presetMail('essential')
  expect(Object.entries(e).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['mention', 'moved', 'reminder'])
})

it('mailAllows : case e-mail et services', () => {
  const p = normalizePrefs({ level: 'custom', mail: { ...presetMail('essential') }, services: ['s1'] })
  expect(mailAllows(p, 'REMINDER', 's1')).toBe(true)
  expect(mailAllows(p, 'APPOINTMENT_CANCELLED', 's1')).toBe(true)
  expect(mailAllows(p, 'ABSENT', 's1')).toBe(false)
  expect(mailAllows(p, 'REMINDER', 's2')).toBe(false)
  expect(mailAllows(DEFAULT_PREFS, 'MENTION', 's1')).toBe(false)
})
```

E2E `notification-prefs.test.ts` : le GET d'un compte neuf rend `level: 'custom'`, `mail` tout à `false`, `digest: 'now'` ; le PUT accepte et relit `mail` et `digest` ; `digest: 'weekly'` → 400.

- [ ] **Step 2 : Implémentation**

`notification-prefs.ts` : ajouter `mail` et `digest` au type ; `allOff()` ; `presetMail(level)` ; `DEFAULT_PREFS` ; dans `normalizePrefs`, `const hasMail = r.mail && typeof r.mail === 'object'` → si absent, `mail = allOff()` et `level = 'custom'`, sinon booléens connus seulement (défaut `false`) ; `digest = pick(r.digest, ['now', 'daily'], 'now')` ; `mailAllows` = `prefs.mail[PREF_KEY_OF_TYPE[type]] && (prefs.services === null || prefs.services.includes(serviceId))` (même règle que `allows`, la liste périmée est déjà neutralisée par `withLiveServices` en amont). Schéma Zod : `mail` (objet des neuf booléens) et `digest: z.enum(['now', 'daily'])`. Front `types/notificationPrefs.ts` : mêmes champs.

Schéma Prisma et migration : `prisma migrate dev --create-only --name notifications_mail` (ou `prisma migrate diff` contre une base jetable si `migrate dev` refuse en non interactif), dossier renommé `20261029100000_notifications_mail`, puis ajouter à la fin du SQL : `UPDATE "Notification" SET "mailState" = 'SKIPPED';` (attention : la valeur d'enum est ajoutée par `CREATE TYPE` dans la même migration, c'est permis ; seul `ALTER TYPE … ADD VALUE` l'interdit). `npm run prisma:generate`, migrations appliquées aux deux bases.

Mettre à jour les tests de l'étape 2 qui attendaient `level: 'essential'` par défaut (`grep -rn "'essential'" back/src/test front/src`), sans changer leur intention.

- [ ] **Step 3 : Vérifier, commit**

Unit + e2e back verts, `tsc` back propre, front `tsc -p tsconfig.app.json` propre (l'écran compile encore : `mail`/`digest` y sont ignorés jusqu'à la Task 4 ; si le type l'empêche, compléter minimalement `allOn`/presets du composant).

```bash
git commit -m "feat(notifications): etat d'e-mail et preferences mail, aucun e-mail par defaut"
```

---

### Task 2 : Gabarits d'e-mail sans données de santé

**Files :**
- Create : `back/src/main/infra/mail/notification-templates.ts`
- Create : `back/src/test/unit/infra/notification-templates.test.ts`

**Interfaces :**
- Consumes : `layout`/`escapeHtml` de `infra/mail/templates.ts` (les exporter si besoin), `NotificationType`.
- Produces :
  ```ts
  type MailableNotification = { type: NotificationType; payload: Record<string, unknown> }
  notificationLine(n: MailableNotification): string                 // phrase sans donnée de santé
  notificationSubject(type: NotificationType): string
  notificationMail(to: string, n: MailableNotification, frontUrl: string): Mail
  digestMail(to: string, items: MailableNotification[], day: Date, frontUrl: string): Mail
  ```

- [ ] **Step 1 : Tests (échouent)**

Pour chaque type, un payload **qui porte** `patientName: 'DUBOIS Marie'`, `patients: [{ name: 'DUBOIS Marie' }]`, `thematicName: 'Diagnostic éducatif cardio'`, `text: 'Rappeler DUBOIS Marie'`, plus les champs utiles (`startDate`, `locationName: 'Bureau 2'`, `before`/`after`, `count`, `firstStartDate`, `entryDate`, `actorName`…). Assertions :

```ts
it.each(TYPES)('%s : aucune donnee de sante, ni dans le texte ni dans le HTML', (type) => {
  const mail = notificationMail('a@t.fr', { type, payload: payloadPiege }, 'https://medisync.test')
  for (const part of [mail.subject, mail.text, mail.html]) {
    expect(part).not.toContain('DUBOIS')
    expect(part).not.toContain('Marie')
    expect(part).not.toContain('Diagnostic éducatif cardio')
    expect(part).not.toContain('Rappeler')
  }
  expect(mail.text).toContain('https://medisync.test')
})
```

Plus une phrase attendue par type (table de la spec), dates en heure stockée (`'2026-10-22T09:00:00.000Z'` → « jeu. 22/10 à 09:00 »), salle présente seulement si `locationName`, et un test du résumé (une ligne par notification, objet « MediSync : vos notifications du jeu. 22/10 »). `DIAGNOSTIC_DUE` affiche la date d'entrée (`entryDate` en `YYYY-MM-DD`), `MENTION` le nom du collègue : la Task 3 fournit `actorName` (prénom nom) au gabarit, le payload `MENTION` ne porte que `authorId`.

- [ ] **Step 2 : Implémentation**

Fonctions pures. Chaque phrase **ne lit que** des champs nommés : `startDate`, `locationName`, `before.startDate`, `after.startDate`, `before.locationName`, `after.locationName`, `count`, `firstStartDate`, `entryDate`, `actorName`. Aucune lecture générique du payload (pas d'interpolation d'objet, pas de `JSON.stringify`). Dates : `Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' })` + heure `HH:mm` en UTC (l'heure stockée est déjà l'heure de Paris). HTML échappé. Bouton « Ouvrir MediSync », pied « Vous recevez cet e-mail selon vos préférences de notification. »

- [ ] **Step 3 : Vérifier, commit**

```bash
git commit -m "feat(notifications): gabarits d'e-mail sans donnees de sante"
```

---

### Task 3 : Tâche d'envoi

**Files :**
- Create : `back/src/main/services/notification.mailer.ts` (+ interface dans `types/`), `back/src/main/infra/orm/repositories/notification-mail.repository.ts` (+ interface)
- Modify : `back/src/main/application/starter.ts`, IoC, `back/src/test/unit/infra/runAsSystem-unicite.test.ts`
- Create : `back/src/test/e2e/notifications-mails.test.ts`

**Interfaces :**
- Consumes : Task 1 (`mailState`, `normalizePrefs`, `withLiveServices`, `mailAllows`), Task 2 (`notificationMail`, `digestMail`), `mailer.send`, `config.frontUrl`.
- Produces : `NotificationMailer.runOnce(now: Date): Promise<{ sent: number; skipped: number; digests: number }>`.

- [ ] **Step 1 : Test e2e (échoue)**

Faux transport comme `emails.test.ts` : `jest.spyOn(t.instances.mailer, 'send').mockImplementation((kind, mail) => { sent.push({ kind, mail }) })`. Les notifications sont créées directement en base (`testDb.notification.create`, avec `establishmentId`, `serviceId`, `userId`, `type`, `payload`, `createdAt`), destinataires créés avec `createUser`. `runOnce` est appelé sous `t.instances.tenantContext.runAsSystem(async () => …)` avec une date fixe. Cas :

- compte sans préférence → aucun e-mail, notification `SKIPPED` ;
- Essentiel + `digest: 'now'` : `REMINDER` et `MENTION` envoyés (`kind: 'notification'`, `to` = e-mail du compte), `ABSENT` non → `SKIPPED` ; états `SENT` ;
- `mail` coupé ou service non suivi → `SKIPPED` ;
- second `runOnce` : `sent` inchangé ;
- notification créée puis passée à `SKIPPED` (simulant la migration) : jamais envoyée ;
- `digest: 'daily'` : `runOnce(06:59 Paris)` → rien sauf un `REMINDER` (envoyé tout de suite) ; `runOnce(07:00)`, `runOnce(07:01)` → **un seul** e-mail `notification-digest` listant les notifications non lues créées avant 7:00 ; une notification lue (`readAt` posé) → absente du résumé et `SKIPPED` ; une notification créée à 07:30 → attend (`PENDING`) ;
- compte désactivé → `SKIPPED` ;
- contenu : aucun e-mail envoyé ne contient le nom de patient ni la thématique du payload (rappel du test unitaire, sur des envois réels) ;
- `MENTION` : le nom de l'auteur (prénom nom du compte `authorId`) figure dans l'e-mail.

Heures de Paris en UTC dans les fixtures (fin octobre/novembre = UTC+1 : 07:00 Paris = 06:00Z).

- [ ] **Step 2 : Dépôt (hors tenant)**

Sous `runAsSystem`, bornes explicites :
- `pending(since: Date)` : notifications `mailState: PENDING`, `createdAt >= since`, avec `userId`, `type`, `payload`, `serviceId`, `readAt`, `createdAt` ;
- `expireOlderThan(date)` : `PENDING` plus vieilles → `SKIPPED` ;
- `recipients(userIds)` : `User` `id`, `email`, `firstName`, `lastName`, `deactivatedAt`, `notificationPrefs` ; préférences normalisées puis `withLiveServices` avec les services réels de chaque compte (même lecture que `UserRepository.findNotificationPrefsMany`, la réutiliser si possible) ;
- `names(userIds)` : prénom nom des auteurs de mention ;
- `mark(ids, state)` : `updateMany`.

- [ ] **Step 3 : Service**

`runOnce(now)` : `expireOlderThan(now − 30 j)` ; `pending(now − 30 j)` ; destinataires ; pour chaque notification : désactivé ou `!mailAllows(prefs, type, serviceId)` → `SKIPPED` ; `digest === 'now'` ou `type === 'REMINDER'` → `mailer.send('notification', notificationMail(email, { type, payload: avecActorName }, frontUrl))`, `SENT` ; sinon résumé. Résumé : si heure Paris ≥ 7:00, seuil = aujourd'hui 07:00 Paris (instant réel) ; par destinataire, ses `PENDING` `daily` créées avant le seuil : lues → `SKIPPED`, le reste → un `digestMail` puis `SENT`. Chaque destinataire dans son propre `try/catch` (journal : étape + classe d'erreur). Marquer l'état **après** `mailer.send` (qui ne lève pas : mise en file).

- [ ] **Step 4 : Démarrage**

`scheduleNotificationMails` dans `starter.ts`, sur le modèle de `scheduleNotifications` : `setInterval` 60 000 ms, `unref()`, `runAsSystem`, log « Notification mails: {sent} envoyés, {digests} résumés, {skipped} ignorés » et erreurs par classe. Déclarer le site dans `runAsSystem-unicite.test.ts` (même entrée `application/starter.ts`, compte d'appels et prose).

- [ ] **Step 5 : Vérifier, commit**

```bash
git commit -m "feat(notifications): envoi des e-mails et resume quotidien"
```

---

### Task 4 : Front, colonne E-mail et envoi des e-mails

**Files :**
- Modify : `front/src/components/settings/notificationPrefs.tsx`, `notificationPrefs.test.tsx`

**Interfaces :**
- Consumes : Task 1 (types `mail`, `digest`), `useAuthStore` (`user.email`).

- [ ] **Step 1 : Tests (échouent)**

- GET au défaut (`level: 'custom'`, `mail` tout à `false`) : la carte Personnalisé est active, aucun interrupteur E-mail coché ;
- clic Tout → PUT `mail` tout à `true`, `app` tout à `true`, `level: 'all'` ;
- clic Essentiel → PUT `mail` à `true` pour `reminder`, `moved`, `mention` seulement ;
- interrupteur E-mail d'une ligne → PUT `level: 'custom'` et la case changée ;
- carte « Résumé quotidien à 7 h » → PUT `digest: 'daily'`, sans changer le niveau ;
- la phrase « À {email}, sans données de santé : un lien ouvre MediSync. » affiche l'e-mail du compte.

- [ ] **Step 2 : Implémentation**

Grille à deux colonnes (`minmax(0,1fr) 110px 110px`) avec en-têtes **Dans l'app** (`Bell`) et **E-mail** (`Mail`), un `Switch` par case (`aria-label` « {libellé} dans l'app » / « {libellé} par e-mail ») ; `setLevel` : Tout → `app` et `mail` tout à `true` ; Essentiel → `app` tout à `true`, `mail` = preset Essentiel ; Personnalisé → inchangé. Descriptions des niveaux de 15b (Global Constraints). Bloc « Envoi des e-mails » (`border-t pt-4`) : phrase avec l'e-mail, deux cartes radio (même composant que les niveaux). Garder la logique d'enregistrement existante (`save`, `lastConfirmed`, services vivants).

- [ ] **Step 3 : Vérifier, commit**

`npx vitest run` complet, `npx tsc --noEmit -p tsconfig.app.json`, Biome.

```bash
git commit -m "feat(front): colonne E-mail et envoi des e-mails dans les preferences"
```

---

### Task 5 : Vérification et merge

- [ ] Suites complètes back (unit + e2e) et front.
- [ ] Merger `main` dans la branche s'il a avancé ; merge `--no-ff` sur `main` ; `npm run prisma:generate` et `npx prisma migrate deploy` dans le checkout principal ; vérifier que le back de dev a bien redémarré **après** la migration.
- [ ] Navigateur (4270) : préférences (colonne E-mail, niveaux, résumé) ; régler Essentiel sur le compte de dev, déclencher une mention, vérifier l'e-mail dans Mailpit (http://localhost:8027) : aucune donnée de santé, lien vers MediSync. Remettre les préférences au défaut.
- [ ] `graphify update .`.

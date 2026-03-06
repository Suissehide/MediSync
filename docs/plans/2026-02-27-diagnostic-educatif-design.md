# Diagnostic Educatif — Design

## Contexte

Chaque patient peut avoir plusieurs "Diagnostics Educatifs" (DE), des formulaires structurés en sections et sous-champs utilisés dans le cadre de l'ETP. Les champs sont fixes et définis dans le code. Pour accélérer la création, des templates admin définissent une configuration active/inactive par défaut.

---

## Modèle de données

### `DiagnosticEducatifTemplate`
Géré par les admins uniquement.

```prisma
model DiagnosticEducatifTemplate {
  id           String   @id @default(cuid())
  name         String
  activeFields String[] // clés des champs actifs par défaut

  diagnostics DiagnosticEducatif[]
}
```

### `DiagnosticEducatif`
Un patient peut en avoir plusieurs.

```prisma
model DiagnosticEducatif {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now())
  title        String?
  activeFields String[] // clés des champs visibles (modifiable par soignant)

  patientId  String
  templateId String?

  patient  Patient                       @relation(fields: [patientId], references: [id], onDelete: Cascade)
  template DiagnosticEducatifTemplate?   @relation(fields: [templateId], references: [id])

  // Une colonne nullable par champ fixe :
  // (à compléter selon la liste définitive des sections/champs)
}
```

### Constant TypeScript partagé

Source de vérité unique pour les sections et champs. Utilisé par le backend (validation) et le frontend (rendu).

```ts
// constants/diagnosticEducatif.constant.ts
export const DIAGNOSTIC_SECTIONS = [
  {
    id: "section_id",
    label: "Nom de la section",
    fields: [
      { id: "section_id.champ_id", label: "Nom du champ", type: "string" | "boolean" | ... },
    ],
  },
]
```

**Logique `activeFields`** : le `DiagnosticEducatif.activeFields` est copié depuis `DiagnosticEducatifTemplate.activeFields` à la création, puis modifiable librement par le soignant. Les champs inactifs sont masqués en view mode.

---

## Backend

Pattern : routes → domain → repository, identique aux entités existantes.

### Nouvelles entités

- `diagnosticEducatif` — CRUD des diagnostics d'un patient
- `diagnosticEducatifTemplate` — CRUD des templates (admin)

### Routes

```
# Diagnostics (soignant)
GET    /patients/:patientId/diagnostics
POST   /patients/:patientId/diagnostics
GET    /patients/:patientId/diagnostics/:id
PATCH  /patients/:patientId/diagnostics/:id
DELETE /patients/:patientId/diagnostics/:id

# Templates (admin)
GET    /diagnostic-templates
POST   /diagnostic-templates
GET    /diagnostic-templates/:id
PATCH  /diagnostic-templates/:id
DELETE /diagnostic-templates/:id
```

### Logique métier

- `POST /diagnostics` — si `templateId` fourni, copie `activeFields` du template dans le nouveau diagnostic
- `PATCH /diagnostics/:id` — met à jour `activeFields` (toggles soignant) et/ou les valeurs des champs

---

## Frontend

### Gestion admin des templates

Nouvelle page `/settings/diagnostic-template` dans les settings admin. L'admin peut créer, éditer et supprimer des templates. L'édition présente toutes les sections/champs avec des toggles pour configurer `activeFields`.

### Vue patient

Le bouton `BriefcaseMedical` existant dans la sidebar patient devient le point d'entrée vers un nouveau menu item "Diagnostic éducatif" qui charge `DiagnosticPatient`.

### Flux soignant

```
DiagnosticPatient
├── DiagnosticSidebar          ← liste des diagnostics (date, titre, template)
│     └── sélection → affiche le contenu principal
└── Contenu principal
      ├── [aucun sélectionné]  ← bouton "Nouveau diagnostic"
      │     └── modal : choisir template + titre → crée + ouvre en edit
      ├── DiagnosticView       ← lecture seule, champs actifs uniquement
      │     └── bouton "Modifier" → bascule en edit
      └── DiagnosticForm       ← édition : toggle actif/inactif + inputs par type
```

### Composants

| Composant | Rôle |
|---|---|
| `DiagnosticSidebar` | Liste des DE du patient, sélection active |
| `DiagnosticPatient` | Container principal (sidebar + contenu) |
| `DiagnosticView` | Lecture seule — sections et champs actifs uniquement |
| `DiagnosticForm` | Édition — tous les champs avec toggle + input selon type |
| `DiagnosticTemplateSettings` | Page admin de gestion des templates |

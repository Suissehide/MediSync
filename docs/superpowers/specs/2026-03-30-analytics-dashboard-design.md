# Analytics Dashboard — Vue d'ensemble patients

**Date:** 2026-03-30

## Objectif

Créer une page dédiée `/stats` offrant une vue d'ensemble centrée sur les patients : patients actifs, taux de présence, répartition des parcours. Toutes les métriques sont filtrables par période via un date range picker.

---

## Architecture

### Nouvelle route frontend
- `/_authenticated/stats` — accessible depuis la navbar
- Filtrée par soignant sélectionné (même logique que le dashboard existant)

### Nouveaux endpoints backend
| Endpoint | Description |
|----------|-------------|
| `GET /analytics/patients/overview?soignantId=&startDate=&endDate=` | KPIs globaux |
| `GET /analytics/pathways/distribution?soignantId=&startDate=&endDate=` | Répartition des parcours par statut |
| `GET /analytics/attendance/by-program?soignantId=&startDate=&endDate=` | Taux de présence par `programType` |

Tous les endpoints reçoivent `startDate` et `endDate` en ISO 8601 (query params). Par défaut côté frontend : 30 derniers jours.

### Librairie graphique
Recharts — à ajouter au projet (`recharts`). Compatible React, léger, pas de dépendance supplémentaire sur MUI.

---

## Composants frontend

### Sélecteur de période
- `DateRangePicker` de MUI (déjà disponible)
- Placé en haut de la page, appliqué à toutes les requêtes simultanément
- Valeur par défaut : `[today - 30j, today]`
- Déclenche un refetch de tous les endpoints au changement

### Cartes KPI (4 cartes en ligne)

| Carte | Métrique | Calcul |
|-------|----------|--------|
| Patients actifs | Nb de patients avec un parcours ayant des slots dans la période | Slots dont `startDate` ≤ `endDate_param` ET `endDate` ≥ `startDate_param` |
| Taux de présence | % `AppointmentPatient.status = 'yes'` / total sur la période | Basé sur `Appointment.startDate` dans la période |
| Parcours terminés | Nb de parcours dont tous les slots ont `endDate` < `endDate_param` | — |
| Patients sans présence | Nb de patients sans `status = 'yes'` sur la période | Patients à relancer |

Chaque carte : icône + chiffre principal + sous-titre contextuel + skeleton loader indépendant.

### Graphique 1 — Donut : Répartition des parcours
- Segments : **En cours** (slots futurs restants) / **Terminés** (tous slots passés) / **En attente** (aucun slot démarré)
- Centre du donut : nombre total de parcours
- Légende à droite avec pourcentages
- Source : endpoint `/analytics/pathways/distribution`

### Graphique 2 — Barres : Taux de présence par type de programme
- Axe X : `programType` (`VIVA`, `VIVA_AOMI`)
- Axe Y : % de présence (0–100%)
- Une barre par type, colorée selon la charte de l'app
- Source : endpoint `/analytics/attendance/by-program`

---

## Backend — Logique de calcul

### `/analytics/patients/overview`
```
Patients actifs = COUNT DISTINCT patientId où pathway a au moins un slot dans la période
Taux de présence = COUNT(AppointmentPatient WHERE status='yes' AND appointment.startDate IN période)
                   / COUNT(AppointmentPatient WHERE appointment.startDate IN période) * 100
Parcours terminés = COUNT(Pathway WHERE MAX(slot.endDate) < endDate_param)
Patients sans présence = COUNT DISTINCT patientId WHERE aucun AppointmentPatient status='yes' dans période
```

### `/analytics/pathways/distribution`
Scope : parcours dont au moins un slot chevauche la période (`slot.startDate <= endDate_param AND slot.endDate >= startDate_param`)
```
En cours = Pathway avec au moins un slot.endDate > now()
Terminés = Pathway avec MAX(slot.endDate) <= now()
En attente = Pathway avec MIN(slot.startDate) > now()
```

### `/analytics/attendance/by-program`
```
GROUP BY patient.programType :
  taux = COUNT(status='yes') / COUNT(total) * 100
```

---

## États UI

- **Chargement :** skeleton loader par carte/graphique — indépendants
- **Erreur :** message discret sous l'élément concerné, reste de la page fonctionnel
- **Aucune donnée :** état vide explicite ("Aucune donnée sur cette période")

---

## Fichiers à créer/modifier

### Backend
- `back/src/main/interfaces/http/analytics.controller.ts` — nouveau controller
- `back/src/main/domain/analytics.domain.ts` — logique métier
- `back/src/main/infra/.../analytics.repository.ts` — requêtes Prisma
- Enregistrement du controller dans le conteneur IoC existant

### Frontend
- `front/src/routes/_authenticated/stats.tsx` — nouvelle route
- `front/src/components/custom/Analytics/kpiCard.tsx`
- `front/src/components/custom/Analytics/pathwayDonutChart.tsx`
- `front/src/components/custom/Analytics/attendanceBarChart.tsx`
- `front/src/queries/useAnalytics.ts` — 3 hooks TanStack Query
- `front/src/api/analytics.api.ts` — appels HTTP
- Ajout du lien "Statistiques" dans la navbar

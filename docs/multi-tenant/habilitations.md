# Habilitations MediSync multi-établissement

Document de référence de la grille des rôles et des permissions. Il formalise
qui peut faire quoi dans l'application, par niveau de rattachement. C'est le
document à présenter lors d'un audit (RGPD article 32, référentiels PGSSI-S
sur les habilitations et l'imputabilité).

Statut : cible de la refonte multi-tenant (établissement → services → modèles
de parcours). Voir la spec d'architecture dans `docs/superpowers/specs/`.

## Niveaux de rattachement

Un utilisateur est une identité globale (e-mail unique sur la plateforme). Il
possède zéro, une ou plusieurs appartenances à des établissements, et sous
chacune, zéro, une ou plusieurs appartenances à des services. Chaque
appartenance porte un rôle.

| Niveau | Entité | Rôles possibles |
| --- | --- | --- |
| Plateforme | `User.isSuperAdmin` | Super-admin |
| Établissement | `EstablishmentMembership.role` | `ADMIN`, `MEMBER` |
| Service | `ServiceMembership.role` | `COORDINATEUR`, `INTERVENANT`, `SECRETARIAT`, `LECTURE` |

## Rôles

| Niveau | Rôle | Ce qu'il peut faire |
| --- | --- | --- |
| Plateforme | **Super-admin** | Créer les établissements, nommer leur premier administrateur, consulter la santé globale de la plateforme. Aucun accès aux données patients. |
| Établissement | **Administrateur d'établissement** (`ADMIN`) | Créer et désactiver les services, gérer les lieux et les profils soignants, rattacher les comptes à l'établissement, les affecter aux services avec un rôle, désactiver les comptes, lire le journal d'activité et le journal des accès aux dossiers patients. |
| Établissement | **Membre** (`MEMBER`) | Aucun droit propre : simple rattachement qui permet d'être affecté à des services. |
| Service | **Coordinateur** (`COORDINATEUR`) | Tout ce que fait l'ancien rôle `ADMIN` dans le périmètre du service : modèles de parcours, planning, thématiques, semaines interdites, cycle de planification, modèles de diagnostic, dossiers patients et contenu clinique. |
| Service | **Intervenant** (`INTERVENANT`) | L'équivalent de l'ancien rôle `USER` : agenda, présences, transmissions, dossier patient et diagnostics éducatifs, tâches personnelles. |
| Service | **Secrétariat** (`SECRETARIAT`) | Identité et contact des patients, sous-dossier administratif, prise de rendez-vous, présences, export PDF du programme. Pas d'accès au contenu clinique (diagnostics éducatifs, transmissions, notes). |
| Service | **Lecture seule** (`LECTURE`) | Direction ou cadre : consultation du suivi, du planning et des listes, sans modification ni accès au contenu clinique. |

Un utilisateur peut cumuler des rôles différents dans plusieurs services d'un
même établissement, et appartenir à plusieurs établissements.

## Permissions par rôle de service

Le back n'interroge jamais un rôle directement : chaque route exige une
permission (`requirePermission('patient:write')`), et une matrice statique
associe les permissions aux rôles. C'est cette matrice qui fait foi.

| Permission | Périmètre | Coordinateur | Intervenant | Secrétariat | Lecture |
| --- | --- | :-: | :-: | :-: | :-: |
| `planning:write` | Modèles de parcours et de créneaux, parcours, créneaux, cycle de planification, semaines interdites | ✔ | | | |
| `referentials:write` | Thématiques, modèles de diagnostic éducatif | ✔ | | | |
| `patient:read` | Identité, contact, contexte social, sous-dossier hors champs cliniques, planning individuel, suivi | ✔ | ✔ | ✔ | ✔ |
| `patient:write` | Création et modification de l'identité, du contact, du social et du sous-dossier hors champs cliniques | ✔ | ✔ | ✔ | |
| `clinical:read` | Diagnostics éducatifs, transmissions, notes et détails du sous-dossier | ✔ | ✔ | | |
| `clinical:write` | Idem en écriture | ✔ | ✔ | | |
| `appointment:write` | Rendez-vous, ajout et retrait de patients d'un créneau, présences, motif de refus, accompagnant | ✔ | ✔ | ✔ | |
| `pdf:export` | Export PDF du programme remis au patient | ✔ | ✔ | ✔ | |
| `todo:own` | Ses propres tâches | ✔ | ✔ | ✔ | ✔ |
| `members:read` | Voir les membres du service et leur rôle | ✔ | ✔ | ✔ | ✔ |

Règles associées :

- Les champs cliniques sont filtrés **dans les schémas de réponse du back**
  selon `clinical:read`, pas seulement masqués côté front.
- La mise à jour d'un patient dans un créneau (`AppointmentPatient`) sépare
  les champs de présence (`appointment:write`) des transmissions
  (`clinical:write`).
- Toute lecture d'une fiche patient, d'un diagnostic éducatif ou tout export
  PDF écrit une ligne dans le journal des accès (`PatientAccessLog`) avec
  l'utilisateur, l'établissement, le service et le patient.
- Un compte se désactive (`User.deactivatedAt`), il ne se supprime pas, pour
  conserver l'imputabilité des actions passées dans les journaux.

## Permissions d'établissement et de plateforme

| Permission | Administrateur d'établissement | Super-admin |
| --- | :-: | :-: |
| `services:manage` (créer, renommer, désactiver un service) | ✔ | |
| `locations:manage` | ✔ | |
| `soignants:manage` (profils soignants de l'établissement) | ✔ | |
| `members:manage` (rattacher un compte, affecter aux services, changer les rôles, désactiver) | ✔ | |
| `activity-log:read` (journal d'activité de l'établissement) | ✔ | |
| `access-log:read` (journal des accès aux dossiers patients) | ✔ | |
| `establishments:manage` (créer un établissement, nommer son premier administrateur) | | ✔ |

Le super-admin n'a aucune permission de service ni d'établissement : il ne
voit aucune donnée patient.

## Correspondance avec les anciens rôles

Lors de la migration, l'unique établissement et l'unique service existants
sont créés, et les comptes actuels sont convertis ainsi :

| Ancien rôle global | Appartenance établissement | Appartenance service |
| --- | --- | --- |
| `ADMIN` | `ADMIN` | `COORDINATEUR` |
| `USER` | `MEMBER` | `INTERVENANT` |
| `NONE` (en attente) | aucune | aucune |

Le lien `User.soignantId` actuel devient `EstablishmentMembership.soignantId`.

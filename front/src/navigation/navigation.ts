import { useMatchRoute } from '@tanstack/react-router'

import type { FileRouteTypes } from '@/routeTree.gen.ts'
import type { Permission } from '@/utils/permissions.ts'

// Navigation par echelle (2026-09-28). Voir
// docs/superpowers/specs/2026-09-28-navigation-par-echelle-design.md.
//
// Chaque ecran de section appartient a exactement une echelle : son URL, la permission qui le
// garde et l'onglet qui y mene disent la meme chose. La barre du haut n'affiche que les onglets
// de l'echelle COURANTE, lue sur la ROUTE (jamais sur le store : voir l'invariant de
// `root.layout.tsx`). Cette table est la seule description de la navigation ;
// `navigation.test.ts` verifie que chaque ecran de section de l'arbre y figure, ou figure dans
// `HORS_ONGLETS` avec sa raison — un ecran sans point d'entree ne peut plus passer inapercu.

export type Scale = 'service' | 'establishment' | 'platform'

export type RoutePath = FileRouteTypes['to']

export type NavItem = {
  label: string
  to: RoutePath
  // Absente : visible par tout membre de l'echelle. La plateforme n'en porte aucune : son
  // layout (`super-admin.tsx`) n'admet que le drapeau `isSuperAdmin`, qu'aucune permission de
  // la matrice ne represente.
  permission?: Permission
  // Regroupement par nature du travail : un separateur vertical fin est dessine entre deux
  // groupes consecutifs. Un groupe de `MENU_GROUPS` sort des onglets : il devient un bouton a
  // droite de la barre, dont le menu deroulant presente ses ecrans en sous-categories decalees.
  group: string
  // Une ligne sous l'intitule, dans un menu deroulant : a quoi sert l'ecran.
  description?: string
  // L'onglet reste actif sur les ecrans d'objet qu'il ouvre (la fiche patient sous Patients).
  matchPrefix?: boolean
  // Ecrans d'objet ouverts depuis cet onglet quand un prefixe ne convient pas (celui de
  // `/super-admin` couvrirait aussi Comptes et Journaux).
  activeAlso?: readonly RoutePath[]
}

// Groupes affiches en menu deroulant plutot qu'en onglets : l'administration du service tient sept
// ecrans, qui en onglets satureraient la barre, et releve d'un autre travail que le quotidien.
export const MENU_GROUPS: ReadonlySet<string> = new Set(['Administration'])

export const SCALE_ROOTS = {
  service: '/e/$establishmentId/s/$serviceId',
  establishment: '/e/$establishmentId/admin',
  platform: '/super-admin',
} as const satisfies Record<Scale, RoutePath>

export const NAVIGATION: Record<Scale, readonly NavItem[]> = {
  service: [
    {
      label: 'Dashboard',
      to: '/e/$establishmentId/s/$serviceId/dashboard',
      group: 'Quotidien',
    },
    {
      label: 'Agenda',
      to: '/e/$establishmentId/s/$serviceId/agenda',
      group: 'Quotidien',
    },
    {
      label: 'Patients',
      to: '/e/$establishmentId/s/$serviceId/patient',
      group: 'Quotidien',
      matchPrefix: true,
    },
    {
      label: 'Suivi',
      to: '/e/$establishmentId/s/$serviceId/suivi',
      group: 'Quotidien',
    },
    {
      label: 'Planning',
      to: '/e/$establishmentId/s/$serviceId/planning',
      permission: 'planning:write',
      group: 'Administration',
      description: 'Semaines types et créneaux des parcours',
    },
    {
      label: 'Membres',
      to: '/e/$establishmentId/s/$serviceId/members',
      // La MEME permission que le `beforeLoad` de l'ecran (MDS-17) : un onglet garde autrement
      // mene a une redirection, et l'ecart ne se verrait qu'au clic.
      permission: 'service-members:manage',
      group: 'Administration',
      description: "L'équipe du service : inviter, changer un rôle, retirer",
    },
    {
      label: 'Thématiques',
      to: '/e/$establishmentId/s/$serviceId/thematic',
      permission: 'referentials:write',
      group: 'Administration',
      description: "Ateliers d'éducation et soignants habilités",
    },
    // Propres a chaque service depuis le 2026-09-29 : un soignant est un metier du service, une
    // salle un lieu du service.
    {
      label: 'Soignants',
      to: '/e/$establishmentId/s/$serviceId/soignant',
      permission: 'referentials:write',
      group: 'Administration',
      description: 'Métiers qui interviennent dans le service',
    },
    {
      label: 'Salles',
      to: '/e/$establishmentId/s/$serviceId/location',
      permission: 'referentials:write',
      group: 'Administration',
      description: 'Lieux où se tiennent les séances',
    },
    {
      label: 'Diagnostics éducatifs',
      to: '/e/$establishmentId/s/$serviceId/diagnostic-template',
      permission: 'referentials:write',
      group: 'Administration',
      description: 'Modèles de bilan du service',
    },
    {
      label: "Journal d'activité",
      to: '/e/$establishmentId/s/$serviceId/activity-log',
      permission: 'service-journal:read',
      group: 'Administration',
      description: 'Qui a fait quoi dans le service, et quand',
    },
    {
      label: 'Indicateurs ARS',
      to: '/e/$establishmentId/s/$serviceId/indicateurs-ars',
      permission: 'stats:read',
      group: 'Administration',
      description: "Chiffres agrégés de l'enquête annuelle",
    },
  ],
  establishment: [
    {
      label: 'Résumé',
      to: '/e/$establishmentId/admin',
      group: 'Accès',
    },
    {
      label: 'Services',
      to: '/e/$establishmentId/admin/services',
      permission: 'services:manage',
      group: 'Accès',
    },
    {
      label: 'Membres',
      to: '/e/$establishmentId/admin/members',
      permission: 'members:manage',
      group: 'Accès',
    },
    {
      label: 'Accès temporaires',
      to: '/e/$establishmentId/admin/grants',
      permission: 'members:manage',
      group: 'Accès',
    },
    {
      label: "Journal d'activité",
      to: '/e/$establishmentId/admin/activity-log',
      permission: 'activity-log:read',
      group: 'Traçabilité',
    },
  ],
  platform: [
    {
      label: 'Établissements',
      to: '/super-admin',
      group: '',
      activeAlso: ['/super-admin/$establishmentId'],
    },
    { label: 'Comptes', to: '/super-admin/users', group: '' },
    { label: 'Journaux', to: '/super-admin/access-log', group: '' },
  ],
}

// Ecrans d'OBJET, volontairement sans onglet : on les ouvre depuis un autre ecran. Chaque
// entree dit d'ou. Ajouter un ecran de section ici plutot que dans `NAVIGATION` le rendrait
// introuvable : c'est exactement ce que cette liste doit rester incapable de cacher.
export const HORS_ONGLETS: Readonly<Partial<Record<RoutePath, string>>> = {
  '/e/$establishmentId/s/$serviceId/patient/$patientID':
    'fiche patient, depuis la liste Patients',
  '/e/$establishmentId/s/$serviceId/patient/$patientID/acces':
    'Consultations du dossier, bouton de la fiche patient',
  '/super-admin/$establishmentId':
    "fiche d'établissement, depuis la liste Établissements",
}

export type CurrentScale =
  | { scale: 'service'; establishmentId: string; serviceId: string }
  | { scale: 'establishment'; establishmentId: string }
  | { scale: 'platform' }

// L'echelle de la route courante, avec ses parametres. `null` hors des trois arbres
// (`/user/settings`, `/choose-context`…) : aucune barre d'onglets, meme si le store porte encore
// le dernier service visite.
export const useCurrentScale = (): CurrentScale | null => {
  const matchRoute = useMatchRoute()
  const service = matchRoute({ to: SCALE_ROOTS.service, fuzzy: true })
  if (service) {
    return {
      scale: 'service',
      establishmentId: service.establishmentId,
      serviceId: service.serviceId,
    }
  }
  const establishment = matchRoute({
    to: SCALE_ROOTS.establishment,
    fuzzy: true,
  })
  if (establishment) {
    return {
      scale: 'establishment',
      establishmentId: establishment.establishmentId,
    }
  }
  if (matchRoute({ to: SCALE_ROOTS.platform, fuzzy: true })) {
    return { scale: 'platform' }
  }
  return null
}

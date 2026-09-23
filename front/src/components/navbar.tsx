import { Link, useMatchRoute, useRouter } from '@tanstack/react-router'
import {
  Activity,
  BriefcaseMedical,
  CalendarDays,
  Cog,
  DoorOpen,
  PanelLeft,
  Tag,
  UserCog,
  Users,
} from 'lucide-react'

import { useCan } from '../hooks/useCan.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { TenantSelector } from './custom/tenantSelector.tsx'
import TodoSheet from './custom/todo/todoSheet.tsx'
import { Button } from './ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverTrigger,
} from './ui/popover.tsx'

interface NavbarProps {
  toggleSidebar: () => void
}

// Chaque entrée du menu est gardée par la permission que son écran exige
// réellement côté back, pas par une permission globale : Planning et
// Diagnostics éducatifs sont de niveau service (coordinateur), les autres de
// niveau établissement (administrateur d'établissement). Un même compte peut
// détenir l'une sans l'autre.
interface SettingsMenuProps {
  establishmentId: string
  // Nul sur un écran d'administration sans service (administrateur sans
  // affectation, voir `admin.tsx`) : les cinq écrans qui vivent sous
  // /e/:establishmentId/s/:serviceId n'ont alors pas de destination valable
  // et restent masqués. Seul Membres, sous /e/:establishmentId/admin/members
  // (layout d'établissement, tâche 8), reste accessible dans ce cas.
  serviceId: string | null
  canPlanning: boolean
  canManageSoignants: boolean
  canManageReferentials: boolean
  canManageLocations: boolean
  canManageMembers: boolean
  canReadActivityLog: boolean
}

const SettingsMenu = ({
  establishmentId,
  serviceId,
  canPlanning,
  canManageSoignants,
  canManageReferentials,
  canManageLocations,
  canManageMembers,
  canReadActivityLog,
}: SettingsMenuProps) => {
  const router = useRouter()
  // Les six écrans de réglages de service vivent désormais sous
  // /e/:establishmentId/s/:serviceId : la navigation prend les mêmes
  // paramètres que les onglets Dashboard/Agenda/Patients/Suivi. Membres vit
  // sous /e/:establishmentId/admin/members (layout d'établissement, tâche 8),
  // sans paramètre de service. `serviceParams` reste nul sans service en
  // contexte ; chaque entrée qui en a besoin se garde donc par lui, pas
  // seulement par sa permission.
  const serviceParams = serviceId === null ? null : { establishmentId, serviceId }

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button variant="none" size="icon">
          <Cog className="text-text w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent sideOffset={2} align="end">
        {serviceParams && canPlanning && (
          <PopoverMenuItem
            icon={<CalendarDays className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/planning',
                params: serviceParams,
              })
            }
          >
            Planning
          </PopoverMenuItem>
        )}
        {serviceParams && canManageSoignants && (
          <PopoverMenuItem
            icon={<Users className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/soignant',
                params: serviceParams,
              })
            }
          >
            Soignants
          </PopoverMenuItem>
        )}
        {serviceParams && canManageReferentials && (
          <PopoverMenuItem
            icon={<Tag className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/thematic',
                params: serviceParams,
              })
            }
          >
            Thématiques
          </PopoverMenuItem>
        )}
        {serviceParams && canManageLocations && (
          <PopoverMenuItem
            icon={<DoorOpen className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/location',
                params: serviceParams,
              })
            }
          >
            Salles
          </PopoverMenuItem>
        )}
        {serviceParams && canManageReferentials && (
          <PopoverMenuItem
            icon={<BriefcaseMedical className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/diagnostic-template',
                params: serviceParams,
              })
            }
          >
            Diagnostics éducatifs
          </PopoverMenuItem>
        )}
        {canManageMembers && (
          <PopoverMenuItem
            icon={<UserCog className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/admin/members',
                params: { establishmentId },
              })
            }
          >
            Membres
          </PopoverMenuItem>
        )}
        {serviceParams && canReadActivityLog && (
          <PopoverMenuItem
            icon={<Activity className="w-4 h-4" />}
            onClick={() =>
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/activity-log',
                params: serviceParams,
              })
            }
          >
            Activité
          </PopoverMenuItem>
        )}
      </PopoverContent>
    </PopoverRoot>
  )
}

function Navbar({ toggleSidebar }: NavbarProps) {
  const canPlanning = useCan('planning:write')
  const canManageSoignants = useCan('soignants:manage')
  const canManageReferentials = useCan('referentials:write')
  const canManageLocations = useCan('locations:manage')
  const canManageMembers = useCan('members:manage')
  const canReadActivityLog = useCan('activity-log:read')
  const hasSettingsAccess =
    canPlanning ||
    canManageSoignants ||
    canManageReferentials ||
    canManageLocations ||
    canManageMembers ||
    canReadActivityLog
  const matchRoute = useMatchRoute()
  const isActive = (to: string) => !!matchRoute({ to, fuzzy: false })
  // Les onglets Dashboard/Agenda/Patients/Suivi vivent sous
  // /e/:establishmentId/s/:serviceId depuis l'etape 2 (tache 6) : le
  // contexte vient du store, pose par le layout de service avant que ces
  // ecrans ne puissent se rendre. Sans contexte de service (ecrans
  // d'administration atteints par un role sans affectation de service), les
  // onglets n'ont pas de destination valable et sont masques.
  const context = useAuthStore((state) => state.context)

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 h-16 flex justify-between items-center bg-foreground text-text border-b border-border-sidebar">
      <div className="flex items-center gap-4">
        <div className="flex justify-between items-center w-60">
          <h2 className="px-2 text-3xl font-bold">
            <span className="text-primary">Medi</span>Sync
          </h2>
          <Button
            variant="none"
            size="icon"
            onClick={toggleSidebar}
            className="cursor-pointer text-text"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
          <TenantSelector />
        </div>

        {context?.serviceId && (
          <div className="flex gap-4">
            <Link
              to="/e/$establishmentId/s/$serviceId/dashboard"
              params={{
                establishmentId: context.establishmentId,
                serviceId: context.serviceId,
              }}
              className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/e/$establishmentId/s/$serviceId/dashboard') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
            >
              Dashboard
            </Link>

            <Link
              to="/e/$establishmentId/s/$serviceId/agenda"
              params={{
                establishmentId: context.establishmentId,
                serviceId: context.serviceId,
              }}
              className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/e/$establishmentId/s/$serviceId/agenda') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
            >
              Agenda
            </Link>

            <Link
              to="/e/$establishmentId/s/$serviceId/patient"
              params={{
                establishmentId: context.establishmentId,
                serviceId: context.serviceId,
              }}
              className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/e/$establishmentId/s/$serviceId/patient') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
            >
              Patients
            </Link>

            <Link
              to="/e/$establishmentId/s/$serviceId/suivi"
              params={{
                establishmentId: context.establishmentId,
                serviceId: context.serviceId,
              }}
              className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/e/$establishmentId/s/$serviceId/suivi') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
            >
              Suivi
            </Link>
          </div>
        )}
      </div>
      <div className="flex gap-8 pl-4 border-l border-border-sidebar">
        <div className="flex items-center gap-2">
          {hasSettingsAccess && context?.establishmentId && (
            <SettingsMenu
              establishmentId={context.establishmentId}
              serviceId={context.serviceId}
              canPlanning={canPlanning}
              canManageSoignants={canManageSoignants}
              canManageReferentials={canManageReferentials}
              canManageLocations={canManageLocations}
              canManageMembers={canManageMembers}
              canReadActivityLog={canReadActivityLog}
            />
          )}
          {/* Les todos sont un objet de service (`todo:own` est une
          permission de service, pas d'etablissement) : sans service en
          contexte (ecrans d'administration atteints par un role sans
          affectation, voir `admin.tsx`), `useTodoQueries` appellerait
          `tenantApiUrl`, qui leve volontairement — meme defaut que celui
          corrige sur la liste des soignants (tache 8, tour de correction
          1), ici referme en masquant le widget plutot qu'en lui trouvant un
          equivalent d'etablissement qui n'existe pas. */}
          {context?.serviceId && <TodoSheet />}
        </div>
      </div>
    </div>
  )
}

export default Navbar

import { useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, SlidersHorizontal } from 'lucide-react'
import { Checkbox, RadioGroup } from 'radix-ui'
import { useRef } from 'react'

import { Switch } from '@/components/ui/switch.tsx'
import {
  NOTIFICATION_PREFS_KEY,
  useAccountServices,
  useNotificationPrefsQuery,
  useUpdateNotificationPrefs,
} from '@/queries/useNotificationPrefs.ts'
import type {
  NotificationLevel,
  NotificationPrefKey,
  NotificationPrefs as Prefs,
  ReminderDelay,
} from '@/types/notificationPrefs.ts'

const LEVELS: {
  level: NotificationLevel
  icon: typeof Bell
  label: string
  description: string
}[] = [
  {
    level: 'all',
    icon: BellRing,
    label: 'Tout',
    description: "Toutes les notifications, dans l'app.",
  },
  {
    level: 'essential',
    icon: Bell,
    label: 'Essentiel',
    description: "Les notifications utiles, dans l'app.",
  },
  {
    level: 'custom',
    icon: SlidersHorizontal,
    label: 'Personnalisé',
    description: 'Votre propre réglage, ligne par ligne.',
  },
]

const GROUPS = ['Mes rendez-vous', 'Patients', 'Créneaux', 'Tâches'] as const

const EVENTS: {
  key: NotificationPrefKey
  group: (typeof GROUPS)[number]
  label: string
  description: string
}[] = [
  {
    key: 'reminder',
    group: 'Mes rendez-vous',
    label: 'Rappel avant mes rendez-vous',
    description: 'Un rappel pour chaque séance où vous intervenez.',
  },
  {
    key: 'added',
    group: 'Mes rendez-vous',
    label: 'Patient ajouté à un de mes rendez-vous',
    description: 'Quand un collègue inscrit un patient à votre séance.',
  },
  {
    key: 'moved',
    group: 'Mes rendez-vous',
    label: 'Rendez-vous modifié ou annulé',
    description: "Changement d'horaire, de salle, ou annulation.",
  },
  {
    key: 'absent',
    group: 'Patients',
    label: 'Absence non justifiée',
    description: "Un patient de votre séance n'est pas venu.",
  },
  {
    key: 'diag',
    group: 'Patients',
    label: 'Diagnostic éducatif à réaliser',
    description: 'Patient inclus sans diagnostic après 7 jours.',
  },
  {
    key: 'end',
    group: 'Patients',
    label: 'Fin de parcours : bilan à faire',
    description: 'Dernière séance du parcours passée.',
  },
  {
    key: 'full',
    group: 'Créneaux',
    label: 'Créneau presque complet',
    description: 'Il reste une place sur un créneau que vous animez.',
  },
  {
    key: 'mention',
    group: 'Tâches',
    label: 'Mention dans une tâche',
    description: 'Un collègue vous mentionne dans une tâche.',
  },
  {
    key: 'due',
    group: 'Tâches',
    label: 'Tâche qui arrive à échéance',
    description: "Le matin du jour d'échéance, pour vos tâches non terminées.",
  },
]

const DELAYS: { delay: ReminderDelay; label: string }[] = [
  { delay: 'eve', label: 'La veille à 18 h' },
  { delay: '2h', label: '2 h avant' },
  { delay: '1h', label: '1 h avant' },
]

const allOn = () =>
  Object.fromEntries(EVENTS.map((e) => [e.key, true])) as Record<
    NotificationPrefKey,
    boolean
  >

export function NotificationPrefs() {
  const { data } = useNotificationPrefsQuery()
  const services = useAccountServices()
  const update = useUpdateNotificationPrefs()
  const queryClient = useQueryClient()
  // Dernière valeur confirmée par le serveur, pas la valeur au clic : deux changements
  // rapprochés envoient deux PUT, et s'ils résolvent dans le désordre, un retour arrière sur
  // l'ancienne valeur écraserait un changement suivant déjà réussi. Mise à jour à chaque succès.
  const lastConfirmed = useRef<Prefs | null>(null)
  if (data && lastConfirmed.current === null) {
    lastConfirmed.current = data
  }

  if (!data) {
    return <p className="text-sm text-text-light">Chargement…</p>
  }

  // Mise à jour optimiste ; `getQueryData` est interdit, le retour arrière relit `lastConfirmed`.
  const save = (next: Prefs) => {
    queryClient.setQueryData(NOTIFICATION_PREFS_KEY, next)
    update.mutate(next, {
      onSuccess: (confirmed) => {
        lastConfirmed.current = confirmed
      },
      onError: () =>
        queryClient.setQueryData(NOTIFICATION_PREFS_KEY, lastConfirmed.current),
    })
  }

  const setLevel = (level: NotificationLevel) =>
    save(
      level === 'custom'
        ? { ...data, level }
        : { ...data, level, app: allOn() },
    )

  const toggleEvent = (key: NotificationPrefKey) =>
    save({
      ...data,
      level: 'custom',
      app: { ...data.app, [key]: !data.app[key] },
    })

  const setDelay = (delay: ReminderDelay) =>
    save({ ...data, reminderDelay: delay })

  const checkedServices = data.services ?? services.map((s) => s.id)
  const toggleService = (id: string) => {
    const checked = checkedServices.includes(id)
    if (checked && checkedServices.length <= 1) {
      return
    }
    const next = checked
      ? checkedServices.filter((s) => s !== id)
      : [...checkedServices, id]
    save({ ...data, services: next })
  }

  return (
    <div className="bg-[#f8fafc] rounded-xl px-7 py-6 flex flex-col gap-[22px]">
      <div>
        <RadioGroup.Root
          value={data.level}
          onValueChange={(level) => setLevel(level as NotificationLevel)}
          aria-label="Niveau"
          className="grid grid-cols-3 gap-2.5"
        >
          {LEVELS.map(({ level, icon: Icon, label, description }) => {
            const active = data.level === level
            return (
              <RadioGroup.Item
                key={level}
                value={level}
                className={`cursor-pointer text-left p-3.5 rounded-[10px] border-[1.5px] ${active ? 'border-primary bg-blue-50' : 'border-border bg-white'}`}
              >
                <Icon
                  className={`w-4 h-4 mb-1 ${active ? 'text-primary' : 'text-text-dark'}`}
                />
                <div className="text-sm font-medium text-foreground">
                  {label}
                </div>
                <div className="text-xs text-text-light">{description}</div>
              </RadioGroup.Item>
            )
          })}
        </RadioGroup.Root>
        <p className="text-xs text-text-light mt-1.5">
          Modifier une ligne passe en « Personnalisé ».
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const checked = checkedServices.includes(s.id)
          return (
            <Checkbox.Root
              key={s.id}
              checked={checked}
              onCheckedChange={() => toggleService(s.id)}
              aria-label={`${s.establishment} › ${s.service}`}
              disabled={checked && checkedServices.length <= 1}
              className={`cursor-pointer disabled:cursor-not-allowed h-[38px] px-3 border rounded-lg text-sm ${checked ? 'border-primary bg-blue-50 text-foreground' : 'border-border bg-white text-text-light'}`}
            >
              {s.establishment} ›{' '}
              <span className="font-semibold">{s.service}</span>
            </Checkbox.Root>
          )
        })}
      </div>

      <div className="border-t border-border pt-[18px] flex flex-col gap-1">
        {GROUPS.map((group) => (
          <div key={group}>
            <h4 className="text-xs uppercase text-text-light mt-3 mb-1">
              {group}
            </h4>
            {EVENTS.filter((e) => e.group === group).map((e) => (
              <div
                key={e.key}
                className="flex items-center justify-between gap-4 py-2 border-t border-border first:border-t-0"
              >
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-foreground">
                    {e.label}
                  </div>
                  <div className="text-[13px] text-text-light">
                    {e.description}
                  </div>
                  {e.key === 'reminder' && (
                    <div className="flex gap-1.5 mt-2">
                      {DELAYS.map(({ delay, label }) => {
                        const active = data.reminderDelay === delay
                        return (
                          <button
                            key={delay}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setDelay(delay)}
                            className={`cursor-pointer h-[26px] px-2.5 rounded-full text-xs border ${active ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-text-dark'}`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <Switch
                  aria-label={e.label}
                  checked={data.app[e.key]}
                  onCheckedChange={() => toggleEvent(e.key)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, Mail, SlidersHorizontal } from 'lucide-react'
import { Checkbox, RadioGroup } from 'radix-ui'
import { useRef } from 'react'

import { Switch } from '@/components/ui/switch.tsx'
import {
  NOTIFICATION_PREFS_KEY,
  useAccountServices,
  useNotificationPrefsQuery,
  useUpdateNotificationPrefs,
} from '@/queries/useNotificationPrefs.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type {
  Digest,
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
    description: "Toutes les notifications, dans l'app et par e-mail.",
  },
  {
    level: 'essential',
    icon: Bell,
    label: 'Essentiel',
    description:
      "Tout dans l'app ; par e-mail, seulement les rappels, les RDV modifiés et les mentions.",
  },
  {
    level: 'custom',
    icon: SlidersHorizontal,
    label: 'Personnalisé',
    description: 'Votre propre réglage, ligne par ligne.',
  },
]

const DIGESTS: { digest: Digest; label: string; description: string }[] = [
  {
    digest: 'now',
    label: "Dès l'événement",
    description: 'Un e-mail par notification.',
  },
  {
    digest: 'daily',
    label: 'Résumé quotidien à 7 h',
    description:
      "Un seul e-mail par jour. Les rappels restent envoyés à l'heure.",
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

// Preset e-mail du niveau Essentiel : rappels, RDV modifiés et mentions seulement.
const ESSENTIAL_MAIL_KEYS: NotificationPrefKey[] = [
  'reminder',
  'moved',
  'mention',
]
const essentialMail = () =>
  Object.fromEntries(
    EVENTS.map((e) => [e.key, ESSENTIAL_MAIL_KEYS.includes(e.key)]),
  ) as Record<NotificationPrefKey, boolean>

export function NotificationPrefs() {
  const { data } = useNotificationPrefsQuery()
  const services = useAccountServices()
  const email = useAuthStore((state) => state.user?.email)
  const update = useUpdateNotificationPrefs()
  const queryClient = useQueryClient()
  // Dernière valeur confirmée par le serveur : un retour arrière n'écrase pas un PUT suivant déjà réussi.
  const lastConfirmed = useRef<Prefs | null>(null)
  if (data && lastConfirmed.current === null) {
    lastConfirmed.current = data
  }

  if (!data) {
    return <p className="text-sm text-text-light">Chargement…</p>
  }

  // Un service quitte depuis l'enregistrement n'est ni affiche, ni compte, ni renvoye (sinon 400).
  const shown = services.map((s) => s.id)
  const live = (ids: string[] | null): string[] | null => {
    const kept = ids?.filter((id) => shown.includes(id)) ?? []
    return kept.length > 0 ? kept : null
  }

  // Mise à jour optimiste ; `getQueryData` est interdit, le retour arrière relit `lastConfirmed`.
  const save = (raw: Prefs) => {
    const next = { ...raw, services: live(raw.services) }
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
        : {
            ...data,
            level,
            app: allOn(),
            mail: level === 'all' ? allOn() : essentialMail(),
          },
    )

  // Couper l'app coupe aussi l'e-mail de la meme ligne, dans le meme save : aucune notification
  // n'existe pour l'envoyer si l'app est coupee.
  const toggleEvent = (key: NotificationPrefKey, channel: 'app' | 'mail') => {
    if (channel === 'mail') {
      return save({
        ...data,
        level: 'custom',
        mail: { ...data.mail, [key]: !data.mail[key] },
      })
    }
    const appOn = !data.app[key]
    save({
      ...data,
      level: 'custom',
      app: { ...data.app, [key]: appOn },
      mail: appOn ? data.mail : { ...data.mail, [key]: false },
    })
  }

  const setDelay = (delay: ReminderDelay) =>
    save({ ...data, reminderDelay: delay })

  const setDigest = (digest: Digest) => save({ ...data, digest })

  const checkedServices = live(data.services) ?? shown
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
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px] gap-4 pb-1">
          <div />
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-light">
            <Bell className="w-3.5 h-3.5" /> Dans l'app
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-light">
            <Mail className="w-3.5 h-3.5" /> E-mail
          </div>
        </div>
        {GROUPS.map((group) => (
          <div key={group}>
            <h4 className="text-xs uppercase text-text-light mt-3 mb-1">
              {group}
            </h4>
            {EVENTS.filter((e) => e.group === group).map((e) => (
              <div
                key={e.key}
                className="grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-4 py-2 border-t border-border first:border-t-0"
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
                  aria-label={`${e.label} dans l'app`}
                  checked={data.app[e.key]}
                  onCheckedChange={() => toggleEvent(e.key, 'app')}
                  className="justify-self-center"
                />
                <Switch
                  aria-label={`${e.label} par e-mail`}
                  checked={data.mail[e.key]}
                  disabled={!data.app[e.key]}
                  onCheckedChange={() => toggleEvent(e.key, 'mail')}
                  className="justify-self-center"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm text-text-dark mb-2">
          À {email}, sans données de santé : un lien ouvre MediSync.
        </p>
        <RadioGroup.Root
          value={data.digest}
          onValueChange={(digest) => setDigest(digest as Digest)}
          aria-label="Envoi des e-mails"
          className="grid grid-cols-2 gap-2.5"
        >
          {DIGESTS.map(({ digest, label, description }) => {
            const active = data.digest === digest
            return (
              <RadioGroup.Item
                key={digest}
                value={digest}
                className={`cursor-pointer text-left p-3.5 rounded-[10px] border-[1.5px] ${active ? 'border-primary bg-blue-50' : 'border-border bg-white'}`}
              >
                <div className="text-sm font-medium text-foreground">
                  {label}
                </div>
                <div className="text-xs text-text-light">{description}</div>
              </RadioGroup.Item>
            )
          })}
        </RadioGroup.Root>
      </div>
    </div>
  )
}

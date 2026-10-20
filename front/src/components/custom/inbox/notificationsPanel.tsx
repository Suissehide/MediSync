import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'

import {
  type InboxNotification,
  type InboxService,
  useInboxMutations,
  useServiceMembers,
} from '@/queries/useInbox.ts'
import { dayGroup, whenLabel } from './inbox.utils.ts'
import {
  notificationTarget,
  notificationText,
  notificationTypeOf,
} from './notificationTypes.tsx'
import {
  FilterBar,
  PanelHeader,
  Segmented,
  ServiceChips,
} from './panelChrome.tsx'

const GROUPS = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien'] as const

function NotificationRow({
  n,
  onOpen,
}: {
  n: InboxNotification
  onOpen: (n: InboxNotification) => void
}) {
  const members = useServiceMembers(n.service)
  const unread = n.readAt === null
  const { icon: Icon, color, tint, kind, cta } = notificationTypeOf(n.type)
  const target = notificationTarget(n)
  const showCta = cta !== '' && (target.kind !== 'task' || n.service.canTasks)
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`cursor-pointer w-full text-left flex gap-3 px-[18px] py-3 hover:bg-[#f8fafc] ${unread ? 'bg-[#f8fbff]' : 'bg-white'}`}
    >
      <span
        style={{ backgroundColor: tint, color }}
        className="w-[34px] h-[34px] shrink-0 rounded-full flex items-center justify-center"
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground">
          {notificationText(n, members)}
        </span>
        <span className="block text-xs text-text-light mt-0.5">
          {kind} · {whenLabel(n.createdAt)}
        </span>
        {showCta && (
          <span className="block text-[13px] text-primary font-medium mt-1">
            {cta}
          </span>
        )}
      </span>
      {unread && (
        <>
          <span
            aria-hidden="true"
            className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-primary"
          />
          <span className="sr-only">Non lue</span>
        </>
      )}
    </button>
  )
}

export function NotificationsPanel({
  services,
  notifications,
  onOpenNotification,
}: {
  services: InboxService[]
  notifications: InboxNotification[]
  onOpenNotification: (n: InboxNotification) => void
}) {
  const [serviceId, setServiceId] = useState('all')
  const [scope, setScope] = useState<'unread' | 'all'>('unread')
  const { markRead, markAllRead } = useInboxMutations()
  const unread = notifications.filter((n) => n.readAt === null)
  const counts = Object.fromEntries(
    services.map((s) => [
      s.serviceId,
      unread.filter((n) => n.service.serviceId === s.serviceId).length,
    ]),
  )
  const visible = notifications.filter(
    (n) =>
      (serviceId === 'all' || n.service.serviceId === serviceId) &&
      (scope === 'all' || n.readAt === null),
  )
  const byDay = (list: InboxNotification[]) =>
    GROUPS.map((g) => ({
      title: g,
      items: list.filter((n) => dayGroup(n.createdAt) === g),
    })).filter((g) => g.items.length)
  const groups =
    serviceId === 'all'
      ? services
          .map((s) => ({
            service: s,
            days: byDay(
              visible.filter((n) => n.service.serviceId === s.serviceId),
            ),
          }))
          .filter((g) => g.days.length)
      : [{ service: undefined, days: byDay(visible) }]
  const open = (n: InboxNotification) => {
    if (n.readAt === null) {
      markRead.mutate(n)
    }
    onOpenNotification(n)
  }

  return (
    <>
      <PanelHeader
        icon={Bell}
        title="Notifications"
        count={unread.length}
        action={
          <button
            type="button"
            disabled={unread.length === 0}
            onClick={() =>
              markAllRead.mutate(services.filter((s) => counts[s.serviceId]))
            }
            className={`cursor-pointer disabled:cursor-default flex items-center gap-1 text-[13px] font-semibold ${unread.length ? 'text-primary' : 'text-[#94a3b8]'}`}
          >
            <CheckCheck className="w-4 h-4" /> Tout lu
          </button>
        }
      />
      <FilterBar>
        <ServiceChips
          services={services}
          counts={counts}
          value={serviceId}
          onChange={setServiceId}
        />
        <Segmented
          options={[
            ['unread', 'Non lues'],
            ['all', 'Toutes'],
          ]}
          value={scope}
          onChange={setScope}
        />
      </FilterBar>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-text-light">
            <Bell className="w-6 h-6" />
            <span className="text-sm">Rien de neuf</span>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.service?.serviceId ?? 'one'}>
              {g.service && (
                <h3 className="px-[18px] pt-3 text-xs font-semibold text-text-light">
                  {g.service.name}
                </h3>
              )}
              {g.days.map((d) => (
                <div key={d.title}>
                  <h4 className="px-[18px] pt-2 pb-1 text-xs font-semibold text-text-light">
                    {d.title}
                  </h4>
                  {d.items.map((n) => (
                    <NotificationRow key={n.id} n={n} onOpen={open} />
                  ))}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
      <div className="px-[18px] py-2.5 border-t border-border text-xs text-text-light">
        Conservées 30 jours
      </div>
    </>
  )
}

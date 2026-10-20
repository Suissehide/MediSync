import { Bell, ListTodo } from 'lucide-react'
import { useCallback, useState } from 'react'

import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import {
  type InboxNotification,
  useInboxServices,
  useNotifications,
  useTasks,
} from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { NotificationsPanel } from './notificationsPanel.tsx'
import { PANEL_CLASS } from './panelChrome.tsx'
import { TasksPanel } from './tasksPanel.tsx'

export type InboxPanel = 'tasks' | 'notifs' | null
export type Focus = { serviceId: string; taskId: string } | null

function IconButton({
  label,
  icon: Icon,
  count,
  color,
  open,
}: {
  label: string
  icon: typeof Bell
  count: number
  color: string
  open: boolean
}) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={`cursor-pointer relative w-10 h-10 rounded-[10px] flex items-center justify-center text-white ${open ? 'bg-white/15' : 'hover:bg-white/10'}`}
      >
        <Icon className="w-5 h-5" />
        {count > 0 && (
          <span
            data-testid={label === 'Tâches' ? 'badge-tasks' : 'badge-notifs'}
            style={{ backgroundColor: color }}
            className="absolute top-1 right-[3px] min-w-[18px] h-[18px] px-1 rounded-full border-2 border-foreground text-[11px] font-bold leading-[14px] text-white text-center"
          >
            {count}
          </span>
        )}
      </button>
    </PopoverTrigger>
  )
}

export function Inbox() {
  const me = useAuthStore((state) => state.user?.id)
  const services = useInboxServices()
  const { tasks } = useTasks(services)
  const { notifications } = useNotifications(services)
  const [open, setOpen] = useState<InboxPanel>(null)
  const [focus, setFocus] = useState<Focus>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const toggle = (panel: Exclude<InboxPanel, null>) => (next: boolean) =>
    setOpen(next ? panel : null)
  const openTasksFor = (n: InboxNotification) => {
    if (!n.service.canTasks) {
      return
    }
    setFocus({ serviceId: n.service.serviceId, taskId: n.payload.taskId })
    setOpen('tasks')
  }
  const onFocusDone = useCallback(() => setFocus(null), [])
  const myOpenTasks = tasks.filter(
    (t) =>
      !t.doneAt &&
      me &&
      (t.assigneeIds.includes(me) ||
        (t.service.soignantId !== null &&
          t.soignantIds.includes(t.service.soignantId))),
  ).length
  const unread = notifications.filter((n) => n.readAt === null).length

  return (
    <div className="flex gap-2">
      {services.some((s) => s.canTasks) && (
        <PopoverRoot open={open === 'tasks'} onOpenChange={toggle('tasks')}>
          <IconButton
            label="Tâches"
            icon={ListTodo}
            count={myOpenTasks}
            color="#2563eb"
            open={open === 'tasks'}
          />
          <PopoverContent
            align="end"
            sideOffset={9}
            className={PANEL_CLASS}
            onEscapeKeyDown={(e) => {
              // Sans ce garde, Echap fermerait tout le panneau (brouillon perdu) au lieu de la liste.
              if (mentionOpen) {
                e.preventDefault()
              }
            }}
          >
            <TasksPanel
              services={services.filter((s) => s.canTasks)}
              tasks={tasks}
              focus={focus}
              onFocusDone={onFocusDone}
              onMentionOpenChange={setMentionOpen}
            />
          </PopoverContent>
        </PopoverRoot>
      )}
      <PopoverRoot open={open === 'notifs'} onOpenChange={toggle('notifs')}>
        <IconButton
          label="Notifications"
          icon={Bell}
          count={unread}
          color="#dc2626"
          open={open === 'notifs'}
        />
        <PopoverContent align="end" sideOffset={9} className={PANEL_CLASS}>
          <NotificationsPanel
            services={services}
            notifications={notifications}
            onOpenTask={openTasksFor}
          />
        </PopoverContent>
      </PopoverRoot>
    </div>
  )
}

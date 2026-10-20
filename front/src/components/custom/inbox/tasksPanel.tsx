import { ChevronDown, ChevronRight, ListTodo } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useCurrentScale } from '@/navigation/navigation.ts'
import {
  type InboxService,
  type InboxTask,
  useInboxMutations,
} from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Focus } from './inbox.tsx'
import {
  FilterBar,
  PanelHeader,
  Segmented,
  ServiceChips,
} from './panelChrome.tsx'
import { TaskComposer } from './taskComposer.tsx'
import { TaskRow } from './taskRow.tsx'

export function TasksPanel({
  services,
  tasks,
  focus,
  onFocusDone,
}: {
  services: InboxService[]
  tasks: InboxTask[]
  focus: Focus
  onFocusDone: () => void
}) {
  const me = useAuthStore((state) => state.user?.id)
  const courant = useCurrentScale()
  const { setTaskDone } = useInboxMutations()
  const [serviceId, setServiceId] = useState('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [showDone, setShowDone] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!focus) {
      return
    }
    setServiceId(focus.serviceId)
    setScope('all')
    setShowDone(true)
    setHighlight(focus.taskId)
    onFocusDone()
  }, [focus, onFocusDone])

  useEffect(() => {
    if (!highlight) {
      return
    }
    document
      .querySelector(`[data-task="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    const timer = setTimeout(() => setHighlight(null), 2500)
    return () => clearTimeout(timer)
  }, [highlight])

  const isDone = (t: InboxTask) => pending[t.id] ?? t.doneAt !== null
  const mine = (t: InboxTask) =>
    me ? t.assigneeIds.includes(me) || t.authorId === me : false
  const visible = tasks.filter(
    (t) =>
      (serviceId === 'all' || t.service.serviceId === serviceId) &&
      (scope === 'all' || mine(t)),
  )
  const open = visible.filter((t) => !isDone(t))
  const done = visible.filter(isDone)
  const counts = Object.fromEntries(
    services.map((s) => [
      s.serviceId,
      tasks.filter((t) => t.service.serviceId === s.serviceId && !isDone(t))
        .length,
    ]),
  )
  const myOpen = tasks.filter(
    (t) => !isDone(t) && me && t.assigneeIds.includes(me),
  ).length
  const target =
    services.find((s) => s.serviceId === serviceId) ??
    services.find(
      (s) => courant?.scale === 'service' && s.serviceId === courant.serviceId,
    ) ??
    services[0]
  const toggle = (t: InboxTask) => {
    const next = !isDone(t)
    setPending({ ...pending, [t.id]: next })
    setTaskDone.mutate(
      { task: t, done: next },
      { onSettled: () => setPending(({ [t.id]: _, ...rest }) => rest) },
    )
  }
  const row = (t: InboxTask) => (
    <TaskRow
      key={t.id}
      task={t}
      done={isDone(t)}
      highlighted={highlight === t.id}
      showService={serviceId === 'all'}
      onToggle={() => toggle(t)}
    />
  )

  return (
    <>
      <PanelHeader icon={ListTodo} title="Tâches" count={myOpen} />
      <FilterBar>
        <ServiceChips
          services={services}
          counts={counts}
          value={serviceId}
          onChange={setServiceId}
        />
        <Segmented
          options={[
            ['mine', 'Pour moi'],
            ['all', 'Toutes'],
          ]}
          value={scope}
          onChange={setScope}
        />
      </FilterBar>
      {target && <TaskComposer service={target} onCreated={setHighlight} />}
      <div className="flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-sm text-text-light">
            Aucune tâche en cours
          </p>
        ) : (
          open.map(row)
        )}
        {done.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowDone(!showDone)}
              className="w-full flex items-center gap-1 px-[18px] py-2.5 text-[13px] font-semibold text-text-light"
            >
              {showDone ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Terminées · {done.length}
            </button>
            {showDone && done.map(row)}
          </>
        )}
      </div>
      <div className="px-[18px] py-2.5 border-t border-border text-[13px] text-text-light">
        Les soignants mentionnés reçoivent une notification.
      </div>
    </>
  )
}

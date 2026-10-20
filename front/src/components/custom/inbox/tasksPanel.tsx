import { ListTodo } from 'lucide-react'

import type { InboxService, InboxTask } from '@/queries/useInbox.ts'
import type { Focus } from './inbox.tsx'
import { PanelHeader } from './panelChrome.tsx'

// Minimal : le contenu (saisie, mentions, liste) arrive en Task 7.
export function TasksPanel(_: {
  services: InboxService[]
  tasks: InboxTask[]
  focus: Focus
  onFocusDone: () => void
}) {
  return <PanelHeader icon={ListTodo} title="Tâches" count={0} />
}

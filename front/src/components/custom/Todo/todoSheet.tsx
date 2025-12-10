import { ScrollArea } from '@radix-ui/themes'
import dayjs from 'dayjs'
import { BellIcon, FilePlus, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useTodoQueries } from '../../../queries/useTodo.ts'
import { useTodoStore } from '../../../store/useTodoStore.ts'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../ui/sheet.tsx'
import TodoAddSheet from './todoAddSheet.tsx'
import { FilterButton } from './todoFilterButton.tsx'
import TodoItem from './todoItem.tsx'

export default function TodoSheet() {
  const [isParentOpen, setIsParentOpen] = useState(false)
  const [shouldCloseParent, setShouldCloseParent] = useState(false)
  const [isChildOpen, setIsChildOpen] = useState(false)

  const { isPending } = useTodoQueries()
  const { todos } = useTodoStore(
    useShallow((state) => ({ todos: state.todos })),
  )
  const hasNewTodos = useTodoStore((state) => state.hasNewTodos)
  const today = dayjs().format('dddd DD MMMM')
  const [filter, setFilter] = useState('all')

  const filteredTodos = todos
    .filter((todo) => {
      if (filter === 'opened') {
        return !todo.completed
      }
      if (filter === 'closed') {
        return todo.completed
      }
      return true
    })
    .sort((a, b) => {
      if (a.completed === b.completed) {
        return 0
      }
      return a.completed ? 1 : -1
    })

  useEffect(() => {
    if (!isChildOpen && shouldCloseParent) {
      const timeout = setTimeout(() => {
        setIsParentOpen(false)
        setShouldCloseParent(false)
      }, 250)
      return () => clearTimeout(timeout)
    }
  }, [isChildOpen, shouldCloseParent])

  const handleParentChange = (open: boolean) => {
    if (!open && isChildOpen) {
      setIsChildOpen(false)
      setShouldCloseParent(true)
    } else {
      setIsParentOpen(open)
    }
  }

  return (
    <Sheet open={isParentOpen} onOpenChange={handleParentChange}>
      <SheetTrigger variant="ghost" size="icon" className="relative">
        <BellIcon className="w-5 h-5" />
        {hasNewTodos ? (
          <span className="absolute flex justify-center items-center -top-1 -right-1 h-4 w-4 rounded-full bg-background after:absolute after:bg-accent after:h-2 after:w-2 after:rounded-full" />
        ) : null}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader className="flex flex-row justify-between items-center mb-6">
          <div className="flex items-center gap-6">
            <div className="pl-2 relative flex justify-center items-center before:z-[-1] before:absolute before:bg-primary/30 before:rounded-full before:w-6.5 before:h-6.5 after:z-[-1] after:absolute after:bg-primary/10 after:rounded-full after:w-9.5 after:h-9.5">
              <FilePlus
                fill="#2563eb"
                strokeWidth={1}
                className="h-4 w-4 text-card z-1"
              />
            </div>
            <div>
              <SheetTitle className="mb-[-4px]">Liste des tâches</SheetTitle>
              <span className="text-sm text-text-light capitalize">
                {today}
              </span>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 mb-8">
          <TodoAddSheet open={isChildOpen} onOpenChange={setIsChildOpen} />
        </div>

        <div className="px-4 flex gap-6 text-sm">
          <FilterButton
            label="Toutes"
            count={todos.length}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />

          <div className="w-0.5 bg-text-light/50" />

          <FilterButton
            label="En cours"
            count={todos.filter((todo) => !todo.completed).length}
            active={filter === 'opened'}
            onClick={() => setFilter('opened')}
          />

          <FilterButton
            label="Terminées"
            count={todos.filter((todo) => todo.completed).length}
            active={filter === 'closed'}
            onClick={() => setFilter('closed')}
          />
        </div>

        <div className="px-4 h-full">
          {isPending ? (
            <div className="h-full flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 my-4 mb-8">
                {filteredTodos?.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

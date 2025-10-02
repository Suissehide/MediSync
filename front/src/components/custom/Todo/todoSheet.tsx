import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../ui/sheet.tsx'
import { BellIcon, Loader2Icon } from 'lucide-react'
import { useTodoStore } from '../../../store/useTodoStore.ts'
import { useShallow } from 'zustand/react/shallow'
import { ScrollArea } from '@radix-ui/themes'
import TodoItem from './todoItem.tsx'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTodoQueries } from '../../../queries/useTodo.ts'
import { FilterButton } from './todoFilterButton.tsx'
import TodoAddSheet from './todoAddSheet.tsx'

export default function TodoSheet() {
  const [isParentOpen, setIsParentOpen] = useState(false)
  const [shouldCloseParent, setShouldCloseParent] = useState(false)
  const [isChildOpen, setIsChildOpen] = useState(false)

  const { isPending } = useTodoQueries()
  const { todos } = useTodoStore(
    useShallow((state) => ({ todos: state.todos })),
  )
  const hasNewTodos = useTodoStore((state) => state.hasNewTodos)
  const today = dayjs().format('dddd DD MMM')
  const [filter, setFilter] = useState('all')

  const filteredTodos = todos.filter((todo) => {
    if (filter === 'opened') {
      return !todo.completed
    }
    if (filter === 'closed') {
      return todo.completed
    }
    return true
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
          <div className="m-0">
            <SheetTitle className="font-bold text-2xl m-0!">
              Liste des tâches
            </SheetTitle>
            <span className="text-text-light capitalize">{today}</span>
          </div>

          <TodoAddSheet open={isChildOpen} onOpenChange={setIsChildOpen} />
        </SheetHeader>

        <div className="flex justify-between text-sm">
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

        <div className="h-full">
          {isPending ? (
            <div className="h-full flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-4 my-4 mb-8">
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

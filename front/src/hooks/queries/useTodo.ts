import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../../constants/message.constant'
import { TODO } from '../../constants/process.constant.ts'
import { useDataFetching } from '../useDataFetching.ts'
import { TodoApi } from '../../api/todo.ts'
import type {
  CreateTodoParams,
  Todo,
  UpdateTodoParams,
} from '../../types/todo.ts'
import { useEffect } from 'react'
import { useTodoStore } from '../../store/useTodoStore.ts'

// * QUERIES

export const useTodoQueries = () => {
  const setTodos = useTodoStore((state) => state.setTodos)

  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
  const getAllTodos = async () => {
    return await TodoApi.getAll()
  }
  const {
    data: todos,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [TODO.GET_ALL],
    queryFn: getAllTodos,
    retry: 0,
  })

  useEffect(() => {
    if (todos) {
      setTodos(todos)
    }
  }, [setTodos, todos])

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { todos, isPending, error }
}

// * MUTATIONS

export const useTodoMutations = () => {
  const queryClient = useQueryClient()

  const createTodo = useMutation({
    mutationKey: [TODO.CREATE],
    mutationFn: TodoApi.create,
    onMutate: async (newTodo: CreateTodoParams) => {
      await queryClient.cancelQueries({ queryKey: [TODO.GET_ALL] })

      const previousTodos = queryClient.getQueryData([TODO.GET_ALL])
      queryClient.setQueryData([TODO.GET_ALL], (oldTodos: Todo[]) => [
        ...(oldTodos || []),
        newTodo,
      ])

      return { previousTodos }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [TODO.GET_ALL] })
    },
  })

  const deleteTodo = useMutation({
    mutationKey: [TODO.DELETE],
    mutationFn: TodoApi.delete,
    onMutate: async (todoId) => {
      await queryClient.cancelQueries({ queryKey: [TODO.GET_ALL] })

      const previousTodos = queryClient.getQueryData([TODO.GET_ALL])
      queryClient.setQueryData([TODO.GET_ALL], (oldTodos: Todo[]) =>
        oldTodos?.filter((todo: Todo) => todo.id !== todoId),
      )

      return { previousTodos }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [TODO.GET_ALL] })
    },
  })

  const updateTodo = useMutation({
    mutationKey: [TODO.UPDATE],
    mutationFn: TodoApi.update,
    onMutate: async (updatedTodo: UpdateTodoParams) => {
      await queryClient.cancelQueries({ queryKey: [TODO.GET_ALL] })

      const previousTodos = queryClient.getQueryData([TODO.GET_ALL])
      queryClient.setQueryData([TODO.GET_ALL], (oldTodos: Todo[]) =>
        oldTodos?.map((todo: Todo) =>
          todo.id === updatedTodo.id ? updatedTodo : todo,
        ),
      )

      return { previousTodos }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [TODO.GET_ALL] })
    },
  })

  return { createTodo, deleteTodo, updateTodo }
}

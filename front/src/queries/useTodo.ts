import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { TodoApi } from '../api/todo.api.ts'
import { TODO } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import { useTodoStore } from '../store/useTodoStore.ts'
import type { CreateTodoParams, Todo, UpdateTodoParams } from '../types/todo.ts'

// * QUERIES

export const useTodoQueries = () => {
  const setTodos = useTodoStore((state) => state.setTodos)

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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { todos, isPending, error }
}

// * MUTATIONS

export const useTodoMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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
    onSuccess: () => {
      toast({
        title: 'Todo créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)

      toast({
        title: 'Erreur lors de la création du todo',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [TODO.GET_ALL] })
    },
  })

  const deleteTodo = useMutation({
    mutationKey: [TODO.DELETE],
    mutationFn: TodoApi.delete,
    onMutate: async (todoID) => {
      await queryClient.cancelQueries({ queryKey: [TODO.GET_ALL] })

      const previousTodos = queryClient.getQueryData([TODO.GET_ALL])
      queryClient.setQueryData([TODO.GET_ALL], (oldTodos: Todo[]) =>
        oldTodos?.filter((todo: Todo) => todo.id !== todoID),
      )

      return { previousTodos }
    },
    onSuccess: () => {
      toast({
        title: 'Todo supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)

      toast({
        title: 'Erreur lors de la suppression du todo',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
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
    onSuccess: () => {
      toast({
        title: 'Todo modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([TODO.GET_ALL], context?.previousTodos)

      toast({
        title: 'Erreur lors de la mise à jour du todo',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [TODO.GET_ALL] })
    },
  })

  return { createTodo, deleteTodo, updateTodo }
}

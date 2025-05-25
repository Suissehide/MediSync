import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  shouldReload({ context }) {
    return !context.authState.isAuthenticated
  },
  component: Index,
})

function Index() {
  const router = useRouter()
  router.navigate({ to: '/dashboard' })

  return <></>
}

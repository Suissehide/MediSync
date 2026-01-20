import { createFileRoute, useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/')({
  component: Index,
})

function Index() {
  const router = useRouter()
  router.navigate({ to: '/dashboard' })

  return <></>
}

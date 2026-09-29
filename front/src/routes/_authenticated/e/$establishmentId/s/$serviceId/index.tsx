import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/e/$establishmentId/s/$serviceId/dashboard',
      params,
    })
  },
})

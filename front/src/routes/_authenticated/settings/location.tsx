import { createFileRoute } from '@tanstack/react-router'

import { redirectToDefaultService } from '@/utils/legacy-redirect.ts'

export const Route = createFileRoute('/_authenticated/settings/location')({
  beforeLoad: ({ context }) =>
    redirectToDefaultService(
      context.authState.user,
      '/e/$establishmentId/s/$serviceId/location',
    ),
})

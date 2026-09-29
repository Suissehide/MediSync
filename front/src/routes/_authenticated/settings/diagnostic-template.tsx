import { createFileRoute } from '@tanstack/react-router'

import { redirectToDefaultService } from '@/utils/legacy-redirect.ts'

export const Route = createFileRoute(
  '/_authenticated/settings/diagnostic-template',
)({
  beforeLoad: ({ context }) =>
    redirectToDefaultService(
      context.authState.user,
      '/e/$establishmentId/s/$serviceId/diagnostic-template',
    ),
})

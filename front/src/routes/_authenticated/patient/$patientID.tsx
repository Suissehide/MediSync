import { createFileRoute } from '@tanstack/react-router'

import { redirectToDefaultService } from '@/utils/legacy-redirect.ts'

export const Route = createFileRoute('/_authenticated/patient/$patientID')({
  beforeLoad: ({ context, params }) =>
    redirectToDefaultService(
      context.authState.user,
      '/e/$establishmentId/s/$serviceId/patient/$patientID',
      { patientID: params.patientID },
    ),
})

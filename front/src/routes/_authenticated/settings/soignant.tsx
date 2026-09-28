import { createFileRoute } from '@tanstack/react-router'

import { redirectToDefaultAdmin } from '@/utils/legacy-redirect.ts'

// Ecran demenage a l'echelle de l'etablissement (navigation par echelle, 2026-09-28).
export const Route = createFileRoute('/_authenticated/settings/soignant')({
  beforeLoad: ({ context }) =>
    redirectToDefaultAdmin(context.authState.user, '/e/$establishmentId/admin/soignants'),
})

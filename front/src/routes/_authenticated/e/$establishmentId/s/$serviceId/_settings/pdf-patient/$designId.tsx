import { createFileRoute, redirect } from '@tanstack/react-router'

import DashboardLayout from '@/components/dashboard.layout.tsx'
import { can } from '@/hooks/useCan.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: PdfDesignEditor,
})

// L'editeur lui-meme arrive en tache 6 ; la route existe des maintenant pour que la liste ait
// une destination et que la navigation la declare.
function PdfDesignEditor() {
  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg">
        <p className="text-text-light">Éditeur de design</p>
      </div>
    </DashboardLayout>
  )
}

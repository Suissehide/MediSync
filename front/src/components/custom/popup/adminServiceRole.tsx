import {
  ADMIN_SERVICE_ROLE_DESCRIPTION,
  ADMIN_SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'

// Remplace le choix du rôle de service quand le rôle établissement est Chef
// d'établissement : il est coordinateur de tous les services, rien à choisir.
function AdminServiceRole({ id, label }: { id: string; label: string }) {
  const descriptionId = `${id}-description`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={ADMIN_SERVICE_ROLE_LABEL}
        disabled
        readOnly
        aria-describedby={descriptionId}
        className="bg-muted text-text-light disabled:opacity-100"
      />
      <p
        id={descriptionId}
        className="mt-0.5 text-[13px] leading-snug text-text-light text-pretty"
      >
        {ADMIN_SERVICE_ROLE_DESCRIPTION}
      </p>
    </div>
  )
}

export default AdminServiceRole

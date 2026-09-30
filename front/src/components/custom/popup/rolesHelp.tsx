import {
  ESTABLISHMENT_ROLE_DESCRIPTION,
  ESTABLISHMENT_ROLE_LABEL,
  SERVICE_ROLE_DESCRIPTION,
  SERVICE_ROLE_LABEL,
} from '../../../constants/member.constant.ts'

function RoleList({
  labels,
  descriptions,
}: {
  labels: Record<string, string>
  descriptions: Record<string, string>
}) {
  return (
    <dl className="space-y-1">
      {Object.entries(labels).map(([role, label]) => (
        <div key={role}>
          <dt className="inline font-medium text-text-dark">{label} : </dt>
          <dd className="inline">{descriptions[role]}</dd>
        </div>
      ))}
    </dl>
  )
}

// Aide repliable des formulaires de membre : ce que permet chaque rôle.
function RolesHelp() {
  return (
    <details className="text-sm text-text-light rounded-md border border-border px-3 py-2">
      <summary className="cursor-pointer font-medium text-text-dark">
        À quoi servent les rôles ?
      </summary>
      <div className="mt-2 space-y-3">
        <div className="space-y-1">
          <h4 className="font-semibold text-text-dark">Rôle établissement</h4>
          <RoleList
            labels={ESTABLISHMENT_ROLE_LABEL}
            descriptions={ESTABLISHMENT_ROLE_DESCRIPTION}
          />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-text-dark">Rôle dans un service</h4>
          <RoleList
            labels={SERVICE_ROLE_LABEL}
            descriptions={SERVICE_ROLE_DESCRIPTION}
          />
          <p>Un membre peut avoir un rôle différent dans chaque service.</p>
        </div>
      </div>
    </details>
  )
}

export default RolesHelp

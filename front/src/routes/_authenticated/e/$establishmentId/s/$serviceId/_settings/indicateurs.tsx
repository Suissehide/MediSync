import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

import { resumeFiltre } from '@/components/custom/indicators/filterEditor.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import IndicatorForm, {
  INPUT_LABELS,
  NATURE_LABELS,
} from '@/components/custom/popup/indicatorForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '@/components/ui/popup.tsx'
import { Select } from '@/components/ui/select.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { can } from '@/hooks/useCan.ts'
import { cn } from '@/libs/utils.ts'
import {
  useActivitySettingsQuery,
  useAllIndicatorSetsQuery,
  useIndicatorCatalogQuery,
  useIndicatorSetMutations,
  useUpdateActivitySettingsMutation,
} from '@/queries/useIndicatorSet.ts'
import { useServiceFieldsQuery } from '@/queries/useServiceField.ts'
import type {
  ActivitySettings,
  Indicator,
  IndicatorSet,
  MeasureCatalogEntry,
} from '@/types/indicatorSet.ts'
import type { ServiceField } from '@/types/serviceField.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/indicateurs',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'stats:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: IndicateursSettings,
})

// « Patients entrés · Orientation parmi Hors hôpital » : ce que calcule ou attend l'indicateur.
const resume = (
  i: Indicator,
  catalog: MeasureCatalogEntry[],
  fields: ServiceField[],
): string => {
  if (i.nature === 'manual') {
    return i.input ? `Réponse : ${INPUT_LABELS[i.input]}` : ''
  }
  if (i.nature === 'unavailable') {
    return i.note ?? ''
  }
  const mesure = catalog.find((m) => m.key === i.measure)
  const options = (mesure?.options ?? []).flatMap((o) => {
    const v = i.options?.[o.name]
    if (o.kind === 'boolean') {
      return v === true ? [o.label] : []
    }
    const choix = o.choices?.find((c) => c.value === v)
    return choix ? [`${o.label} : ${choix.label}`] : []
  })
  const repartition = fields.find((f) => f.key === i.breakdownField)
  return [
    mesure?.label ?? i.measure ?? '',
    ...options,
    ...(i.filters ?? []).map((cond) => resumeFiltre(cond, fields)),
    ...(repartition ? [`réparti par ${repartition.label}`] : []),
  ].join(' · ')
}

// Échange deux identifiants dans la liste complète, supprimés compris (le back l'exige).
const echanger = (ids: string[], a: string, b: string) => {
  const suite = [...ids]
  const i = suite.indexOf(a)
  const j = suite.indexOf(b)
  ;[suite[i], suite[j]] = [suite[j], suite[i]]
  return suite
}

function Fleches({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void
  onDown: () => void
  upDisabled: boolean
  downDisabled: boolean
}) {
  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Monter"
        disabled={upDisabled}
        onClick={onUp}
      >
        <ChevronUp className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Descendre"
        disabled={downDisabled}
        onClick={onDown}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </>
  )
}

function NomJeuForm({
  set,
  trigger,
}: {
  set?: IndicatorSet
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [nom, setNom] = useState('')
  const { createSet, updateSet } = useIndicatorSetMutations()
  const enCours = set ? updateSet.isPending : createSet.isPending

  const valider = () => {
    if (enCours || !nom.trim()) {
      return
    }
    const fermer = { onSuccess: () => setOpen(false) }
    if (set) {
      updateSet.mutate({ id: set.id, name: nom.trim() }, fermer)
    } else {
      createSet.mutate(nom.trim(), fermer)
    }
  }

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setNom(set?.name ?? '')
        }
      }}
    >
      <PopupTrigger asChild>{trigger}</PopupTrigger>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {set ? 'Renommer le jeu' : 'Nouveau jeu'}
          </PopupTitle>
        </PopupHeader>
        <PopupBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              valider()
            }}
            className="flex flex-col gap-1 max-w-md"
          >
            <Label htmlFor="nom-jeu">Nom</Label>
            <Input
              id="nom-jeu"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </form>
        </PopupBody>
        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            isLoading={enCours}
            disabled={enCours || !nom.trim()}
            onClick={valider}
          >
            <Check className="w-4 h-4" />
            {set ? 'Enregistrer' : 'Créer'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

function ReglagesActivite({
  initial,
  fields,
}: {
  initial: ActivitySettings
  fields: ServiceField[]
}) {
  const [champ, setChamp] = useState(initial.stopReasonFieldKey ?? '')
  const [valeur, setValeur] = useState(initial.completedChoiceKey ?? '')
  const enregistrer = useUpdateActivitySettingsMutation()
  const proposes = fields.filter(
    (f) => f.type === 'choice' && (!f.archived || f.key === champ),
  )
  const choisi = fields.find((f) => f.key === champ)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text-dark">
        Réglages de l'Activité
      </h2>
      <p className="text-sm text-text-light">
        Le bloc des motifs d'arrêt de l'Activité s'affiche quand les deux
        réglages sont posés ; un seul ne suffit pas, le bloc reste masqué.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
        <div className="flex flex-col gap-1">
          <Label htmlFor="motif-arret">Champ motif d'arrêt</Label>
          <Select
            id="motif-arret"
            options={proposes.map((f) => ({ value: f.key, label: f.label }))}
            value={champ}
            placeholder="Aucun"
            onValueChange={(v) => {
              setChamp(v)
              setValeur('')
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fin-parcours">Valeur « fin de parcours »</Label>
          <Select
            id="fin-parcours"
            options={(choisi?.choices ?? [])
              .filter((c) => !c.archived || c.key === valeur)
              .map((c) => ({ value: c.key, label: c.label }))}
            value={valeur}
            placeholder="Aucune"
            disabled={!choisi}
            onValueChange={setValeur}
          />
        </div>
      </div>
      <Button
        variant="default"
        className="w-fit"
        isLoading={enregistrer.isPending}
        disabled={enregistrer.isPending}
        onClick={() =>
          enregistrer.mutate({
            stopReasonFieldKey: champ || null,
            completedChoiceKey: champ && valeur ? valeur : null,
          })
        }
      >
        <Check className="w-4 h-4" />
        Enregistrer les réglages
      </Button>
    </section>
  )
}

function IndicateursSettings() {
  const [showArchived, setShowArchived] = useState(false)
  const [choisiId, setChoisiId] = useState<string | null>(null)
  const [aSupprimer, setASupprimer] = useState<
    | { kind: 'set'; set: IndicatorSet }
    | { kind: 'indicator'; setId: string; indicator: Indicator }
    | null
  >(null)
  const { sets = [] } = useAllIndicatorSetsQuery()
  const { catalog } = useIndicatorCatalogQuery()
  const { fields } = useServiceFieldsQuery()
  const { settings } = useActivitySettingsQuery()
  const { updateSet, reorderSets, updateIndicator, reorderIndicators } =
    useIndicatorSetMutations()

  const actifs = sets.filter((s) => !s.archived)
  const visibles = sets.filter((s) => s.archived === showArchived)
  const jeu = visibles.find((s) => s.id === choisiId) ?? visibles[0] ?? null

  const deplacerJeu = (id: string, sens: -1 | 1) => {
    const voisin = actifs[actifs.findIndex((s) => s.id === id) + sens]
    if (voisin && !reorderSets.isPending) {
      reorderSets.mutate(
        echanger(
          sets.map((s) => s.id),
          id,
          voisin.id,
        ),
      )
    }
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-y-auto">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Indicateurs
          </h1>
          <div className="flex items-center gap-2">
            <Switch
              id="indicateurs-supprimes"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="indicateurs-supprimes">Supprimés</Label>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold text-text-dark">
              Jeux d'indicateurs
            </h2>
            {!showArchived && (
              <NomJeuForm
                trigger={
                  <Button variant="default">
                    <Plus className="w-4 h-4" />
                    Nouveau jeu
                  </Button>
                }
              />
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {visibles.length === 0 && (
              <li className="text-sm text-text-light">
                {showArchived ? 'Aucun jeu supprimé' : 'Aucun jeu'}
              </li>
            )}
            {visibles.map((s) => {
              const index = actifs.findIndex((a) => a.id === s.id)
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center gap-2 border border-border rounded px-3 py-2',
                    jeu?.id === s.id && 'border-primary',
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left font-medium text-foreground cursor-pointer"
                    aria-pressed={jeu?.id === s.id}
                    onClick={() => setChoisiId(s.id)}
                  >
                    {s.name}
                    <span className="ml-2 text-sm font-normal text-text-light">
                      {s.indicators.filter((i) => !i.archived).length}{' '}
                      indicateur(s)
                    </span>
                  </button>
                  {!s.archived && (
                    <Fleches
                      onUp={() => deplacerJeu(s.id, -1)}
                      onDown={() => deplacerJeu(s.id, 1)}
                      upDisabled={index <= 0 || reorderSets.isPending}
                      downDisabled={
                        index === actifs.length - 1 || reorderSets.isPending
                      }
                    />
                  )}
                  <NomJeuForm
                    set={s}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Pencil className="w-4 h-4" />
                        Renommer
                      </Button>
                    }
                  />
                  {s.archived ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updateSet.isPending}
                      onClick={() =>
                        updateSet.mutate({ id: s.id, archived: false })
                      }
                    >
                      <Undo2 className="w-4 h-4" />
                      Restaurer
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setASupprimer({ kind: 'set', set: s })}
                    >
                      <Trash2 className="w-4 h-4" />
                      Supprimer
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {jeu && (
          <JeuDetail
            jeu={jeu}
            showArchived={showArchived}
            catalog={catalog}
            fields={fields}
            reorderPending={reorderIndicators.isPending}
            restorePending={updateIndicator.isPending}
            onMove={(ids) => reorderIndicators.mutate({ setId: jeu.id, ids })}
            onRestore={(i) =>
              updateIndicator.mutate({
                setId: jeu.id,
                id: i.id,
                body: { archived: false },
              })
            }
            onDelete={(i) =>
              setASupprimer({ kind: 'indicator', setId: jeu.id, indicator: i })
            }
          />
        )}

        {settings && <ReglagesActivite initial={settings} fields={fields} />}

        <ConfirmDeleteForm
          open={aSupprimer !== null}
          setOpen={(open) => {
            if (!open) {
              setASupprimer(null)
            }
          }}
          onConfirm={() => {
            if (aSupprimer?.kind === 'set') {
              updateSet.mutate({ id: aSupprimer.set.id, archived: true })
            } else if (aSupprimer?.kind === 'indicator') {
              updateIndicator.mutate({
                setId: aSupprimer.setId,
                id: aSupprimer.indicator.id,
                body: { archived: true },
              })
            }
            setASupprimer(null)
          }}
          loading={updateSet.isPending || updateIndicator.isPending}
          title={
            aSupprimer?.kind === 'set'
              ? 'Supprimer le jeu'
              : "Supprimer l'indicateur"
          }
          description={
            aSupprimer?.kind === 'set'
              ? 'Le jeu quitte le Pilotage. Il reste restaurable depuis « Supprimés », avec ses indicateurs et ses réponses.'
              : "L'indicateur quitte le jeu. Il reste restaurable depuis « Supprimés », avec ses réponses."
          }
        />
      </div>
    </DashboardLayout>
  )
}

function JeuDetail({
  jeu,
  showArchived,
  catalog,
  fields,
  reorderPending,
  restorePending,
  onMove,
  onRestore,
  onDelete,
}: {
  jeu: IndicatorSet
  showArchived: boolean
  catalog: MeasureCatalogEntry[]
  fields: ServiceField[]
  reorderPending: boolean
  restorePending: boolean
  onMove: (ids: string[]) => void
  onRestore: (i: Indicator) => void
  onDelete: (i: Indicator) => void
}) {
  const actifs = jeu.indicators.filter((i) => !i.archived)
  const visibles = jeu.indicators.filter((i) => i.archived === showArchived)
  const groupes = [...new Set(visibles.map((i) => i.group))]

  const deplacer = (i: Indicator, sens: -1 | 1) => {
    const groupe = actifs.filter((a) => a.group === i.group)
    const voisin = groupe[groupe.findIndex((a) => a.id === i.id) + sens]
    if (voisin && !reorderPending) {
      onMove(
        echanger(
          jeu.indicators.map((x) => x.id),
          i.id,
          voisin.id,
        ),
      )
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold text-text-dark">{jeu.name}</h2>
        {!showArchived && !jeu.archived && (
          <IndicatorForm
            setId={jeu.id}
            indicators={jeu.indicators}
            catalog={catalog}
            fields={fields}
          />
        )}
      </div>
      {groupes.length === 0 && (
        <p className="text-sm text-text-light">
          {showArchived ? 'Aucun indicateur supprimé' : 'Aucun indicateur'}
        </p>
      )}
      {groupes.map((groupe) => {
        const actifsDuGroupe = actifs.filter((a) => a.group === groupe)
        return (
          <div key={groupe} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text-dark">{groupe}</h3>
            <ul className="flex flex-col gap-2">
              {visibles
                .filter((i) => i.group === groupe)
                .map((i) => {
                  const index = actifsDuGroupe.findIndex((a) => a.id === i.id)
                  return (
                    <li
                      key={i.id}
                      className="flex items-center gap-2 border border-border rounded px-3 py-2"
                    >
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-medium text-foreground">
                          {i.code} · {i.label}
                        </span>
                        <span className="text-text-light">
                          {' '}
                          · {NATURE_LABELS[i.nature]}
                        </span>
                        <p className="text-text-light truncate">
                          {resume(i, catalog, fields)}
                        </p>
                      </div>
                      {!i.archived && (
                        <Fleches
                          onUp={() => deplacer(i, -1)}
                          onDown={() => deplacer(i, 1)}
                          upDisabled={index <= 0 || reorderPending}
                          downDisabled={
                            index === actifsDuGroupe.length - 1 ||
                            reorderPending
                          }
                        />
                      )}
                      <IndicatorForm
                        setId={jeu.id}
                        indicators={jeu.indicators}
                        catalog={catalog}
                        fields={fields}
                        indicator={i}
                      />
                      {i.archived ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restorePending}
                          onClick={() => onRestore(i)}
                        >
                          <Undo2 className="w-4 h-4" />
                          Restaurer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(i)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Supprimer
                        </Button>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

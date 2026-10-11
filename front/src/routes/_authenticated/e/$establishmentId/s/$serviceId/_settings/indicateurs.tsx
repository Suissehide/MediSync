import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  Calculator,
  Check,
  CircleSlash,
  type LucideIcon,
  Pencil,
  PenLine,
  Plus,
  Trash2,
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
import {
  ActionSeparator,
  IconButton,
  MoveButtons,
  RestoreButton,
} from '@/components/settings/iconButton.tsx'
import {
  CardFooterButton,
  SettingsCard,
  SettingsRow,
} from '@/components/settings/settingsCard.tsx'
import {
  DeletedBanner,
  SettingsPageHeader,
} from '@/components/settings/settingsPageHeader.tsx'
import { Tag } from '@/components/settings/tag.tsx'
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
  IndicatorNature,
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

const NATURE_ICONS: Record<IndicatorNature, LucideIcon> = {
  computed: Calculator,
  manual: PenLine,
  unavailable: CircleSlash,
}

function NomJeuForm({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [nom, setNom] = useState('')
  const { createSet } = useIndicatorSetMutations()
  const enCours = createSet.isPending

  const valider = () => {
    if (enCours || !nom.trim()) {
      return
    }
    createSet.mutate(nom.trim(), { onSuccess: () => setOpen(false) })
  }

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setNom('')
        }
      }}
    >
      <PopupTrigger asChild>{trigger}</PopupTrigger>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">Nouveau jeu</PopupTitle>
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
            Créer
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
    <SettingsCard title="Réglages de l'Activité">
      <div className="flex flex-col gap-3 px-5 py-4">
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
          variant="outline"
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
      </div>
    </SettingsCard>
  )
}

function IndicateursSettings() {
  const [showArchived, setShowArchived] = useState(false)
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
  // « Supprimés » ajoute les jeux supprimés aux cartes.
  const visibles = showArchived ? sets : actifs
  const supprimes =
    sets.filter((s) => s.archived).length +
    sets.flatMap((s) => s.indicators).filter((i) => i.archived).length

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
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-5 overflow-y-auto">
        <SettingsPageHeader
          title="Indicateurs"
          subtitle="Jeux d'indicateurs consultés dans Pilotage."
          switchId="indicateurs-supprimes"
          showDeleted={showArchived}
          onShowDeletedChange={setShowArchived}
          deletedCount={supprimes}
          action={
            <NomJeuForm
              trigger={
                <Button variant="default">
                  <Plus className="w-4 h-4" />
                  Nouveau jeu
                </Button>
              }
            />
          }
        />

        {showArchived && (
          <DeletedBanner>
            Vous voyez les jeux et indicateurs supprimés. Leurs réponses saisies
            sont conservées.
          </DeletedBanner>
        )}

        {visibles.length === 0 && (
          <p className="text-sm text-text-light">Aucun jeu</p>
        )}
        {visibles.map((s) => {
          const index = actifs.findIndex((a) => a.id === s.id)
          return (
            <JeuCarte
              key={s.id}
              jeu={s}
              showArchived={showArchived}
              catalog={catalog}
              fields={fields}
              actions={
                s.archived ? (
                  <RestoreButton
                    aria-label="Restaurer le jeu"
                    disabled={updateSet.isPending}
                    onClick={() =>
                      updateSet.mutate({ id: s.id, archived: false })
                    }
                  />
                ) : (
                  <>
                    <MoveButtons
                      upLabel="Monter le jeu"
                      downLabel="Descendre le jeu"
                      upDisabled={index <= 0 || reorderSets.isPending}
                      downDisabled={
                        index === actifs.length - 1 || reorderSets.isPending
                      }
                      onUp={() => deplacerJeu(s.id, -1)}
                      onDown={() => deplacerJeu(s.id, 1)}
                    />
                    <ActionSeparator />
                    <IconButton
                      danger
                      label="Supprimer le jeu"
                      onClick={() => setASupprimer({ kind: 'set', set: s })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </>
                )
              }
              onRename={(name) => updateSet.mutate({ id: s.id, name })}
              reorderPending={reorderIndicators.isPending}
              restorePending={updateIndicator.isPending}
              onMove={(ids) => reorderIndicators.mutate({ setId: s.id, ids })}
              onRestore={(i) =>
                updateIndicator.mutate({
                  setId: s.id,
                  id: i.id,
                  body: { archived: false },
                })
              }
              onDelete={(i) =>
                setASupprimer({ kind: 'indicator', setId: s.id, indicator: i })
              }
            />
          )
        })}

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

function IndicateurLigne({
  indicateur: i,
  jeu,
  catalog,
  fields,
  upDisabled,
  downDisabled,
  onUp,
  onDown,
  restorePending,
  onRestore,
  onDelete,
}: {
  indicateur: Indicator
  jeu: IndicatorSet
  catalog: MeasureCatalogEntry[]
  fields: ServiceField[]
  upDisabled: boolean
  downDisabled: boolean
  onUp: () => void
  onDown: () => void
  restorePending: boolean
  onRestore: () => void
  onDelete: () => void
}) {
  const NatureIcon = NATURE_ICONS[i.nature]
  const modifier = (
    <IndicatorForm
      setId={jeu.id}
      indicators={jeu.indicators}
      catalog={catalog}
      fields={fields}
      indicator={i}
      trigger={
        <IconButton label="Modifier">
          <Pencil className="w-4 h-4 text-text-dark" />
        </IconButton>
      }
    />
  )
  return (
    <SettingsRow
      deleted={i.archived}
      actions={
        i.archived ? (
          <>
            {modifier}
            <RestoreButton disabled={restorePending} onClick={onRestore} />
          </>
        ) : (
          <>
            <MoveButtons
              upDisabled={upDisabled}
              downDisabled={downDisabled}
              onUp={onUp}
              onDown={onDown}
            />
            <ActionSeparator />
            {modifier}
            <IconButton danger label="Supprimer" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </>
        )
      }
    >
      <div className="flex flex-col min-w-0 py-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 text-[13px] text-text-light tabular-nums">
            {i.code}
          </span>
          <span
            className={cn(
              'truncate text-[15px] font-medium',
              i.archived ? 'text-text-light' : 'text-foreground',
            )}
          >
            {i.label}
          </span>
          <Tag
            icon={
              <NatureIcon aria-hidden="true" className="w-[13px] h-[13px]" />
            }
          >
            {NATURE_LABELS[i.nature]}
          </Tag>
        </div>
        <p className="truncate text-[13px] text-text-light">
          {resume(i, catalog, fields)}
        </p>
      </div>
    </SettingsRow>
  )
}

function JeuCarte({
  jeu,
  showArchived,
  catalog,
  fields,
  actions,
  onRename,
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
  actions: React.ReactNode
  onRename: (name: string) => void
  reorderPending: boolean
  restorePending: boolean
  onMove: (ids: string[]) => void
  onRestore: (i: Indicator) => void
  onDelete: (i: Indicator) => void
}) {
  const actifs = jeu.indicators.filter((i) => !i.archived)
  const visibles = showArchived ? jeu.indicators : actifs
  const groupes = [...new Set(visibles.map((i) => i.group))]
  const n = actifs.length

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
    <SettingsCard
      title={jeu.name}
      onRename={onRename}
      renameLabel="Renommer le jeu"
      inputLabel="Nom du jeu"
      count={`${n} indicateur${n > 1 ? 's' : ''}`}
      actions={actions}
      empty={groupes.length === 0 ? 'Aucun indicateur' : undefined}
      footer={
        !jeu.archived &&
        !showArchived && (
          <IndicatorForm
            setId={jeu.id}
            indicators={jeu.indicators}
            catalog={catalog}
            fields={fields}
            trigger={<CardFooterButton>Ajouter un indicateur</CardFooterButton>}
          />
        )
      }
    >
      {groupes.map((groupe) => {
        const actifsDuGroupe = actifs.filter((a) => a.group === groupe)
        return (
          <div key={groupe}>
            <h3 className="px-5 pt-3 pb-1 text-[13px] font-semibold text-text-light">
              {groupe}
            </h3>
            <ul>
              {visibles
                .filter((i) => i.group === groupe)
                .map((i) => {
                  const index = actifsDuGroupe.findIndex((a) => a.id === i.id)
                  return (
                    <IndicateurLigne
                      key={i.id}
                      indicateur={i}
                      jeu={jeu}
                      catalog={catalog}
                      fields={fields}
                      upDisabled={index <= 0 || reorderPending}
                      downDisabled={
                        index === actifsDuGroupe.length - 1 || reorderPending
                      }
                      onUp={() => deplacer(i, -1)}
                      onDown={() => deplacer(i, 1)}
                      restorePending={restorePending}
                      onRestore={() => onRestore(i)}
                      onDelete={() => onDelete(i)}
                    />
                  )
                })}
            </ul>
          </div>
        )
      })}
    </SettingsCard>
  )
}

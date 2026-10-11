import { createFileRoute, redirect } from '@tanstack/react-router'
import { Check, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import ServiceFieldForm from '@/components/custom/popup/serviceFieldForm.tsx'
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
import {
  SERVICE_FIELD_TYPE_ICONS,
  SERVICE_FIELD_TYPE_LABELS,
} from '@/constants/serviceFieldTypes.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { cn } from '@/libs/utils.ts'
import {
  useServiceFieldCategoriesQuery,
  useServiceFieldMutations,
  useServiceFieldsQuery,
} from '@/queries/useServiceField.ts'
import type {
  ServiceField,
  ServiceFieldCategory,
} from '@/types/serviceField.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient',
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
  component: FichePatientSettings,
})

function AjouterCategorie() {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const { createCategory } = useServiceFieldMutations()

  const submit = () => {
    const trimmed = label.trim()
    if (!trimmed || createCategory.isPending) {
      return
    }
    createCategory.mutate({ label: trimmed })
    setLabel('')
    setOpen(false)
  }

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Ajouter une catégorie
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter une catégorie
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nouvelle-categorie-libelle">Libellé</Label>
            <Input
              id="nouvelle-categorie-libelle"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            disabled={!label.trim()}
            isLoading={createCategory.isPending}
            onClick={submit}
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

interface CategoryActionsProps {
  category: ServiceFieldCategory
  canMoveUp: boolean
  canMoveDown: boolean
  isReorderPending: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  hasActiveFields: boolean
  isCategoryMutationPending: boolean
  onDelete: () => void
  onRestore: () => void
}

function CategoryActions({
  category,
  canMoveUp,
  canMoveDown,
  isReorderPending,
  onMoveUp,
  onMoveDown,
  hasActiveFields,
  isCategoryMutationPending,
  onDelete,
  onRestore,
}: CategoryActionsProps) {
  if (category.archived) {
    return category.dateField === null ? (
      <RestoreButton
        aria-label="Restaurer la catégorie"
        disabled={isCategoryMutationPending}
        onClick={onRestore}
      />
    ) : null
  }
  return (
    <>
      <MoveButtons
        upLabel="Monter la catégorie"
        downLabel="Descendre la catégorie"
        upDisabled={!canMoveUp || isReorderPending}
        downDisabled={!canMoveDown || isReorderPending}
        onUp={onMoveUp}
        onDown={onMoveDown}
      />
      {category.dateField === null && (
        <>
          <ActionSeparator />
          <IconButton
            danger
            label="Supprimer la catégorie"
            title={
              hasActiveFields
                ? "Déplacez ou supprimez d'abord ses champs"
                : undefined
            }
            disabled={hasActiveFields || isCategoryMutationPending}
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </>
      )}
    </>
  )
}

interface FieldRowProps {
  field: ServiceField
  categoryId: string
  categoryArchived: boolean
  canManage: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isReorderPending: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  isUpdatePending: boolean
  onDelete: () => void
  onRestore: () => void
}

function FieldRowActions({
  field,
  categoryId,
  categoryArchived,
  canMoveUp,
  canMoveDown,
  isReorderPending,
  onMoveUp,
  onMoveDown,
  isUpdatePending,
  onDelete,
  onRestore,
}: Omit<FieldRowProps, 'canManage'>) {
  if (field.archived) {
    return categoryArchived ? (
      <span title="Restaurez d'abord sa catégorie">
        <RestoreButton disabled />
      </span>
    ) : (
      <RestoreButton disabled={isUpdatePending} onClick={onRestore} />
    )
  }
  return (
    <>
      <MoveButtons
        upDisabled={!canMoveUp || isReorderPending}
        downDisabled={!canMoveDown || isReorderPending}
        onUp={onMoveUp}
        onDown={onMoveDown}
      />
      <ActionSeparator />
      <ServiceFieldForm
        categoryId={categoryId}
        field={field}
        trigger={
          <IconButton label="Modifier">
            <Pencil className="w-4 h-4 text-text-dark" />
          </IconButton>
        }
      />
      <IconButton danger label="Supprimer" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
      </IconButton>
    </>
  )
}

function FieldRow({ canManage, ...props }: FieldRowProps) {
  const { field } = props
  const TypeIcon = SERVICE_FIELD_TYPE_ICONS[field.type]
  return (
    <SettingsRow
      deleted={field.archived}
      actions={canManage && <FieldRowActions {...props} />}
    >
      <span
        className={cn(
          'truncate text-[15px] font-medium',
          field.archived ? 'text-text-light' : 'text-foreground',
        )}
      >
        {field.label}
      </span>
      <Tag icon={<TypeIcon aria-hidden="true" className="w-[13px] h-[13px]" />}>
        {SERVICE_FIELD_TYPE_LABELS[field.type]}
      </Tag>
      {field.clinical && (
        <Tag
          variant="primary"
          icon={<Lock aria-hidden="true" className="w-3 h-3" />}
          title="Contenu clinique : masqué aux rôles Secrétariat et Lecture"
        >
          Clinique
        </Tag>
      )}
    </SettingsRow>
  )
}

function FichePatientSettings() {
  // L'URL se tape a la main : les actions d'ecriture se gardent aussi ici, pas que dans le menu.
  const canManage = useCan('referentials:write')
  const [showDeleted, setShowDeleted] = useState(false)
  const { fields } = useServiceFieldsQuery()
  const { categories } = useServiceFieldCategoriesQuery()
  const { update, reorder, updateCategory, reorderCategories } =
    useServiceFieldMutations()
  const [deleteFieldTarget, setDeleteFieldTarget] =
    useState<ServiceField | null>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] =
    useState<ServiceFieldCategory | null>(null)

  const activeCategories = categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order)
  // La bascule « Supprimés » révèle aussi les catégories supprimées, sinon leur « Restaurer » serait inatteignable.
  const shownCategories = [
    ...activeCategories,
    ...(showDeleted ? categories.filter((c) => c.archived) : []),
  ].sort((a, b) => a.order - b.order)

  const moveField = (
    categoryId: string,
    currentId: string,
    direction: 'up' | 'down',
  ) => {
    const active = fields.filter(
      (f) => f.categoryId === categoryId && !f.archived,
    )
    const index = active.findIndex((f) => f.id === currentId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= active.length) {
      return
    }
    // L'ordre envoye doit porter tous les identifiants de la categorie, actifs ET supprimes (back).
    const all = fields.filter((f) => f.categoryId === categoryId)
    const ids = all.map((f) => f.id)
    const i = ids.indexOf(currentId)
    const j = ids.indexOf(active[targetIndex].id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorder.mutate({ categoryId, ids })
  }

  const moveCategory = (currentId: string, direction: 'up' | 'down') => {
    const index = activeCategories.findIndex((c) => c.id === currentId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= activeCategories.length) {
      return
    }
    // Jeu complet envoye, categories supprimees comprises (back).
    const all = [...categories].sort((a, b) => a.order - b.order)
    const ids = all.map((c) => c.id)
    const i = ids.indexOf(currentId)
    const j = ids.indexOf(activeCategories[targetIndex].id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderCategories.mutate({ ids })
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-5 overflow-y-auto">
        <SettingsPageHeader
          title="Fiche patient"
          subtitle="Champs remplis sur la fiche de chaque patient du service."
          switchId="elements-supprimes"
          showDeleted={showDeleted}
          onShowDeletedChange={setShowDeleted}
          deletedCount={fields.filter((f) => f.archived).length}
          action={canManage && <AjouterCategorie />}
        />

        {showDeleted && (
          <DeletedBanner>
            Vous voyez les champs supprimés. Les patients qui les portent
            conservent leur valeur.
          </DeletedBanner>
        )}

        {shownCategories.map((category) => {
          const categoryId = category.id
          const shownFields = fields.filter(
            (f) => f.categoryId === categoryId && f.archived === showDeleted,
          )
          const activeInCategory = fields.filter(
            (f) => f.categoryId === categoryId && !f.archived,
          )
          const categoryIndex = activeCategories.findIndex(
            (c) => c.id === categoryId,
          )
          const n = activeInCategory.length

          return (
            <SettingsCard
              key={categoryId}
              title={category.label}
              onRename={
                canManage
                  ? (label) => updateCategory.mutate({ id: categoryId, label })
                  : undefined
              }
              renameLabel="Renommer la catégorie"
              inputLabel="Libellé de la catégorie"
              count={`${n} champ${n > 1 ? 's' : ''}`}
              actions={
                canManage && (
                  <CategoryActions
                    category={category}
                    canMoveUp={categoryIndex > 0}
                    canMoveDown={categoryIndex < activeCategories.length - 1}
                    isReorderPending={reorderCategories.isPending}
                    onMoveUp={() => moveCategory(categoryId, 'up')}
                    onMoveDown={() => moveCategory(categoryId, 'down')}
                    hasActiveFields={n > 0}
                    isCategoryMutationPending={updateCategory.isPending}
                    onDelete={() => setDeleteCategoryTarget(category)}
                    onRestore={() =>
                      updateCategory.mutate({ id: categoryId, archived: false })
                    }
                  />
                )
              }
              empty={
                shownFields.length === 0
                  ? showDeleted
                    ? 'Aucun champ supprimé'
                    : 'Aucun champ'
                  : undefined
              }
              footer={
                canManage &&
                !category.archived &&
                !showDeleted && (
                  <ServiceFieldForm
                    categoryId={categoryId}
                    trigger={
                      <CardFooterButton>Ajouter un champ</CardFooterButton>
                    }
                  />
                )
              }
            >
              <ul>
                {shownFields.map((f) => {
                  const index = activeInCategory.findIndex((x) => x.id === f.id)
                  return (
                    <FieldRow
                      key={f.id}
                      field={f}
                      categoryId={categoryId}
                      categoryArchived={category.archived}
                      canManage={canManage}
                      canMoveUp={index > 0}
                      canMoveDown={index < n - 1}
                      isReorderPending={reorder.isPending}
                      onMoveUp={() => moveField(categoryId, f.id, 'up')}
                      onMoveDown={() => moveField(categoryId, f.id, 'down')}
                      isUpdatePending={update.isPending}
                      onDelete={() => setDeleteFieldTarget(f)}
                      onRestore={() =>
                        update.mutate({ id: f.id, archived: false })
                      }
                    />
                  )
                })}
              </ul>
            </SettingsCard>
          )
        })}

        <ConfirmDeleteForm
          open={!!deleteFieldTarget}
          setOpen={(open) => {
            if (!open) {
              setDeleteFieldTarget(null)
            }
          }}
          onConfirm={() => {
            if (deleteFieldTarget) {
              update.mutate({ id: deleteFieldTarget.id, archived: true })
            }
            setDeleteFieldTarget(null)
          }}
          loading={update.isPending}
          title="Supprimer le champ"
          description="Il sort de la fiche. Les patients qui le portent conservent leur valeur, et il se restaure depuis le filtre « Supprimés »."
        />

        <ConfirmDeleteForm
          open={!!deleteCategoryTarget}
          setOpen={(open) => {
            if (!open) {
              setDeleteCategoryTarget(null)
            }
          }}
          onConfirm={() => {
            if (deleteCategoryTarget) {
              updateCategory.mutate({
                id: deleteCategoryTarget.id,
                archived: true,
              })
            }
            setDeleteCategoryTarget(null)
          }}
          loading={updateCategory.isPending}
          title="Supprimer la catégorie"
          description="Ses champs doivent déjà être déplacés ou supprimés. Elle se restaure depuis le filtre « Supprimés »."
        />
      </div>
    </DashboardLayout>
  )
}

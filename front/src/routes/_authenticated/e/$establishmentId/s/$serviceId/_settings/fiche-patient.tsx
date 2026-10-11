import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash,
  Undo2,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import ServiceFieldForm from '@/components/custom/popup/serviceFieldForm.tsx'
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
import { Switch } from '@/components/ui/switch.tsx'
import { SERVICE_FIELD_TYPE_LABELS } from '@/constants/serviceFieldTypes.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
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

interface CategoryHeaderProps {
  category: ServiceFieldCategory
  canManage: boolean
  isEditing: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onStartEdit: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
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

// En-tête d'un bloc catégorie, séparé pour garder la complexité de la liste de blocs sous le seuil Biome.
function CategoryHeader({
  category,
  canManage,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  canMoveUp,
  canMoveDown,
  isReorderPending,
  onMoveUp,
  onMoveDown,
  hasActiveFields,
  isCategoryMutationPending,
  onDelete,
  onRestore,
}: CategoryHeaderProps) {
  return (
    <div className="flex justify-between items-center gap-2">
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            autoFocus
            aria-label="Libellé de la catégorie"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                onCancelEdit()
              }
            }}
            onBlur={onCommitEdit}
            className="h-8 max-w-xs font-semibold text-foreground"
          />
        ) : (
          <h2
            data-testid="categorie-titre"
            className={`text-base font-semibold text-foreground ${
              canManage ? 'cursor-pointer' : ''
            }`}
            tabIndex={canManage ? 0 : undefined}
            onClick={() => canManage && onStartEdit()}
            onKeyDown={(e) => {
              if (canManage && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onStartEdit()
              }
            }}
          >
            {category.label}
          </h2>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canManage && !category.archived && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Monter la catégorie"
              disabled={!canMoveUp || isReorderPending}
              onClick={onMoveUp}
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Descendre la catégorie"
              disabled={!canMoveDown || isReorderPending}
              onClick={onMoveDown}
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </>
        )}

        {canManage && !category.archived && (
          <ServiceFieldForm categoryId={category.id} />
        )}

        {canManage &&
          category.dateField === null &&
          (category.archived ? (
            <Button
              variant="outline"
              size="sm"
              aria-label="Restaurer la catégorie"
              disabled={isCategoryMutationPending}
              onClick={onRestore}
            >
              <Undo2 className="w-4 h-4" />
              Restaurer
            </Button>
          ) : (
            <span
              title={
                hasActiveFields
                  ? "Déplacez ou supprimez d'abord ses champs"
                  : undefined
              }
            >
              <Button
                variant="outline"
                size="sm"
                aria-label="Supprimer la catégorie"
                disabled={hasActiveFields || isCategoryMutationPending}
                onClick={onDelete}
              >
                <Trash className="w-4 h-4" />
                Supprimer
              </Button>
            </span>
          ))}
      </div>
    </div>
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

// Une ligne de champ dans un bloc catégorie.
function FieldRow({
  field,
  categoryId,
  categoryArchived,
  canManage,
  canMoveUp,
  canMoveDown,
  isReorderPending,
  onMoveUp,
  onMoveDown,
  isUpdatePending,
  onDelete,
  onRestore,
}: FieldRowProps) {
  return (
    <li className="flex items-center gap-2 border border-border rounded px-3 py-2">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">{field.label}</span>
        <span className="text-text-light">
          {' '}
          — {SERVICE_FIELD_TYPE_LABELS[field.type]}
        </span>
        {field.clinical && (
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            Clinique
          </span>
        )}
      </div>

      {canManage && !field.archived && (
        <>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Monter"
            disabled={!canMoveUp || isReorderPending}
            onClick={onMoveUp}
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Descendre"
            disabled={!canMoveDown || isReorderPending}
            onClick={onMoveDown}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </>
      )}

      {canManage && (
        <ServiceFieldForm
          categoryId={categoryId}
          field={field}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="w-4 h-4" />
              Modifier
            </Button>
          }
        />
      )}

      {canManage &&
        (field.archived ? (
          categoryArchived ? (
            <span title="Restaurez d'abord sa catégorie">
              <Button variant="outline" size="sm" disabled>
                <Undo2 className="w-4 h-4" />
                Restaurer
              </Button>
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={isUpdatePending}
              onClick={onRestore}
            >
              <Undo2 className="w-4 h-4" />
              Restaurer
            </Button>
          )
        ) : (
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash className="w-4 h-4" />
            Supprimer
          </Button>
        ))}
    </li>
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  )
  const [editValue, setEditValue] = useState('')
  const skipBlurCommit = useRef(false)

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

  const startEditCategory = (category: ServiceFieldCategory) => {
    skipBlurCommit.current = false
    setEditingCategoryId(category.id)
    setEditValue(category.label)
  }

  const commitEditCategory = (category: ServiceFieldCategory) => {
    const trimmed = editValue.trim()
    setEditingCategoryId(null)
    // Libellé vide refusé : on referme simplement sans rien envoyer.
    if (trimmed && trimmed !== category.label) {
      updateCategory.mutate({ id: category.id, label: trimmed })
    }
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-y-auto">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-foreground text-xl font-semibold">
            Fiche patient
          </h1>
          <div className="flex items-center gap-4">
            {canManage && <AjouterCategorie />}
            <div className="flex items-center gap-2">
              <Switch
                id="elements-supprimes"
                checked={showDeleted}
                onCheckedChange={setShowDeleted}
              />
              <Label htmlFor="elements-supprimes">Supprimés</Label>
            </div>
          </div>
        </div>

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
          const isEditing = editingCategoryId === categoryId

          return (
            <div key={categoryId} className="flex flex-col gap-3">
              <CategoryHeader
                category={category}
                canManage={canManage}
                isEditing={isEditing}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={() => startEditCategory(category)}
                onCommitEdit={() => {
                  if (skipBlurCommit.current) {
                    skipBlurCommit.current = false
                    return
                  }
                  commitEditCategory(category)
                }}
                onCancelEdit={() => {
                  skipBlurCommit.current = true
                  setEditingCategoryId(null)
                }}
                canMoveUp={categoryIndex > 0}
                canMoveDown={categoryIndex < activeCategories.length - 1}
                isReorderPending={reorderCategories.isPending}
                onMoveUp={() => moveCategory(categoryId, 'up')}
                onMoveDown={() => moveCategory(categoryId, 'down')}
                hasActiveFields={activeInCategory.length > 0}
                isCategoryMutationPending={updateCategory.isPending}
                onDelete={() => setDeleteCategoryTarget(category)}
                onRestore={() =>
                  updateCategory.mutate({ id: categoryId, archived: false })
                }
              />

              <ul className="flex flex-col gap-2">
                {shownFields.length === 0 && (
                  <li className="text-sm text-text-light">
                    {showDeleted ? 'Aucun champ supprimé' : 'Aucun champ'}
                  </li>
                )}
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
                      canMoveDown={index < activeInCategory.length - 1}
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
            </div>
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

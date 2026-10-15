import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PdfDesignPresetApi } from '../api/pdfDesignPreset.api.ts'
import { PDF_DESIGN_PRESET } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { PdfDesignContent } from '../types/pdfDesign.ts'

// * QUERIES

export const usePdfDesignPresetQueries = (archived = false) => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_DESIGN_PRESET.GET_ALL, archived],
    queryFn: () => PdfDesignPresetApi.getAll(archived),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { presets: data ?? [], isPending, error }
}

// * MUTATIONS

// Aucune mise a jour optimiste : la liste est courte, les ecritures rares, et une
// invalidation suffit. C'est aussi ce qui evite le motif photographie/restauration que
// `src/test/lecture-directe-du-cache.test.ts` surveille.
export const usePdfDesignPresetMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalider = async () => {
    await queryClient.invalidateQueries({
      queryKey: [PDF_DESIGN_PRESET.GET_ALL],
    })
  }

  const avecToast = (titreSucces: string, titreErreur: string) => ({
    onSuccess: () => {
      toast({ title: titreSucces, severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error: Error) => {
      toast({
        title: titreErreur,
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  const createBlankPreset = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.CREATE],
    mutationFn: () => PdfDesignPresetApi.create({}),
    ...avecToast('Modèle créé', 'Erreur lors de la création'),
  })

  const duplicatePreset = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.CREATE],
    mutationFn: (sourcePresetId: string) =>
      PdfDesignPresetApi.create({ sourcePresetId }),
    ...avecToast('Modèle dupliqué', 'Erreur lors de la duplication'),
  })

  const renamePreset = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.UPDATE],
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      PdfDesignPresetApi.update({ id, name }),
    ...avecToast('Modèle renommé', 'Erreur lors du renommage'),
  })

  // Enregistrement de l'editeur : pas de toast de succes, il partirait a chaque sauvegarde.
  const saveContent = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.UPDATE],
    mutationFn: ({ id, content }: { id: string; content: PdfDesignContent }) =>
      PdfDesignPresetApi.update({ id, content }),
    onError: (error: Error) => {
      toast({
        title: "Erreur lors de l'enregistrement du modèle",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  const archivePreset = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.ARCHIVE],
    mutationFn: PdfDesignPresetApi.archive,
    ...avecToast('Modèle supprimé', 'Erreur lors de la suppression'),
  })

  const restorePreset = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.UPDATE],
    mutationFn: (id: string) =>
      PdfDesignPresetApi.update({ id, archived: false }),
    ...avecToast('Modèle restauré', 'Erreur lors de la restauration'),
  })

  // Pas de toast de succes : le deplacement se VOIT dans la liste, un toast par clic de
  // fleche serait du bruit. L'echec, lui, se dit — avec le message du serveur.
  const reorderPresets = useMutation({
    mutationKey: [PDF_DESIGN_PRESET.REORDER],
    mutationFn: PdfDesignPresetApi.reorder,
    onError: (error: Error) => {
      toast({
        title: 'Réordonnancement impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  return {
    createBlankPreset,
    duplicatePreset,
    renamePreset,
    saveContent,
    archivePreset,
    restorePreset,
    reorderPresets,
  }
}

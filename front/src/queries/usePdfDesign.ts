import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PdfDesignApi } from '../api/pdfDesign.api.ts'
import { PDF_DESIGN } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { PdfDesignContent } from '../types/pdfDesign.ts'
import type { CreatePdfDesignParams } from '../types/pdfDesignList.ts'

// * QUERIES

export const usePdfDesignQueries = (archived = false) => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_DESIGN.GET_ALL, archived],
    queryFn: () => PdfDesignApi.getAll(archived),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return {
    presets: data?.presets ?? [],
    designs: data?.designs ?? [],
    isPending,
    error,
  }
}

// * MUTATIONS

// Aucune mise a jour optimiste : la liste est courte, les ecritures rares, et une invalidation
// suffit. C'est aussi ce qui evite le motif photographie/restauration que
// `src/test/lecture-directe-du-cache.test.ts` surveille.
export const usePdfDesignMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalider = async () => {
    await queryClient.invalidateQueries({ queryKey: [PDF_DESIGN.GET_ALL] })
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

  // La SOURCE en parametre, pas un identifiant de preset : on duplique aussi bien un modele
  // livre (`sourcePresetId`) qu'un design deja fait du service (`sourceDesignId`).
  const duplicateDesign = useMutation({
    mutationKey: [PDF_DESIGN.CREATE],
    mutationFn: (source: CreatePdfDesignParams) => PdfDesignApi.create(source),
    ...avecToast('Design dupliqué', 'Erreur lors de la duplication'),
  })

  const createBlankDesign = useMutation({
    mutationKey: [PDF_DESIGN.CREATE],
    mutationFn: () => PdfDesignApi.create({}),
    ...avecToast('Design créé', 'Erreur lors de la création'),
  })

  const renameDesign = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      PdfDesignApi.update({ id, name }),
    ...avecToast('Design renommé', 'Erreur lors du renommage'),
  })

  // Enregistrement de l'editeur : pas de toast de succes, il partirait a chaque sauvegarde.
  const saveContent = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: ({ id, content }: { id: string; content: PdfDesignContent }) =>
      PdfDesignApi.update({ id, content }),
    onError: (error: Error) => {
      toast({
        title: "Erreur lors de l'enregistrement du design",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  const setDefaultDesign = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: (id: string) => PdfDesignApi.update({ id, isDefault: true }),
    ...avecToast('Design par défaut', 'Erreur lors du changement de défaut'),
  })

  const archiveDesign = useMutation({
    mutationKey: [PDF_DESIGN.ARCHIVE],
    mutationFn: PdfDesignApi.archive,
    ...avecToast('Design supprimé', 'Erreur lors de la suppression'),
  })

  const restoreDesign = useMutation({
    mutationKey: [PDF_DESIGN.RESTORE],
    mutationFn: (id: string) => PdfDesignApi.update({ id, archived: false }),
    ...avecToast('Design restauré', 'Erreur lors de la restauration'),
  })

  return {
    duplicateDesign,
    createBlankDesign,
    renameDesign,
    saveContent,
    setDefaultDesign,
    archiveDesign,
    restoreDesign,
  }
}

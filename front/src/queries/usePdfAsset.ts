import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { dataUri, PdfAssetApi } from '../api/pdfAsset.api.ts'
import { PDF_ASSET } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { SourcesImages } from '../types/pdfAsset.ts'

// * QUERIES

export const usePdfAssetQueries = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_ASSET.GET_ALL],
    queryFn: () => PdfAssetApi.getAll(),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { assets: data ?? [], isPending, error }
}

// Les octets d'une image ne changent jamais : une image se remplace, elle ne se modifie pas.
// `staleTime: Infinity` evite de les retelecharger a chaque rendu de la toile.
const requeteDOctets = (assetID: string) => ({
  queryKey: [PDF_ASSET.GET_BYTES, assetID],
  queryFn: () => PdfAssetApi.getBytes(assetID),
  staleTime: Number.POSITIVE_INFINITY,
  retry: 0,
})

// Un `useQueries` plutot que N appels : le nombre d'images varie d'un design a l'autre, et
// appeler un hook dans une boucle violerait les regles des hooks. Une image dont les octets
// manquent (supprimee, venue d'un autre service) est simplement absente du dictionnaire — les
// deux moteurs savent deja ne rien rendre dans ce cas.
export const useSourcesImages = (assetIDs: string[]): SourcesImages => {
  const resultats = useQueries({
    queries: assetIDs.map(requeteDOctets),
  })
  const sources: SourcesImages = {}
  resultats.forEach((resultat, rang) => {
    const id = assetIDs[rang]
    if (id && resultat.data) {
      sources[id] = dataUri(resultat.data)
    }
  })
  return sources
}

// * MUTATIONS

export const usePdfAssetMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalider = async () => {
    await queryClient.invalidateQueries({ queryKey: [PDF_ASSET.GET_ALL] })
  }

  const deposerImage = useMutation({
    mutationKey: [PDF_ASSET.CREATE],
    mutationFn: PdfAssetApi.create,
    onError: (error: Error) => {
      toast({
        title: "Erreur lors du dépôt de l'image",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  // Le serveur refuse en 409 et NOMME les designs concernes : son message vaut mieux que
  // n'importe quelle phrase generique ecrite ici.
  const supprimerImage = useMutation({
    mutationKey: [PDF_ASSET.DELETE],
    mutationFn: PdfAssetApi.remove,
    onSuccess: () => {
      toast({ title: 'Image supprimée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error: Error) => {
      toast({
        title: 'Suppression impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  return { deposerImage, supprimerImage }
}

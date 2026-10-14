import { useQuery } from '@tanstack/react-query'

import { PdfDesignApi } from '../api/pdfDesign.api.ts'
import { PDF_DESIGN } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'

export const usePdfDesignQueries = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_DESIGN.GET_ALL],
    queryFn: () => PdfDesignApi.getAll(),
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

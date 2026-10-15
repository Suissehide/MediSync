import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../../../store/useAuthStore.ts'
import type { Patient } from '../../../../types/patient.ts'
import ProgrammePDFModal from './programme-pdf-modal.tsx'

dayjs.extend(utc)

// `PDFDownloadLink` est une API WEB : sous jsdom, react-pdf charge son build node et leve.
// Le double reproduit exactement la condition dont le defaut a besoin — `loading: false`,
// c'est-a-dire « le blob est pret » — pendant que les octets, eux, sont encore en vol. Les
// autres noms ne sont mockes que parce qu'ils sont IMPORTES au chargement des modules ; le
// document n'est jamais rendu, il est passe en prop.
vi.mock('@react-pdf/renderer', () => ({
  PDFDownloadLink: ({
    children,
  }: {
    children: (etat: { loading: boolean }) => React.ReactNode
  }) => children({ loading: false }),
  PDFViewer: () => null,
  Document: () => null,
  Page: () => null,
  Text: () => null,
  View: () => null,
  Image: () => null,
  Svg: () => null,
  Ellipse: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: () => undefined },
}))

// REVUE DE BRANCHE. La modale est l'endroit qui produit le document REMIS AU PATIENT, et rien
// ne la montait. Son defaut : `PDFDownloadLink` n'expose que `loading`, qui ne parle que de la
// generation du blob — jamais des requetes d'octets en vol. Et le premier blob est rapide
// PRECISEMENT parce qu'il n'a aucune image a decoder. Une secretaire qui clique dans la
// seconde remet donc au patient un programme sans le logo ni le fond du service, sans aucun
// signe que quelque chose manquait.

const patient = {
  id: 'p1',
  firstName: 'Jean',
  lastName: 'DUPONT',
} as Patient

const designAvecImage = {
  id: 'd1',
  name: 'Programme',
  isDefault: true,
  content: {
    version: 1,
    pages: [
      {
        kind: 'canvas',
        id: 'p1',
        background: '#ffffff',
        elements: [
          {
            id: 'fond',
            kind: 'image',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            rotation: 0,
            source: { assetId: 'a1' },
            fit: 'cover',
          },
        ],
      },
    ],
  },
}

// `delaiOctets` tient la fenetre ouverte : sans lui, les octets arrivent avant la premiere
// assertion et le test serait vrai par vacuite — il passerait sans la correction.
const monter = (delaiOctets: number) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const chemin = new URL(input.toString()).pathname
    if (chemin.endsWith('/pdf-designs')) {
      return {
        ok: true,
        status: 200,
        url: input.toString(),
        json: async () => ({ presets: [], designs: [designAvecImage] }),
      }
    }
    if (chemin.endsWith('/pdf-assets/a1')) {
      return {
        ok: true,
        status: 200,
        url: input.toString(),
        json: async () => {
          await new Promise((r) => setTimeout(r, delaiOctets))
          return { mimeType: 'image/png', base64: 'AAAA' }
        },
      }
    }
    return {
      ok: true,
      status: 200,
      url: input.toString(),
      json: async () => [],
    }
  })
  vi.stubGlobal('fetch', fetchMock)

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgrammePDFModal
        patient={patient}
        onClose={vi.fn()}
        previewMode={false}
      />
    </QueryClientProvider>,
  )
}

const boutonTelecharger = () =>
  screen.getByRole('button', { name: /Télécharger|Génération|Images/ })

describe('ProgrammePDFModal', () => {
  beforeEach(() => {
    useAuthStore.setState({
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        serviceName: 'Cardio',
        establishmentRole: 'MEMBER',
        serviceRole: 'COORDINATEUR',
        soignantId: null,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('n autorise pas le telechargement tant que les octets des images ne sont pas arrives', async () => {
    monter(3000)

    await waitFor(() => {
      expect(boutonTelecharger()).toBeInTheDocument()
    })
    expect(boutonTelecharger()).toBeDisabled()
  })

  it('autorise le telechargement une fois les octets arrives', async () => {
    monter(0)

    await waitFor(
      () => {
        expect(boutonTelecharger()).toBeEnabled()
      },
      { timeout: 4000 },
    )
  })
})

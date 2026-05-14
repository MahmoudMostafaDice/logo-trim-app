import { create } from 'zustand'

export type ProcessingStatus = 'pending' | 'processing' | 'finished' | 'error'

export type LogoItem = {
  id: string
  file: File
  name: string
  size: number
  type: string
  lastModified: number
  originalPreviewUrl: string
  trimmedPreviewUrl?: string
  outputFormat: 'png' | 'svg'
  status: ProcessingStatus
  errorMessage?: string
  /** When true, this logo only uses Recraft image→image before local SVG trace (requires API server + token). */
  useRecraftBeforeSvg: boolean
  /** Per-logo smoothness level for raster-to-SVG tracing. */
  smoothness: number
  /** Force SVG conversion to a single detected brand color. */
  forceSingleColor: boolean
}

type LogoStore = {
  logos: LogoItem[]
  addFiles: (files: File[]) => void
  removeLogo: (id: string) => void
  clearAll: () => void
  setStatus: (id: string, status: ProcessingStatus, errorMessage?: string) => void
  setTrimmedResult: (id: string, trimmedPreviewUrl: string, outputFormat?: 'png' | 'svg') => void
  setUseRecraftBeforeSvg: (id: string, useRecraftBeforeSvg: boolean) => void
  setSmoothness: (id: string, smoothness: number) => void
  setForceSingleColor: (id: string, forceSingleColor: boolean) => void
}

const revokeLogoUrls = (logos: LogoItem[]) => {
  logos.forEach((logo) => {
    URL.revokeObjectURL(logo.originalPreviewUrl)
    if (logo.trimmedPreviewUrl) URL.revokeObjectURL(logo.trimmedPreviewUrl)
  })
}

export const useLogoStore = create<LogoStore>((set, get) => ({
  logos: [],
  addFiles: (files) => {
    const acceptedFiles = files.filter((file) => ['image/png', 'image/svg+xml'].includes(file.type))
    const newLogos = acceptedFiles.map<LogoItem>((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      originalPreviewUrl: URL.createObjectURL(file),
      outputFormat: 'png',
      status: 'pending',
      useRecraftBeforeSvg: false,
      smoothness: 60,
      forceSingleColor: false,
    }))

    set((state) => ({ logos: [...state.logos, ...newLogos] }))
  },
  removeLogo: (id) => {
    const logo = get().logos.find((item) => item.id === id)
    if (logo) {
      URL.revokeObjectURL(logo.originalPreviewUrl)
      if (logo.trimmedPreviewUrl) URL.revokeObjectURL(logo.trimmedPreviewUrl)
    }

    set((state) => ({ logos: state.logos.filter((item) => item.id !== id) }))
  },
  clearAll: () => {
    revokeLogoUrls(get().logos)
    set({ logos: [] })
  },
  setStatus: (id, status, errorMessage) => {
    set((state) => ({
      logos: state.logos.map((logo) =>
        logo.id === id
          ? {
              ...logo,
              status,
              errorMessage,
            }
          : logo,
      ),
    }))
  },
  setTrimmedResult: (id, trimmedPreviewUrl, outputFormat = 'png') => {
    set((state) => ({
      logos: state.logos.map((logo) => {
        if (logo.id !== id) return logo
        if (logo.trimmedPreviewUrl) URL.revokeObjectURL(logo.trimmedPreviewUrl)

        return {
          ...logo,
          trimmedPreviewUrl,
          outputFormat,
          status: 'finished',
          errorMessage: undefined,
        }
      }),
    }))
  },
  setUseRecraftBeforeSvg: (id, useRecraftBeforeSvg) => {
    set((state) => ({
      logos: state.logos.map((logo) => (logo.id === id ? { ...logo, useRecraftBeforeSvg } : logo)),
    }))
  },
  setSmoothness: (id, smoothness) => {
    const normalized = Math.max(0, Math.min(100, Math.round(smoothness)))
    set((state) => ({
      logos: state.logos.map((logo) => (logo.id === id ? { ...logo, smoothness: normalized } : logo)),
    }))
  },
  setForceSingleColor: (id, forceSingleColor) => {
    set((state) => ({
      logos: state.logos.map((logo) => (logo.id === id ? { ...logo, forceSingleColor } : logo)),
    }))
  },
}))

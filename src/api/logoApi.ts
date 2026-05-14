const SUPPORTED_TYPES = new Set(['image/png', 'image/svg+xml'])
const ALPHA_THRESHOLD = 8
const COLOR_DISTANCE_THRESHOLD = 18
export type SvgExportSizingMode = 'fixed-height' | 'fixed-width'

export type SvgExportOptions = {
  mode: SvgExportSizingMode
  size: number
  smoothness?: number
  forceSingleColor?: boolean
}

async function convertViaServer(blob: Blob, options?: Partial<SvgExportOptions>): Promise<Blob> {
  const form = new FormData()
  form.append('logo', blob, 'logo.png')
  if (options?.mode) form.append('mode', options.mode)
  if (options?.size != null) form.append('size', String(options.size))
  if (options?.smoothness != null) form.append('smoothness', String(options.smoothness))
  if (options?.forceSingleColor != null) {
    form.append('forceSingleColor', String(options.forceSingleColor))
  }

  let response: Response
  try {
    response = await fetch(`${getApiBaseUrl()}/api/vectorize`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new Error('SVG conversion requires the API server. Run `npm run server` and, in development, `npm run dev`.')
  }

  if (!response.ok) {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error(
        'The API server is not running or unreachable. Start LogSteak with `npm run dev` (runs the web app and API together) or run `npm run server` in a second terminal.',
      )
    }

    let message = `Server vectorization failed (${response.status}).`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) {
        message = body.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  const serverSvg = await response.blob()
  if (serverSvg.type !== 'image/svg+xml' && serverSvg.size === 0) {
    throw new Error('Server returned an empty SVG response.')
  }

  return serverSvg
}

function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE
  return typeof base === 'string' ? base.replace(/\/$/, '') : ''
}

export type RecraftRefineOptions = {
  /** Overrides the server default prompt for image→image. */
  prompt?: string
  /** 0–1; lower stays closer to the input (default on server ~0.22). */
  strength?: number
}

/**
 * Sends the trimmed PNG to your backend, which calls Recraft image→image (`recraftv3_vector`),
 * then returns the refined PNG for server-side SVG conversion. Requires `RECRAFT_API_TOKEN` on the server and the API running.
 */
export async function refineLogoWithRecraft(blob: Blob, options?: RecraftRefineOptions): Promise<Blob> {
  const form = new FormData()
  form.append('logo', blob, 'logo.png')
  if (options?.prompt) {
    form.append('prompt', options.prompt)
  }
  if (options?.strength != null && Number.isFinite(options.strength)) {
    form.append('strength', String(options.strength))
  }
  const url = `${getApiBaseUrl()}/api/recraft/refine`
  const response = await fetch(url, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    let message = `Recraft refine failed (${response.status}). Run the API server with RECRAFT_API_TOKEN, or check the proxy.`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) {
        message = body.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return response.blob()
}

function parseHexColor(hexColor: string) {
  const normalized = hexColor.trim().replace('#', '')
  const valid = /^[0-9a-fA-F]{6}$/.test(normalized)
  if (!valid) {
    throw new Error('Color must be a 6-digit hex value.')
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(imageUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('Unable to load image file.'))
    }
    image.src = imageUrl
  })
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(imageUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('The source image could not be decoded.'))
    }
    image.src = imageUrl
  })
}

async function createCanvasFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const image = await loadImageFromBlob(blob)
  const width = Math.max(1, image.naturalWidth || image.width)
  const height = Math.max(1, image.naturalHeight || image.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is unavailable in this browser.')
  }
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function getCornerBackgroundColor(imageData: ImageData) {
  const { width, height, data } = imageData
  const samplePositions = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ] as const

  let r = 0
  let g = 0
  let b = 0
  let count = 0

  samplePositions.forEach(([x, y]) => {
    const index = (y * width + x) * 4
    const alpha = data[index + 3]
    if (alpha <= ALPHA_THRESHOLD) return
    r += data[index]
    g += data[index + 1]
    b += data[index + 2]
    count += 1
  })

  if (count === 0) return null
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  }
}

function getVisibleBounds(imageData: ImageData) {
  const { width, height, data } = imageData
  const backgroundColor = getCornerBackgroundColor(imageData)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3]
      if (alpha <= ALPHA_THRESHOLD) continue

      if (backgroundColor) {
        const distance = colorDistance(
          data[index],
          data[index + 1],
          data[index + 2],
          backgroundColor.r,
          backgroundColor.g,
          backgroundColor.b,
        )
        if (distance <= COLOR_DISTANCE_THRESHOLD) continue
      }

      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function quantizeChannel(value: number) {
  return (value >> 4) & 0xf
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function isForegroundPixel(
  data: Uint8ClampedArray,
  index: number,
  backgroundColor: { r: number; g: number; b: number } | null,
) {
  const alpha = data[index + 3]
  if (alpha <= ALPHA_THRESHOLD) return false
  if (!backgroundColor) return true

  const distance = colorDistance(
    data[index],
    data[index + 1],
    data[index + 2],
    backgroundColor.r,
    backgroundColor.g,
    backgroundColor.b,
  )
  return distance > COLOR_DISTANCE_THRESHOLD
}

export function extractBrandColorHexFromImageData(imageData: ImageData): string {
  const backgroundColor = getCornerBackgroundColor(imageData)
  const { data } = imageData
  const buckets = new Map<number, number>()

  for (let i = 0; i < data.length; i += 4) {
    if (!isForegroundPixel(data, i, backgroundColor)) continue
    const key =
      (quantizeChannel(data[i]) << 8) | (quantizeChannel(data[i + 1]) << 4) | quantizeChannel(data[i + 2])
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  let winnerKey: number | null = null
  let winnerCount = -1
  for (const [key, count] of buckets) {
    if (count > winnerCount) {
      winnerCount = count
      winnerKey = key
    }
  }

  if (winnerKey == null) return '#000000'

  const r4 = (winnerKey >> 8) & 0xf
  const g4 = (winnerKey >> 4) & 0xf
  const b4 = winnerKey & 0xf
  return rgbToHex(r4 * 17, g4 * 17, b4 * 17)
}

export async function extractBrandColorHexFromBlob(blob: Blob): Promise<string> {
  const canvas = await createCanvasFromBlob(blob)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is unavailable in this browser.')
  }

  return extractBrandColorHexFromImageData(context.getImageData(0, 0, canvas.width, canvas.height))
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) {
    throw new Error('Failed to export trimmed image.')
  }
  return blob
}

export async function trimLogo(file: File): Promise<Blob> {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error('Only PNG and SVG files are supported.')
  }

  const image = await loadImageFromFile(file)
  const width = Math.max(1, image.naturalWidth || image.width)
  const height = Math.max(1, image.naturalHeight || image.height)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = width
  sourceCanvas.height = height

  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) {
    throw new Error('Canvas is unavailable in this browser.')
  }

  sourceContext.clearRect(0, 0, width, height)
  sourceContext.drawImage(image, 0, 0, width, height)

  const imageData = sourceContext.getImageData(0, 0, width, height)
  const bounds = getVisibleBounds(imageData)

  if (!bounds) {
    return canvasToBlob(sourceCanvas)
  }

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = bounds.width
  outputCanvas.height = bounds.height

  const outputContext = outputCanvas.getContext('2d')
  if (!outputContext) {
    throw new Error('Canvas is unavailable in this browser.')
  }

  outputContext.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  )

  return canvasToBlob(outputCanvas)
}

export async function convertTrimmedBlobToSvg(blob: Blob, options?: Partial<SvgExportOptions>): Promise<Blob> {
  return convertViaServer(blob, options)
}

export async function recolorTrimmedBlob(blob: Blob, hexColor: string): Promise<Blob> {
  const { r, g, b } = parseHexColor(hexColor)
  const canvas = await createCanvasFromBlob(blob)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is unavailable in this browser.')
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha <= ALPHA_THRESHOLD) continue
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
  context.putImageData(imageData, 0, 0)
  return canvasToBlob(canvas)
}

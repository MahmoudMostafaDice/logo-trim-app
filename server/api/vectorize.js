import { trace } from 'potrace'
import sharp from 'sharp'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/svg+xml'])
const ALPHA_THRESHOLD = 8
const COLOR_DISTANCE_THRESHOLD = 18

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function quantize(value) {
  return (value >> 4) & 0xf
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function getCornerBackgroundColor(data, width, height, channels) {
  const samplePositions = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ]

  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (const [x, y] of samplePositions) {
    const index = (y * width + x) * channels
    const alpha = data[index + 3]
    if (alpha <= ALPHA_THRESHOLD) continue
    r += data[index]
    g += data[index + 1]
    b += data[index + 2]
    count += 1
  }

  if (count === 0) return null
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  }
}

function isForegroundPixel(data, index, backgroundColor) {
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

function isOpaquePixel(data, index) {
  return data[index + 3] > ALPHA_THRESHOLD
}

function getDominantForegroundHex(data, width, height, channels, isForeground) {
  const buckets = new Map()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      if (!isForeground(index)) continue

      const key =
        (quantize(data[index]) << 8) | (quantize(data[index + 1]) << 4) | quantize(data[index + 2])
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
  }

  let winnerKey = null
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

function buildTraceMaskBuffer(data, width, height, channels, isForeground) {
  const mask = Buffer.alloc(width * height)
  let foregroundCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      const isFg = isForeground(index)
      mask[y * width + x] = isFg ? 0 : 255
      if (isFg) foregroundCount += 1
    }
  }

  return { mask, foregroundCount }
}

function traceBufferToSvg(buffer, options) {
  return new Promise((resolve, reject) => {
    trace(buffer, options, (error, svg) => {
      if (error) {
        reject(error)
        return
      }
      resolve(svg)
    })
  })
}

function stripSvgBackgroundRect(svg) {
  return svg.replace(/<rect[^>]*\/?>\s*/g, '')
}

/** Mean RGB of opaque pixels (for luminance → contrasting matte). */
function getMeanOpaqueRgb(data, width, height, channels) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      if (data[index + 3] <= ALPHA_THRESHOLD) continue
      r += data[index]
      g += data[index + 1]
      b += data[index + 2]
      n += 1
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 }
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  }
}

function countOpaquePixels(data, width, height, channels) {
  let n = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      if (data[index + 3] > ALPHA_THRESHOLD) n += 1
    }
  }
  return n
}

/**
 * Solid "logo" same color as corners: no fg/bg separation for tracing. Composite onto a
 * contrasting color and pad so sample corners sit on the matte (not on the logo).
 */
async function maybeApplyContrastingMatte(sourceBuffer) {
  const { data, info } = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const opaqueCount = countOpaquePixels(data, width, height, channels)
  if (opaqueCount === 0) return sourceBuffer

  const backgroundColor = getCornerBackgroundColor(data, width, height, channels)
  const backgroundAware = (index) => isForegroundPixel(data, index, backgroundColor)
  const { foregroundCount } = buildTraceMaskBuffer(data, width, height, channels, backgroundAware)

  if (foregroundCount > 0) return sourceBuffer

  const { r, g, b } = getMeanOpaqueRgb(data, width, height, channels)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  /** Light marks → dark matte; dark marks → white matte */
  const matte = lum >= 200 ? { r: 32, g: 32, b: 32, alpha: 255 } : { r: 255, g: 255, b: 255, alpha: 255 }

  const pad = Math.max(2, Math.round(Math.min(width, height) * 0.02))
  const newW = width + pad * 2
  const newH = height + pad * 2

  return sharp({
    create: {
      width: newW,
      height: newH,
      channels: 4,
      background: matte,
    },
  })
    .composite([{ input: sourceBuffer, left: pad, top: pad }])
    .png()
    .toBuffer()
}

async function prepareForTrace(sourceBuffer) {
  const { data, info } = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const backgroundColor = getCornerBackgroundColor(data, width, height, channels)

  const backgroundAware = (index) => isForegroundPixel(data, index, backgroundColor)
  const alphaOnly = (index) => isOpaquePixel(data, index)

  let isForeground = backgroundAware
  let { mask, foregroundCount } = buildTraceMaskBuffer(data, width, height, channels, isForeground)

  if (foregroundCount === 0 && backgroundColor) {
    isForeground = alphaOnly
    ;({ mask, foregroundCount } = buildTraceMaskBuffer(data, width, height, channels, isForeground))
  }

  const dominantHex = getDominantForegroundHex(data, width, height, channels, isForeground)
  const traceBuffer = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer()

  return { traceBuffer, dominantHex, foregroundCount }
}

export async function vectorizeLogoBuffer(file, { mode = 'fixed-height', size, smoothness } = {}) {
  if (!file) {
    throw new Error('No logo file uploaded.')
  }
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new Error('Only PNG and SVG files are supported.')
  }

  if (file.mimetype === 'image/svg+xml') {
    return file.buffer.toString('utf8')
  }

  const t =
    smoothness != null && !Number.isNaN(Number(smoothness))
      ? Math.max(0, Math.min(1, Number(smoothness) / 100))
      : 1
  const targetSize = size != null && !Number.isNaN(Number(size)) ? Math.max(1, Math.floor(Number(size))) : undefined
  let sourceBuffer = file.buffer
  if (targetSize) {
    sourceBuffer = await sharp(sourceBuffer)
      .resize(
        mode === 'fixed-width'
          ? { width: targetSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
          : { height: targetSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } },
      )
      .png()
      .toBuffer()
  }

  sourceBuffer = await maybeApplyContrastingMatte(sourceBuffer)
  const { traceBuffer, dominantHex, foregroundCount } = await prepareForTrace(sourceBuffer)
  if (foregroundCount === 0) {
    throw new Error('No visible pixels found to vectorize. The image looks empty or fully transparent.')
  }
  const svg = await traceBufferToSvg(traceBuffer, {
    turdSize: Math.max(1, Math.round(2 + (1 - t) * 6)),
    alphaMax: Number((0.35 + t * 0.75).toFixed(2)),
    optTolerance: Number((0.15 + t * 0.45).toFixed(2)),
    color: dominantHex,
    background: 'transparent',
    blackOnWhite: true,
  })

  return stripSvgBackgroundRect(svg)
}

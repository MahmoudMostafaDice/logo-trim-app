import sharp from 'sharp'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/svg+xml'])

export async function trimLogoBuffer(file) {
  if (!file) {
    throw new Error('No logo file uploaded.')
  }

  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new Error('Only PNG and SVG files are supported.')
  }

  const baseImage = sharp(file.buffer, { density: 300 })
  const metadata = await baseImage.metadata()

  const trimmed = baseImage.trim()

  if (metadata.format === 'svg') {
    return trimmed.png().toBuffer()
  }

  return trimmed.toBuffer()
}

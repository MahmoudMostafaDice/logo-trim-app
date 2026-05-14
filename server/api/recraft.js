/** Calls Recraft image→image (vector model) to produce a cleaner raster before local SVG tracing. */

const RECRAFT_API_BASE = 'https://external.api.recraft.ai/v1'

const DEFAULT_PROMPT =
  'Same logo and composition. Clean flat vector-style illustration, crisp smooth edges, solid flat colors, professional brand mark, no noise, isolated on white background.'

/**
 * @param {object} params
 * @param {Buffer} params.imageBuffer
 * @param {string} [params.prompt]
 * @param {number} [params.strength] 0–1, lower = closer to input
 * @param {string} [params.model]
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function recraftRefineToPng({
  imageBuffer,
  prompt = DEFAULT_PROMPT,
  strength = 0.22,
  model = 'recraftv3_vector',
}) {
  const token = process.env.RECRAFT_API_TOKEN
  if (!token) {
    const err = new Error('RECRAFT_API_TOKEN is not set. Add it in the environment for the API server.')
    err.statusCode = 503
    throw err
  }

  const formData = new FormData()
  formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'image.png')
  formData.append('prompt', prompt)
  formData.append('strength', String(strength))
  formData.append('model', model)

  const response = await fetch(`${RECRAFT_API_BASE}/images/imageToImage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`Recraft API ${response.status}: ${text.slice(0, 400)}`)
    err.statusCode = response.status
    throw err
  }

  const json = await response.json()
  const imageUrl = json?.data?.[0]?.url
  if (typeof imageUrl !== 'string' || !imageUrl) {
    throw new Error('Recraft returned no image URL in the response.')
  }

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) {
    throw new Error('Failed to download the image from Recraft.')
  }

  return Buffer.from(await imageRes.arrayBuffer())
}

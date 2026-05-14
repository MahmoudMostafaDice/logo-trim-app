import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import express from 'express'
import multer from 'multer'

import { recraftRefineToPng } from './api/recraft.js'
import { trimLogoBuffer } from './api/trim.js'
import { vectorizeLogoBuffer } from './api/vectorize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_ROOT = path.resolve(__dirname, '../dist/client')
const HAS_CLIENT = fs.existsSync(path.join(CLIENT_ROOT, 'index.html'))

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const PORT = Number(process.env.PORT) || 4000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  next()
})

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/trim', upload.single('logo'), async (req, res) => {
  try {
    const output = await trimLogoBuffer(req.file)
    res.setHeader('Content-Type', 'image/png')
    res.send(output)
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Image processing failed.',
    })
  }
})

app.post('/api/recraft/refine', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No logo file uploaded.' })
    }
    const prompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
      ? req.body.prompt.trim()
      : undefined
    const rawStrength = req.body?.strength
    const strength =
      rawStrength != null && rawStrength !== '' && !Number.isNaN(Number(rawStrength))
        ? Math.min(1, Math.max(0, Number(rawStrength)))
        : 0.22
    const output = await recraftRefineToPng({
      imageBuffer: req.file.buffer,
      prompt,
      strength,
    })
    res.setHeader('Content-Type', 'image/png')
    res.send(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recraft request failed.'
    const code = error && typeof error === 'object' && error.statusCode === 503 ? 503 : 400
    res.status(code).json({ message })
  }
})

app.post('/api/vectorize', upload.single('logo'), async (req, res) => {
  try {
    const mode = req.body?.mode === 'fixed-width' ? 'fixed-width' : 'fixed-height'
    const rawSize = req.body?.size
    const size =
      rawSize != null && rawSize !== '' && !Number.isNaN(Number(rawSize))
        ? Math.max(1, Math.floor(Number(rawSize)))
        : undefined
    const rawSmoothness = req.body?.smoothness
    const smoothness =
      rawSmoothness != null && rawSmoothness !== '' && !Number.isNaN(Number(rawSmoothness))
        ? Math.max(0, Math.min(100, Math.round(Number(rawSmoothness))))
        : undefined
    const svg = await vectorizeLogoBuffer(req.file, { mode, size, smoothness })
    res.setHeader('Content-Type', 'image/svg+xml')
    res.send(svg)
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'SVG conversion failed.',
    })
  }
})

if (HAS_CLIENT) {
  app.use(express.static(CLIENT_ROOT, { index: ['index.html'], fallthrough: true }))
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const ext = path.extname(req.path)
    if (ext && ext !== '.html') {
      res.status(404).type('text/plain').send('Not found')
      return
    }
    res.sendFile(path.join(CLIENT_ROOT, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
} else {
  app.get('/', (_, res) => {
    res.type('text/plain').send(
      'LogSteak API only — run `npm run build` then restart to serve the web app from this port. Health: GET /api/health\n',
    )
  })
}

app.listen(PORT, '0.0.0.0', () => {
  const mode = HAS_CLIENT ? 'web + API' : 'API only'
  console.log(`LogSteak (${mode}) → http://0.0.0.0:${PORT}`)
})

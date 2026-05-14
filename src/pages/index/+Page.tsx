import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid2'
import Switch from '@mui/material/Switch'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import JSZip from 'jszip'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'

import {
  convertTrimmedBlobToSvg,
  recolorTrimmedBlob,
  refineLogoWithRecraft,
  trimLogo,
  type SvgExportSizingMode,
} from '../../api/logoApi'
import { useLogoStore, type LogoItem } from '../../store/logoStore'

const statusColorMap = {
  pending: 'default',
  processing: 'warning',
  finished: 'success',
  error: 'error',
} as const

const getTrimmedFileName = (name: string) => {
  const dotIndex = name.lastIndexOf('.')
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name
  return `${baseName}-trimmed`
}

const isRasterLogo = (logo: Pick<LogoItem, 'type' | 'name'>) =>
  logo.type !== 'image/svg+xml' && !/\.svg$/i.test(logo.name)

const canConvertLogoToSvg = (logo: LogoItem) =>
  isRasterLogo(logo) &&
  logo.status === 'finished' &&
  Boolean(logo.trimmedPreviewUrl) &&
  logo.outputFormat !== 'svg'

/** Original file was SVG (trim produces PNG preview; we never run “Convert to SVG” on these). */
const isSvgSourceUpload = (logo: Pick<LogoItem, 'type' | 'name'>) =>
  logo.type === 'image/svg+xml' || /\.svg$/i.test(logo.name)

/** Recolor / resize need a raster to work from, or an exported SVG. SVG uploads only have PNG until these steps. */
const canRecolorOrResizeLogo = (logo: LogoItem) =>
  logo.status === 'finished' &&
  Boolean(logo.trimmedPreviewUrl) &&
  (logo.outputFormat === 'svg' || isSvgSourceUpload(logo))

export default function Page() {
  const {
    logos,
    addFiles,
    setStatus,
    setTrimmedResult,
    setUseRecraftBeforeSvg,
    removeLogo,
    clearAll,
  } = useLogoStore()
  const [svgDraftPreviews, setSvgDraftPreviews] = useState<Record<string, string>>({})
  const previewsRef = useRef<Record<string, string>>({})
  const [svgSizingMode, setSvgSizingMode] = useState<SvgExportSizingMode>('fixed-height')
  const [svgFixedSize, setSvgFixedSize] = useState<number>(512)
  const [bulkColorHex, setBulkColorHex] = useState<string>('#000000')

  useEffect(() => {
    previewsRef.current = svgDraftPreviews
  }, [svgDraftPreviews])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    setSvgDraftPreviews((prev) => {
      const next: Record<string, string> = {}
      for (const [id, url] of Object.entries(prev)) {
        const logo = logos.find((l) => l.id === id)
        if (!logo || logo.outputFormat === 'svg') {
          URL.revokeObjectURL(url)
        } else {
          next[id] = url
        }
      }
      if (
        Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every((id) => next[id] === prev[id])
      ) {
        return prev
      }
      return next
    })
  }, [logos])

  const svgAutoPreviewKey = useMemo(
    () =>
      logos
        .filter(
          (l) =>
            isRasterLogo(l) &&
            l.status === 'finished' &&
            Boolean(l.trimmedPreviewUrl) &&
            l.outputFormat !== 'svg',
        )
        .map((l) => `${l.id}:${l.trimmedPreviewUrl}:${l.useRecraftBeforeSvg}:${l.forceSingleColor}`)
        .sort()
        .join('|'),
    [logos],
  )

  useEffect(() => {
    const targets = logos.filter(
      (l) =>
        isRasterLogo(l) &&
        l.status === 'finished' &&
        Boolean(l.trimmedPreviewUrl) &&
        l.outputFormat !== 'svg',
    )
    if (targets.length === 0) return

    let cancelled = false

    void (async () => {
      await Promise.all(
        targets.map(async (logo) => {
          try {
            const trimmedBlob = await fetch(logo.trimmedPreviewUrl!).then((r) => r.blob())
            if (cancelled) return
            const rasterForSvg = logo.useRecraftBeforeSvg ? await refineLogoWithRecraft(trimmedBlob) : trimmedBlob
            if (cancelled) return
            const svgBlob = await convertTrimmedBlobToSvg(rasterForSvg, {
              forceSingleColor: logo.forceSingleColor,
            })
            if (cancelled) return
            const previewUrl = URL.createObjectURL(svgBlob)
            if (cancelled) {
              URL.revokeObjectURL(previewUrl)
              return
            }
            setSvgDraftPreviews((prev) => {
              const next = { ...prev }
              if (prev[logo.id]) URL.revokeObjectURL(prev[logo.id])
              next[logo.id] = previewUrl
              return next
            })
          } catch {
            /* keep trimmed raster visible if API is down */
          }
        }),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [svgAutoPreviewKey])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      addFiles(acceptedFiles)
    },
    [addFiles],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      'image/png': ['.png'],
      'image/svg+xml': ['.svg'],
    },
  })

  const canProcess = useMemo(
    () => logos.some((logo) => logo.status === 'pending' || logo.status === 'error'),
    [logos],
  )
  const readyToDownload = useMemo(
    () => logos.filter((logo) => logo.status === 'finished' && logo.trimmedPreviewUrl),
    [logos],
  )
  const canDownload = readyToDownload.length > 0
  const canConvertAllToSvg = useMemo(() => logos.some(canConvertLogoToSvg), [logos])
  const canRecolorAll = useMemo(() => logos.some(canRecolorOrResizeLogo), [logos])
  const canResizeAll = canRecolorAll
  const sizingLabel = svgSizingMode === 'fixed-height' ? 'Fixed Height (px)' : 'Fixed Width (px)'
  const totalCount = logos.length
  const processedCount = readyToDownload.length
  const svgCount = useMemo(
    () => logos.filter((logo) => logo.status === 'finished' && logo.outputFormat === 'svg').length,
    [logos],
  )
  const errorCount = useMemo(() => logos.filter((logo) => logo.status === 'error').length, [logos])

  const handleProcessAll = async () => {
    const pending = logos.filter((logo) => logo.status === 'pending' || logo.status === 'error')
    await Promise.all(
      pending.map(async (logo) => {
        try {
          setStatus(logo.id, 'processing')
          const blob = await trimLogo(logo.file)
          const trimmedPreviewUrl = URL.createObjectURL(blob)
          setTrimmedResult(logo.id, trimmedPreviewUrl, 'png')
        } catch (error) {
          setStatus(logo.id, 'error', error instanceof Error ? error.message : 'Unknown error')
        }
      }),
    )
  }

  const convertLogoToSvg = async (logoId: string) => {
    const logo = logos.find((item) => item.id === logoId)
    if (!logo || !canConvertLogoToSvg(logo)) {
      return
    }

    if (!logo.trimmedPreviewUrl) {
      return
    }

    try {
      setStatus(logo.id, 'processing')
      const trimmedBlob = await fetch(logo.trimmedPreviewUrl).then((response) => response.blob())
      const rasterForSvg = logo.useRecraftBeforeSvg ? await refineLogoWithRecraft(trimmedBlob) : trimmedBlob
      const svgBlob = await convertTrimmedBlobToSvg(rasterForSvg, {
        forceSingleColor: logo.forceSingleColor,
      })
      const svgPreviewUrl = URL.createObjectURL(svgBlob)
      setTrimmedResult(logo.id, svgPreviewUrl, 'svg')
    } catch (error) {
      setStatus(logo.id, 'error', error instanceof Error ? error.message : 'SVG conversion failed')
    }
  }

  const handleConvertAllToSvg = async () => {
    const candidates = logos.filter(canConvertLogoToSvg)
    await Promise.all(candidates.map(async (logo) => convertLogoToSvg(logo.id)))
  }

  const handleDownloadZip = async () => {
    if (!canDownload) return

    const zip = new JSZip()

    await Promise.all(
      readyToDownload.map(async (logo) => {
        if (!logo.trimmedPreviewUrl) return
        const response = await fetch(logo.trimmedPreviewUrl)
        const blob = await response.blob()
        const ext = logo.outputFormat === 'svg' ? 'svg' : 'png'
        zip.file(`${getTrimmedFileName(logo.name)}.${ext}`, blob)
      }),
    )

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const downloadUrl = URL.createObjectURL(zipBlob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = 'trimmed-logos.zip'
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const handleRecolorAll = async () => {
    const candidates = logos.filter(canRecolorOrResizeLogo)
    await Promise.all(
      candidates.map(async (logo) => {
        if (!logo.trimmedPreviewUrl) return
        try {
          setStatus(logo.id, 'processing')
          const currentBlob = await fetch(logo.trimmedPreviewUrl).then((response) => response.blob())
          const recoloredPng = await recolorTrimmedBlob(currentBlob, bulkColorHex)
          const rasterForSvg = logo.useRecraftBeforeSvg ? await refineLogoWithRecraft(recoloredPng) : recoloredPng
          const svgBlob = await convertTrimmedBlobToSvg(rasterForSvg, {
            mode: svgSizingMode,
            size: svgFixedSize,
            forceSingleColor: logo.forceSingleColor,
          })
          setTrimmedResult(logo.id, URL.createObjectURL(svgBlob), 'svg')
        } catch (error) {
          setStatus(logo.id, 'error', error instanceof Error ? error.message : 'Color update failed')
        }
      }),
    )
  }

  const handleResizeAll = async () => {
    const candidates = logos.filter(canRecolorOrResizeLogo)
    await Promise.all(
      candidates.map(async (logo) => {
        if (!logo.trimmedPreviewUrl) return
        try {
          setStatus(logo.id, 'processing')
          const currentBlob = await fetch(logo.trimmedPreviewUrl).then((response) => response.blob())
          const resizedSvg = await convertTrimmedBlobToSvg(currentBlob, {
            mode: svgSizingMode,
            size: svgFixedSize,
            forceSingleColor: logo.forceSingleColor,
          })
          setTrimmedResult(logo.id, URL.createObjectURL(resizedSvg), 'svg')
        } catch (error) {
          setStatus(logo.id, 'error', error instanceof Error ? error.message : 'Resize failed')
        }
      }),
    )
  }

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: 24 } }}>
          <Card
            sx={{
              background:
                'linear-gradient(145deg, rgba(124,58,237,0.45) 0%, rgba(30,41,59,0.9) 55%, rgba(17,24,39,0.95) 100%)',
              color: 'common.white',
              borderColor: 'rgba(167, 139, 250, 0.35)',
            }}
          >
            <CardContent>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    p: 0.875,
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 45%, #2563eb 100%)',
                    boxShadow: '0 2px 12px rgba(124, 58, 237, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                  }}
                >
                  <Box
                    component="img"
                    src="/logo.svg"
                    alt=""
                    sx={{
                      width: 34,
                      height: 34,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </Box>
                <Box>
                  <Typography fontWeight={800}>LogSteak</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                    Premium trim + vector workflow
                  </Typography>
                </Box>
              </Stack>
              <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.86)' }}>
                Prepare clean, scalable brand assets in minutes. Upload, trim whitespace, vectorize, recolor, then export.
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography fontWeight={700}>Core Workflow</Typography>
                <Typography variant="body2" color="text.secondary">
                  1. Upload source logos
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  2. Trim extra spacing
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  3. Convert to SVG
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  4. Apply custom SVG size
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  5. Recolor SVG
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  6. Export ZIP package
                </Typography>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip label={`${totalCount} Uploaded`} />
                <Chip color="success" label={`${processedCount} Ready`} />
                <Chip color="info" label={`${svgCount} SVG`} />
                {errorCount > 0 ? <Chip color="error" label={`${errorCount} Errors`} /> : null}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography fontWeight={700}>Step 4: Apply Custom Size</Typography>
                <Typography variant="body2" color="text.secondary">
                  Run after SVG conversion to resize all SVG outputs.
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  color="primary"
                  value={svgSizingMode}
                  onChange={(_, value: SvgExportSizingMode | null) => {
                    if (value) setSvgSizingMode(value)
                  }}
                >
                  <ToggleButton value="fixed-height">Fixed H</ToggleButton>
                  <ToggleButton value="fixed-width">Fixed W</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                  label={sizingLabel}
                  type="number"
                  size="small"
                  value={svgFixedSize}
                  onChange={(event) => {
                    const parsed = Number(event.target.value)
                    setSvgFixedSize(Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1)
                  }}
                  inputProps={{ min: 1, step: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Regular conversion is used by default. For low quality logos, enable AI refine on the logo card.
                </Typography>
                <Button variant="outlined" onClick={handleResizeAll} disabled={!canResizeAll}>
                  Apply Size to SVG
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography fontWeight={700}>Step 5: Recolor SVG</Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose color and apply recolor as a separate pass. Works on converted SVGs and on trimmed SVG uploads (PNG preview).
                </Typography>
                <TextField
                  label="SVG Color"
                  type="color"
                  size="small"
                  value={bulkColorHex}
                  onChange={(event) => setBulkColorHex(event.target.value)}
                />
                <Button variant="outlined" onClick={handleRecolorAll} disabled={!canRecolorAll}>
                  Recolor All SVG
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Grid>

      <Grid size={{ xs: 12, lg: 8 }}>
        <Stack spacing={2.5}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography fontWeight={700}>Upload Logos</Typography>
                <Box
                  {...getRootProps()}
                  sx={{
                    border: '2px dashed',
                    borderColor: isDragActive ? 'primary.main' : 'divider',
                    borderRadius: 3,
                    p: 5,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: isDragActive ? 'action.hover' : 'rgba(148,163,184,0.04)',
                    transition: 'all .2s ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <input {...getInputProps()} />
                  <Typography fontWeight={700} sx={{ mb: 0.5 }}>
                    {isDragActive ? 'Drop logos to start' : 'Drag and drop logos, or click to browse'}
                  </Typography>
                  <Typography color="text.secondary">Supported formats: PNG, SVG . Batch uploads supported.</Typography>
                </Box>
                <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    startIcon={<AutoFixHighRoundedIcon />}
                    onClick={handleProcessAll}
                    disabled={!canProcess}
                  >
                    Trim All
                  </Button>
                  <Button variant="outlined" onClick={handleConvertAllToSvg} disabled={!canConvertAllToSvg}>
                    Convert All to SVG
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<DownloadRoundedIcon />}
                    onClick={handleDownloadZip}
                    disabled={!canDownload}
                  >
                    Export ZIP
                  </Button>
                  <Button variant="text" color="inherit" onClick={clearAll}>
                    Clear All
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Recommended order: Trim All {'->'} Convert All to SVG {'->'} Apply Size {'->'} Recolor (optional) {'->'} Export ZIP.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {logos.length === 0 ? (
            <Card>
              <CardContent>
                <Typography color="text.secondary">
                  No files yet. Add PNG or SVG logos to preview trim and vector output side by side.
                </Typography>
              </CardContent>
            </Card>
          ) : null}

          <Grid container spacing={2}>
            {logos.map((logo) => (
              <Grid size={{ xs: 12 }} key={logo.id}>
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                        <Typography fontWeight={700}>{logo.name}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                          <Chip size="small" label={logo.status} color={statusColorMap[logo.status]} />
                          {logo.status === 'finished' && logo.outputFormat === 'svg' ? (
                            <Chip size="small" label="SVG" color="info" />
                          ) : null}
                          {isRasterLogo(logo) ? (
                            <FormControlLabel
                              sx={{ mr: 0, ml: 0 }}
                              control={
                                <Switch
                                  size="small"
                                  checked={logo.useRecraftBeforeSvg}
                                  onChange={(_, checked) => setUseRecraftBeforeSvg(logo.id, checked)}
                                  disabled={logo.status === 'processing'}
                                  color="primary"
                                />
                              }
                              label="AI refine"
                              title="Optional: refine this logo with Recraft before SVG (this file only)"
                            />
                          ) : null}
                          {/* <FormControlLabel
                            sx={{ mr: 0, ml: 0 }}
                            control={
                              <Switch
                                size="small"
                                checked={logo.forceSingleColor}
                                onChange={(_, checked) => setForceSingleColor(logo.id, checked)}
                                disabled={logo.status === 'processing'}
                                color="primary"
                              />
                            }
                            label="Solid brand color"
                            title="Force one dominant brand color to remove shade marks"
                          /> */}
                          {isRasterLogo(logo) ? (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={
                                logo.status !== 'finished' || !logo.trimmedPreviewUrl || logo.outputFormat === 'svg'
                              }
                              onClick={() => convertLogoToSvg(logo.id)}
                            >
                              Convert to SVG
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            color="inherit"
                            onClick={() => removeLogo(logo.id)}
                            startIcon={<DeleteOutlineRoundedIcon />}
                          >
                            Remove
                          </Button>
                        </Stack>
                      </Stack>

                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Original
                          </Typography>
                          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
                            <img
                              src={logo.originalPreviewUrl}
                              alt={`${logo.name} original`}
                              style={{ width: '100%', height: 180, objectFit: 'contain' }}
                            />
                          </Box>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Edited
                            {svgDraftPreviews[logo.id] ? (
                              <Typography component="span" variant="caption" sx={{ ml: 0.5, fontStyle: 'italic' }}>
                                (preview)
                              </Typography>
                            ) : null}
                          </Typography>
                          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
                            {svgDraftPreviews[logo.id] || logo.trimmedPreviewUrl ? (
                              <img
                                src={svgDraftPreviews[logo.id] ?? logo.trimmedPreviewUrl!}
                                alt={`${logo.name} edited`}
                                style={{ width: '100%', height: 180, objectFit: 'contain' }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  height: 180,
                                  display: 'grid',
                                  placeItems: 'center',
                                  color: 'text.secondary',
                                }}
                              >
                                <Typography variant="body2">Not processed yet</Typography>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      </Grid>

                      {logo.errorMessage ? (
                        <Typography variant="body2" color="error">
                          {logo.errorMessage}
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      </Grid>
    </Grid>
  )
}

import type { Config } from 'vike/types'
import vikeReact from 'vike-react/config'

export default {
  extends: [vikeReact],
  ssr: false,
  /** Emit static HTML so production can serve `dist/client` from Express. */
  prerender: true,
  title: 'LogSteak',
  description: 'Batch logo trim, SVG export, and brand recolor',
  favicon: '/favicon.svg?v=2',
} satisfies Config

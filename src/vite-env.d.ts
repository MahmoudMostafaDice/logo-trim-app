/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional origin for the Express API (e.g. `http://localhost:4000`). Leave unset when using the Vite dev proxy (`/api` → server). */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

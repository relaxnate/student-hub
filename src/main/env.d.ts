/// <reference types="electron-vite/node" />

// Environment variables available in the main and preload processes.
// Add any VITE_* variables here as they are added to .env.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

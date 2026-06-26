import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [
      // Mark all node_modules as external — they will be loaded at runtime, not bundled.
      // This is required for native modules like better-sqlite3.
      externalizeDepsPlugin()
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        // Explicitly keep better-sqlite3 external even in production
        external: ['better-sqlite3']
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    }
  },

  renderer: {
    plugins: [react()],
    // The renderer is sandboxed (contextIsolation on, nodeIntegration off) so there is no
    // `process` global. Vite/esbuild auto-replaces `process.env.NODE_ENV` during dep
    // optimization but leaves other `process.env.*` keys as bare `process` references.
    // react-draggable reads `process.env.DRAGGABLE_DEBUG`, which crashed the app with
    // "ReferenceError: process is not defined" (BUG-013). Statically replace it here.
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.DRAGGABLE_DEBUG': 'undefined'
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    }
  }
})

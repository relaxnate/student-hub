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
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The illustrations import the app's own wordmark, icons and provider marks
// from ../../../src and ../../../public, so they follow the app when it changes.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../..')

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@app': path.join(repo, 'src'),
      '@public': path.join(repo, 'public'),
      // The app's icon file re-exports lucide-react; resolve it from this package
      'lucide-react': path.join(here, 'node_modules/lucide-react'),
      react: path.join(here, 'node_modules/react'),
      'react-dom': path.join(here, 'node_modules/react-dom'),
    },
  },
  server: { port: 1492, strictPort: false, fs: { allow: [repo] } },
  logLevel: 'warn',
})

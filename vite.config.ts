import { defineConfig } from 'vite'
import { aiRelayPlugin } from './server/vite-ai-relay.mjs'

export default defineConfig({
  plugins: [aiRelayPlugin()],
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})

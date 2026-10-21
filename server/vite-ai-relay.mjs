import { Readable } from 'node:stream'
import { handleAiRelay } from './ai-relay.mjs'

export function aiRelayPlugin() {
  const prefix = '/__hud_api'
  const install = server => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith(`${prefix}/`)) { next(); return }
      const controller = new AbortController()
      res.on('close', () => { if (!res.writableEnded) controller.abort() })
      try {
        // A fixed local origin avoids trusting the incoming Host header.
        const request = new Request(new URL(req.url, 'http://localhost'), {
          method: req.method,
          headers: req.headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
          duplex: 'half', signal: controller.signal,
        })
        const response = await handleAiRelay(request, { prefix })
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        if (response.body) {
          const stream = Readable.fromWeb(response.body)
          stream.on('error', () => res.destroy())
          stream.pipe(res)
        } else res.end()
      } catch {
        if (res.headersSent) { res.destroy(); return }
        res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ error: { code: 'relay_error', message: 'Local relay failed. Restart npm run dev.' } }))
      }
    })
  }
  return { name: 'orbital-ai-relay', configureServer: install, configurePreviewServer: install }
}

import assert from 'node:assert/strict'
import { createServer } from 'vite'

// No personal key or chat data: an intentional 401 proves transport and error
// propagation work. It does not validate the user's key or generate a completion.
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
try {
  await server.listen()
  const { port } = server.httpServer.address()
  const response = await fetch(`http://127.0.0.1:${port}/__hud_api/openai/models`, {
    headers: { Authorization: 'Bearer invalid-relay-diagnostic-key' }, signal: AbortSignal.timeout(70_000),
  })
  const data = await response.json()
  assert.equal(response.status, 401, `Expected an OpenAI 401, received ${response.status}: ${data.error?.message ?? 'unknown response'}`)
  assert.equal(data.error?.code, 'invalid_api_key')
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  console.log('PASS: Vite relay reached OpenAI and returned its HTTP 401 over CORS. No real key or generated chat used.')
} finally {
  await server.close()
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { handleAiRelay } from './ai-relay.mjs'

const dummyKey = 'not-a-real-key'
const makeRequest = (path = '/openai/chat/completions', options = {}) => new Request(`https://relay.invalid${path}`, {
  method: 'POST', headers: { Authorization: `Bearer ${dummyKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'example', messages: [{ role: 'user', content: 'test' }] }), ...options,
})

test('WebView preflight works without credentials; unknown routes and missing credentials do not reach upstream', async () => {
  const fetchImpl = () => assert.fail('unexpected upstream request')
  const preflight = await handleAiRelay(makeRequest(undefined, { method: 'OPTIONS', body: undefined }), { fetchImpl })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)
  for (const [request, status] of [
    [makeRequest('/anything?url=https://internal.invalid'), 404],
    [makeRequest(undefined, { headers: {} }), 401],
    [makeRequest(undefined, { method: 'GET', body: undefined }), 405],
    [makeRequest('/tavily/search', { body: '{}' }), 401],
  ]) {
    const response = await handleAiRelay(request, { fetchImpl })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  }
})

test('API failures retain HTTP status, JSON, request ID, and CORS while dropping cookies', async () => {
  for (const status of [401, 403, 429, 500]) {
    const response = await handleAiRelay(makeRequest(), { fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions')
      assert.equal(options.headers.get('authorization'), `Bearer ${dummyKey}`)
      assert.equal(options.redirect, 'error')
      return Response.json({ error: { message: 'upstream error', code: 'example' } }, {
        status, headers: { 'set-cookie': 'must-not-forward', 'x-request-id': 'req_example', 'retry-after': '2' },
      })
    } })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('x-request-id'), 'req_example')
    assert.equal(response.headers.get('retry-after'), '2')
    assert.equal((await response.json()).error.code, 'example')
  }
})

test('voice multipart bytes and boundary survive forwarding; unrelated headers are stripped', async () => {
  const body = new FormData()
  body.append('file', new Blob([new Uint8Array([0, 1, 2, 255])], { type: 'audio/wav' }), 'voice.wav')
  body.append('model', 'example')
  const request = makeRequest('/openai/audio/transcriptions', {
    body, headers: { Authorization: `Bearer ${dummyKey}`, Cookie: 'never-forward', Origin: 'null' },
  })
  const expected = new Uint8Array(await request.clone().arrayBuffer())
  const response = await handleAiRelay(request, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions')
    assert.deepEqual(options.body, expected)
    assert.match(options.headers.get('content-type'), /multipart\/form-data; boundary=/)
    assert.equal(options.headers.get('cookie'), null)
    assert.equal(options.headers.get('origin'), null)
    return Response.json({ text: 'ok' })
  } })
  assert.equal((await response.json()).text, 'ok')
})

test('relay enforces payload limit before calling upstream', async () => {
  const response = await handleAiRelay(makeRequest(undefined, { body: 'x'.repeat(1024 * 1024 + 1) }), {
    fetchImpl: () => assert.fail('oversized request reached upstream'),
  })
  assert.equal(response.status, 413)
})

test('relay makes DNS and timeout errors readable over CORS', async () => {
  const dns = await handleAiRelay(makeRequest(), { fetchImpl: async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
  } })
  assert.equal(dns.status, 502)
  assert.equal((await dns.json()).error.code, 'upstream_dns')
  const timeout = await handleAiRelay(makeRequest(), { timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }) })
  assert.equal(timeout.status, 504)
  assert.equal((await timeout.json()).error.code, 'upstream_timeout')
  assert.equal(timeout.headers.get('access-control-allow-origin'), '*')
})

test('connection check and health routes perform no chat generation', async () => {
  let calls = 0
  const options = { prefix: '/__hud_api', fetchImpl: async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/models')
    assert.equal(init.method, 'GET')
    assert.equal(init.body, undefined)
    return Response.json({ data: [] })
  } }
  const health = await handleAiRelay(makeRequest('/__hud_api/health', { method: 'GET', body: undefined }), options)
  assert.equal((await health.json()).ok, true)
  assert.equal(calls, 0)
  const models = await handleAiRelay(makeRequest('/__hud_api/openai/models', { method: 'GET', body: undefined }), options)
  assert.equal(models.status, 200)
  assert.equal(calls, 1)
})

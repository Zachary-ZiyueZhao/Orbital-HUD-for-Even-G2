// Shared by the local Vite server and the deployable Worker. Upstreams are fixed;
// this relay never accepts an arbitrary destination or stores credentials.
import { handleLeetcodeRelay } from './leetcode-relay.mjs'
const ROUTES = {
  '/openai/responses': { method: 'POST', url: 'https://api.openai.com/v1/responses', maxBytes: 1024 * 1024 },
  '/openai/chat/completions': { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', maxBytes: 1024 * 1024 },
  '/openai/audio/transcriptions': { method: 'POST', url: 'https://api.openai.com/v1/audio/transcriptions', maxBytes: 26 * 1024 * 1024 },
  '/openai/realtime/client_secrets': { method: 'POST', url: 'https://api.openai.com/v1/realtime/client_secrets', maxBytes: 16 * 1024 },
  '/openai/models': { method: 'GET', url: 'https://api.openai.com/v1/models', maxBytes: 0 },
  '/tavily/search': { method: 'POST', url: 'https://api.tavily.com/search', maxBytes: 64 * 1024 },
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'x-request-id, Retry-After',
  'Access-Control-Max-Age': '600',
  'Cache-Control': 'no-store',
}

function failure(status, code, message) {
  return Response.json({ error: { code, message } }, { status, headers: CORS_HEADERS })
}

async function boundedBody(request, maxBytes) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new Error('body_too_large')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new Error('body_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

export async function handleAiRelay(request, { prefix = '', fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  const pathname = new URL(request.url).pathname
  if (prefix && !pathname.startsWith(`${prefix}/`)) return failure(404, 'not_found', 'Unknown relay route.')
  const path = pathname.slice(prefix.length)
  if (path.startsWith('/leetcode/')) return handleLeetcodeRelay(request, { prefix, fetchImpl, timeoutMs: Math.min(timeoutMs, 12_000) })
  if (path === '/health' && request.method === 'GET') {
    return Response.json({ ok: true, service: 'orbital-ai-relay' }, { headers: CORS_HEADERS })
  }
  const route = ROUTES[path]
  if (!route) return failure(404, 'not_found', 'Unknown relay route.')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== route.method) return failure(405, 'method_not_allowed', `Use ${route.method} for this route.`)

  const authorization = request.headers.get('authorization') ?? ''
  if (path.startsWith('/openai/') && !/^Bearer\s+\S+$/i.test(authorization)) {
    return failure(401, 'missing_api_key', 'Add your OpenAI API key in Settings.')
  }
  let body
  try {
    if (route.method === 'POST') body = await boundedBody(request, route.maxBytes)
  } catch (error) {
    return failure(error.message === 'body_too_large' ? 413 : 400, 'invalid_body', 'Request body is missing, too large, or could not be read.')
  }
  if (path === '/tavily/search') {
    try {
      const data = JSON.parse(new TextDecoder().decode(body))
      if (typeof data.api_key !== 'string' || !data.api_key.trim()) {
        return failure(401, 'missing_search_key', 'Add your Tavily Search API key in Settings.')
      }
    } catch {
      return failure(400, 'invalid_json', 'Search request must contain valid JSON.')
    }
  }
  const headers = new Headers()
  if (path.startsWith('/openai/')) headers.set('Authorization', authorization)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) controller.abort()
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const upstream = await fetchImpl(route.url, {
      method: route.method, headers, body, signal: controller.signal, redirect: 'error',
    })
    // Read under the same deadline; a stalled response body must also time out.
    const responseBody = await upstream.arrayBuffer()
    const responseHeaders = new Headers(CORS_HEADERS)
    for (const name of ['content-type', 'x-request-id', 'retry-after']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    return new Response(upstream.status === 204 || upstream.status === 304 ? null : responseBody, {
      status: upstream.status, headers: responseHeaders,
    })
  } catch (error) {
    const code = error?.cause?.code ?? error?.code
    if (timedOut || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      return failure(504, 'upstream_timeout', 'The relay timed out connecting to the API. Check the relay server network.')
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return failure(502, 'upstream_dns', 'The relay cannot resolve the API hostname. Check the relay server DNS and network.')
    }
    return failure(502, 'upstream_connection', 'The relay could not connect to the API. Check the relay server network, TLS, and firewall.')
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', abort)
  }
}

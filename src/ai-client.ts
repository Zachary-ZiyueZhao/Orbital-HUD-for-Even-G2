const RELAY_PATHS: Record<string, string> = {
  'https://api.openai.com/v1/responses': '/openai/responses',
  'https://api.openai.com/v1/chat/completions': '/openai/chat/completions',
  'https://api.openai.com/v1/audio/transcriptions': '/openai/audio/transcriptions',
  'https://api.openai.com/v1/realtime/client_secrets': '/openai/realtime/client_secrets',
  'https://api.openai.com/v1/models': '/openai/models',
  'https://api.tavily.com/search': '/tavily/search',
}

export class AiApiError extends Error {
  constructor(message: string, readonly status: number, readonly service: string, readonly code?: string) {
    super(message)
    this.name = 'AiApiError'
  }
}

export function resolveAiRoute(endpoint: string, relayBase: string) {
  let url: URL
  try { url = new URL(endpoint) } catch { throw new Error('Invalid API URL. Enter a full HTTPS address.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('API URL must use HTTPS and contain no credentials.')
  const relayPath = RELAY_PATHS[`${url.origin}${url.pathname.replace(/\/+$/, '')}`]
  if (!relayPath || !relayBase) return { url: url.href, relayed: false }
  const base = relayBase.trim().replace(/\/+$/, '')
  if (base !== '/__hud_api') {
    let relay: URL
    try { relay = new URL(base) } catch { throw new Error('Invalid AI relay URL. Enter your relay HTTPS address.') }
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash) {
      throw new Error('AI relay URL must use HTTPS and contain no credentials, query, or fragment.')
    }
  }
  return { url: `${base}${relayPath}`, relayed: true }
}

function redactDetail(text: string, init: RequestInit) {
  const authorization = new Headers(init.headers).get('authorization')
  const key = authorization?.replace(/^Bearer\s+/i, '')
  if (key) text = text.replaceAll(key, '[redacted]')
  return text.replace(/sk-[\w.*-]+/gi, '[redacted]').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

export async function requestAiApi(endpoint: string, init: RequestInit, options: { label: string; relayBase: string; timeoutMs?: number }) {
  const route = resolveAiRoute(endpoint, options.relayBase)
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  init.signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (init.signal?.aborted) controller.abort()
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 70_000)
  try {
    let response: Response
    try {
      response = await fetch(route.url, { ...init, credentials: 'omit', signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${options.label}: request timed out. Please try again.`)
      if (error instanceof TypeError) {
        const host = new URL(endpoint).host
        throw new Error(route.relayed
          ? `${options.label}: cannot reach the AI relay. Check its address and phone connection; restart the development server if using local mode.`
          : `${options.label}: no HTTP response from ${host}. Check the phone network and app permissions, or configure your AI relay.`)
      }
      throw error
    }
    if (!response.ok) {
      const raw = await response.text()
      let detail = raw
      let code: string | undefined
      try {
        const data = JSON.parse(raw) as { error?: { message?: string; code?: string } | string; message?: string }
        detail = typeof data.error === 'string' ? data.error : data.error?.message || data.message || raw
        if (typeof data.error === 'object') code = data.error?.code
      } catch { /* Gateways may return plain text or HTML. */ }
      if (response.status === 401 && code === 'invalid_api_key' && new URL(endpoint).origin === 'https://api.openai.com') {
        throw new AiApiError(`${options.label} (401): OpenAI rejected this key. Paste a complete, active OpenAI API key.`, 401, options.label, code)
      }
      const hint = response.status === 401 ? 'Check the API key.'
        : response.status === 403 ? 'Check API permissions and regional availability.'
        : response.status === 429 ? 'Check API quota, billing, or rate limits.' : ''
      throw new AiApiError(`${options.label} (${response.status}): ${hint} ${redactDetail(detail, init)}`.trim(), response.status, options.label, code)
    }
    // Consume JSON before clearing the deadline so stalled bodies cannot hang chat.
    try {
      return await response.json() as unknown
    } catch {
      if (controller.signal.aborted) throw new Error(`${options.label}: request timed out. Please try again.`)
      throw new Error(`${options.label}: the API returned an invalid JSON response.`)
    }
  } finally {
    window.clearTimeout(timer)
    init.signal?.removeEventListener('abort', abortFromCaller)
  }
}

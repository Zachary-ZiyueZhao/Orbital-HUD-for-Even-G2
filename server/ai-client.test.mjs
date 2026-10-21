import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the actual TypeScript client without requiring a DOM or extra runner.
const source = await readFile(new URL('../src/ai-client.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
const { AiApiError, requestAiApi, resolveAiRoute } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const chatSource = await readFile(new URL('../src/ai-chat.ts', import.meta.url), 'utf8')
const chatJs = ts.transpileModule(chatSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { normalizeApiKey, normalizeChatUrl, buildChatPayload, AI_REPLY_TOKENS } = await import(`data:text/javascript;base64,${Buffer.from(chatJs).toString('base64')}`)
globalThis.window = { setTimeout, clearTimeout }

test('official hosts relay while custom hosts stay direct; insecure relay addresses are rejected', () => {
  assert.equal(resolveAiRoute('https://api.openai.com/v1/chat/completions', '/__hud_api').url, '/__hud_api/openai/chat/completions')
  assert.equal(resolveAiRoute('https://api.openai.com/v1/models', 'https://relay.invalid/').url, 'https://relay.invalid/openai/models')
  assert.equal(resolveAiRoute('https://api.tavily.com/search', '/__hud_api').url, '/__hud_api/tavily/search')
  assert.equal(resolveAiRoute('https://custom.invalid/v1/chat/completions', '/__hud_api').relayed, false)
  assert.equal(resolveAiRoute('https://api.openai.com/v1/chat/completions', '').relayed, false)
  assert.throws(() => resolveAiRoute('https://api.openai.com/v1/models', 'http://untrusted.invalid'), /HTTPS/)
})

test('client preserves real status while redacting credentials and does not retry POST', async t => {
  const key = 'nonsecret-test-credential'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++
    assert.equal(url, '/__hud_api/openai/chat/completions')
    assert.equal(init.credentials, 'omit')
    return Response.json({ error: { message: `Invalid credential ${key}` } }, { status: 401 })
  })
  await assert.rejects(requestAiApi('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: '{}',
  }, { label: 'Chat API', relayBase: '/__hud_api' }), error => {
    assert.match(error.message, /Chat API \(401\)/)
    assert.equal(error.message.includes(key), false)
    return true
  })
  assert.equal(calls, 1)
})

test('client deadline also covers a stalled response body', async t => {
  t.mock.method(globalThis, 'fetch', async (_, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }) },
  })))
  await assert.rejects(requestAiApi('https://api.openai.com/v1/models', {}, {
    label: 'AI connection', relayBase: '/__hud_api', timeoutMs: 5,
  }), /request timed out/)
})

test('pasted header wrappers and line breaks are removed without changing actual key characters', () => {
  assert.equal(normalizeApiKey(' Authorization: Bearer "sk-proj-example\r\n_DUMMY-123" '), 'sk-proj-example_DUMMY-123')
  assert.equal(normalizeApiKey("'Bearer sk-example_DUMMY-123'"), 'sk-example_DUMMY-123')
  assert.equal(normalizeApiKey('sk-\u200Bexample_DUMMY-123'), 'sk-example_DUMMY-123')
  assert.equal(normalizeApiKey('sk-example_DUMMY-123'), 'sk-example_DUMMY-123')
  assert.equal(normalizeApiKey(''), '')
  assert.equal(normalizeChatUrl(' https://api.openai.com/v1/ '), 'https://api.openai.com/v1/chat/completions')
  assert.equal(normalizeChatUrl('https://example.invalid/v1?route=example'), 'https://example.invalid/v1/chat/completions?route=example')
})

test('lightweight history budget retains the full latest question and bounds search and output', () => {
  const latest = 'Current question '.repeat(150)
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'old context '.repeat(100) }))
  history.push({ role: 'user', content: latest })
  const result = buildChatPayload('gpt-4o-mini', 'https://api.openai.com/v1/chat/completions', history, 'search '.repeat(1000))
  assert.equal(result.messages.at(-1).content, latest)
  assert.equal(result.messages[1].role, 'user')
  assert.ok(result.messages.length <= 9)
  assert.ok(result.messages.slice(1).reduce((total, message) => total + message.content.length, 0) <= 6000)
  assert.ok(result.messages[0].content.length < 3400)
  assert.equal(result.max_completion_tokens, AI_REPLY_TOKENS)
  assert.equal(buildChatPayload('custom', 'https://example.invalid/v1/chat/completions', [{ role: 'user', content: latest }]).max_tokens, AI_REPLY_TOKENS)
})

test('rejected OpenAI credentials become a short typed error without echoing key text', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'invalid_api_key', message: 'Incorrect key: secret-must-not-appear' } }, { status: 401 }))
  await assert.rejects(requestAiApi('https://api.openai.com/v1/models', {}, {
    label: 'AI connection', relayBase: '/__hud_api',
  }), error => {
    assert.ok(error instanceof AiApiError)
    assert.equal(error.status, 401)
    assert.equal(error.code, 'invalid_api_key')
    assert.equal(error.service, 'AI connection')
    assert.equal(error.message.includes('secret-must-not-appear'), false)
    assert.match(error.message, /complete, active OpenAI API key/)
    return true
  })
})

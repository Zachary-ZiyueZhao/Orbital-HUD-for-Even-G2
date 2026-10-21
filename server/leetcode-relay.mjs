const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store' }
const QUERY = 'query OrbitalDaily { activeDailyCodingChallengeQuestion { date question { questionFrontendId title titleSlug content isPaidOnly difficulty stats } } }'

export async function handleLeetcodeRelay(request, { prefix = '', fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const url = new URL(request.url)
  const path = url.pathname.slice(prefix.length)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET') return new Response('Use GET', { status: 405, headers: CORS })
  let target
  if (path === '/leetcode/daily') target = `https://leetcode.com/graphql?query=${encodeURIComponent(QUERY)}`
  else if (path === '/leetcode/image') {
    try {
      const image = new URL(url.searchParams.get('url'))
      if (image.protocol !== 'https:' || image.hostname !== 'assets.leetcode.com' || image.port || image.username || image.password
        || !image.pathname.startsWith('/uploads/')) throw new Error('Invalid image')
      target = image.href
    } catch { return new Response('Unsupported problem image', { status: 400, headers: CORS }) }
  } else return new Response('Unknown route', { status: 404, headers: CORS })
  const controller = new AbortController()
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const upstream = await fetchImpl(target, { signal: controller.signal, redirect: 'error', headers: { Accept: path.endsWith('daily') ? 'application/json' : 'image/*' } })
    if (!upstream.ok) return new Response('LeetCode unavailable', { status: upstream.status, headers: CORS })
    const type = upstream.headers.get('content-type') ?? ''
    if (path.endsWith('image') && !/^image\/(png|jpeg|webp|gif)\b/i.test(type)) return new Response('Unsupported image', { status: 415, headers: CORS })
    const reader = upstream.body.getReader(), chunks = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4 * 1024 * 1024) { await reader.cancel(); return new Response('Response too large', { status: 413, headers: CORS }) }
      chunks.push(value)
    }
    return new Response(new Blob(chunks), { headers: { ...CORS, 'Content-Type': type } })
  } catch { return new Response('Cannot reach LeetCode', { status: 502, headers: CORS }) }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort) }
}

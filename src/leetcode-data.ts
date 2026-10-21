export const LEETCODE_DAILY_QUERY = 'query OrbitalDaily { activeDailyCodingChallengeQuestion { date question { questionFrontendId title titleSlug content isPaidOnly difficulty stats } } }'
export const LEETCODE_CACHE_KEY = 'orbital-leetcode-daily-v1'
export type DailyProblem = { date: string; number: string; title: string; slug: string; html: string; url: string; fetchedAt: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | null; accepted: number | null; submissions: number | null; acceptanceRate: number | null }

export function problemStatistics(question: { difficulty?: unknown; stats?: unknown; acRate?: unknown }) {
  let stats: any = question.stats
  if (typeof stats === 'string') { try { stats = JSON.parse(stats) } catch { stats = null } }
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  const accepted = count(stats?.totalAcceptedRaw), submissions = count(stats?.totalSubmissionRaw)
  const rawRate = stats?.acRate ?? question.acRate
  const parsedRate = typeof rawRate === 'number' ? rawRate
    : typeof rawRate === 'string' && /^\d+(?:\.\d+)?%?$/.test(rawRate.trim()) ? Number(rawRate.trim().replace('%', '')) : NaN
  const acceptanceRate = Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 100 ? parsedRate
    : accepted !== null && submissions !== null && submissions > 0 && accepted <= submissions ? accepted / submissions * 100 : null
  const difficulty = ['Easy', 'Medium', 'Hard'].includes(question.difficulty as string) ? question.difficulty as DailyProblem['difficulty'] : null
  return { difficulty, accepted, submissions, acceptanceRate }
}

export function normalizeDailyProblem(value: unknown, now = Date.now()): DailyProblem {
  const data = value as any
  const daily = data?.data?.activeDailyCodingChallengeQuestion
    ?? (data?.question && typeof data.question === 'object' ? data : null)
  const question = daily?.question ?? data
  const date = daily?.date ?? data?.date
  const number = question?.questionFrontendId
  const title = question?.title ?? question?.questionTitle
  const slug = question?.titleSlug
  const html = question?.content ?? question?.question
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
    || typeof number !== 'string' || !/^\d{1,8}$/.test(number)
    || typeof title !== 'string' || !title.trim() || title.length > 500
    || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Invalid daily challenge response. Tap to retry.')
  }
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error(question?.isPaidOnly ? 'This statement requires LeetCode access. Open the original on your phone.' : 'Statement unavailable. Tap to retry.')
  }
  if (html.length > 500_000) throw new Error('Statement is too large. Open LeetCode on your phone.')
  return { date, number, title: title.trim(), slug, html, url: `https://leetcode.com/problems/${slug}/`, fetchedAt: now, ...problemStatistics(question) }
}

export function restoreDailyProblem(raw: string | null): DailyProblem | null {
  try {
    const saved = JSON.parse(raw ?? 'null')
    const problem = normalizeDailyProblem({ date: saved.date, questionFrontendId: saved.number,
      title: saved.title, titleSlug: saved.slug, content: saved.html, difficulty: saved.difficulty,
      stats: { totalAcceptedRaw: saved.accepted, totalSubmissionRaw: saved.submissions, acRate: saved.acceptanceRate } }, saved.fetchedAt)
    return Number.isFinite(problem.fetchedAt) ? problem : null
  } catch { return null }
}

export function safeProblemImage(value: string): string | null {
  if (!value.trim()) return null
  try {
    const url = new URL(value, 'https://leetcode.com')
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['assets.leetcode.com', 'leetcode.com'].includes(url.hostname)) return null
    return url.href
  } catch { return null }
}

export async function fetchDailyProblem(relayBase = '', fetchImpl: typeof fetch = fetch): Promise<DailyProblem> {
  // The public read-only mirror supports CORS in installed WebViews. Development
  // and configured relays query LeetCode itself; no AI credentials are sent.
  const urls = [
    ...(relayBase ? [`${relayBase.replace(/\/+$/, '')}/leetcode/daily`] : []),
    'https://leetcode-api-pied.vercel.app/daily',
    'https://alfa-leetcode-api.onrender.com/daily',
    `https://leetcode.com/graphql?query=${encodeURIComponent(LEETCODE_DAILY_QUERY)}`,
  ]
  let lastError: unknown
  let serviceError: Error | undefined
  for (const url of urls) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetchImpl(url, { credentials: 'omit', signal: controller.signal, cache: 'no-store' })
      if (!response.ok) {
        serviceError = new Error(response.status === 429 ? 'Daily service is rate limited (429). Try again later.' : `LeetCode request failed (${response.status}). Tap to retry.`)
        throw serviceError
      }
      const problem = normalizeDailyProblem(await response.json())
      if (problem.accepted === null || problem.submissions === null) {
        // This mirror's /daily omits counts; its matching problem endpoint
        // returns the official stats object. Failure never hides the statement.
        const detailController = new AbortController()
        const detailTimer = setTimeout(() => detailController.abort(), 6_000)
        try {
          const detail = await fetchImpl(`https://leetcode-api-pied.vercel.app/problem/${problem.slug}`, {
            credentials: 'omit', signal: detailController.signal, cache: 'no-store',
          })
          if (detail.ok) {
            const question = await detail.json()
            const sameTitle = question?.titleSlug ? question.titleSlug === problem.slug : question?.title === problem.title
            if (sameTitle && question?.questionFrontendId === problem.number) {
              const stats = problemStatistics(question)
              problem.difficulty = stats.difficulty ?? problem.difficulty
              problem.accepted = stats.accepted ?? problem.accepted
              problem.submissions = stats.submissions ?? problem.submissions
              problem.acceptanceRate = stats.acceptanceRate ?? problem.acceptanceRate
            }
          }
        } catch { /* Counts may be unavailable while the statement is readable. */ }
        finally { clearTimeout(detailTimer) }
      }
      return problem
    } catch (error) { lastError = error } finally { clearTimeout(timer) }
  }
  if (serviceError) throw serviceError
  throw new Error(lastError instanceof Error && !['TypeError', 'AbortError'].includes(lastError.name)
    ? lastError.message : 'Cannot load LeetCode. Check your network and tap to retry.')
}

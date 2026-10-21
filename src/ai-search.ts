import { AI_REPLY_TOKENS, buildChatPayload, type AiChatMessage } from './ai-chat'

export const OPENAI_SEARCH_ENDPOINT = 'https://api.openai.com/v1/responses'
export type AiCitation = { start: number; end: number; url: string; title: string }
type SearchAnnotation = { type?: string; start_index?: number; end_index?: number; url?: string; title?: string }
type SearchContent = { type?: string; text?: string; annotations?: SearchAnnotation[] }
type SearchResponse = {
  error?: { message?: string }
  output?: Array<{ type?: string; role?: string; status?: string; content?: SearchContent[] }>
}

export function buildOpenAiSearchPayload(model: string, history: AiChatMessage[], todoContext = '') {
  const { messages } = buildChatPayload(model, OPENAI_SEARCH_ENDPOINT, history, '', todoContext)
  return {
    model, store: false, max_output_tokens: AI_REPLY_TOKENS,
    instructions: `${messages[0].content}\nUse web search when current information or source verification is needed. Do not claim to have searched unless you used the web search tool. Keep source citations in your answer.`,
    input: messages.slice(1), tools: [{ type: 'web_search' }], tool_choice: 'auto',
  }
}

export function parseOpenAiSearchResponse(value: unknown) {
  const response = value as SearchResponse | null
  if (response?.error) throw new Error(`OpenAI web search: ${response.error.message || 'Request failed.'}`)
  const output = Array.isArray(response?.output) ? response.output : []
  let text = ''
  const citations: AiCitation[] = []
  const sources = new Map<string, number>()
  // Replace tool citation tokens with compact references for the glasses;
  // preserve their exact spans so the phone can display clickable citations.
  const clean = (content: string, marker = '') => content.replace(/\uE200[\s\S]*?\uE201/g, marker)
  for (const item of output) {
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (part.type !== 'output_text' || typeof part.text !== 'string') continue
      if (text) text += '\n\n'
      const raw = part.text
      const annotations = (Array.isArray(part.annotations) ? part.annotations : [])
        .filter(annotation => annotation.type === 'url_citation' && typeof annotation.url === 'string'
          && Number.isInteger(annotation.start_index) && Number.isInteger(annotation.end_index)
          && annotation.start_index! >= 0 && annotation.end_index! >= annotation.start_index!
          && annotation.end_index! <= raw.length)
        .sort((a, b) => a.start_index! - b.start_index!)
      let cursor = 0
      for (const annotation of annotations) {
        const start = annotation.start_index!, end = annotation.end_index!
        if (start < cursor) continue
        let url: URL
        try { url = new URL(annotation.url!) } catch { continue }
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) continue
        if (!sources.has(url.href)) sources.set(url.href, sources.size + 1)
        const marker = `[${sources.get(url.href)}]`
        text += clean(raw.slice(cursor, start))
        const citationStart = text.length
        text += clean(raw.slice(start, end), marker) || marker
        citations.push({ start: citationStart, end: text.length, url: url.href,
          title: annotation.title || url.hostname })
        cursor = end
      }
      text += clean(raw.slice(cursor))
    }
  }
  if (!text.trim()) throw new Error('OpenAI returned no answer. Check that your selected model supports Responses web search and has enough output tokens.')
  return { text, citations, searched: output.some(item => item.type === 'web_search_call' && item.status === 'completed') }
}

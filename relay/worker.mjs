import { handleAiRelay } from '../server/ai-relay.mjs'

export default { fetch: request => handleAiRelay(request) }

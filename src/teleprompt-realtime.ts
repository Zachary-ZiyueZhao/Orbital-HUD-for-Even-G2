import { requestAiApi } from './ai-client'
import type { FollowApiSettings } from './teleprompt-api'

type Turn = { revision: number; capturedAt: number; lastAudioAt: number; voiced: boolean; voicedMs: number; order: number }
export type LiveTranscript = Turn & { text: string; final: boolean; item: string }
type Callbacks = { transcript: (value: LiveTranscript) => void; failed: (message: string) => void }

// Stateful linear resampling preserves the fractional phase across SDK frames.
class Pcm24k {
  private previous: number | null = null
  private position = 0
  convert(pcm: Uint8Array) {
    const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    const samples: number[] = []
    if (this.previous !== null) samples.push(this.previous)
    for (let i = 0; i + 1 < pcm.length; i += 2) samples.push(input.getInt16(i, true))
    const output: number[] = []
    while (this.position < samples.length - 1) {
      const i = Math.floor(this.position), fraction = this.position - i
      output.push(Math.round(samples[i] * (1 - fraction) + samples[i + 1] * fraction))
      this.position += 2 / 3
    }
    this.position -= Math.max(0, samples.length - 1)
    this.previous = samples.at(-1) ?? null
    const bytes = new Uint8Array(output.length * 2), view = new DataView(bytes.buffer)
    output.forEach((value, i) => view.setInt16(i * 2, value, true))
    return bytes
  }
}

export class PromptRealtime {
  private socket: WebSocket | null = null
  private resampler = new Pcm24k()
  private items = new Map<string, { turn: Turn; text: string; final: boolean }>()
  private commits: Turn[] = []
  private turn: Turn | null = null
  private order = 0
  private staged: Uint8Array[] = []
  private stagedBytes = 0
  private sentBytes = 0
  private ready = false
  private closed = false
  private readyReject: ((reason: Error) => void) | null = null
  private readyTimer: number | undefined
  constructor(private callbacks: Callbacks) {}

  async connect(settings: FollowApiSettings, signal: AbortSignal) {
    const transcription = settings.telepromptModel === 'gpt-live-transcribe'
      ? { model: settings.telepromptModel, delay: 'minimal', ...(settings.language ? { languages: [settings.language] } : {}) }
      : { model: settings.telepromptModel, ...(settings.language ? { language: settings.language } : {}) }
    const session = { type: 'transcription', audio: { input: {
      format: { type: 'audio/pcm', rate: 24000 }, noise_reduction: { type: 'near_field' },
      transcription, turn_detection: null,
    } } }
    const result = await requestAiApi('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', signal, headers: { Authorization: `Bearer ${settings.transcriptionApiKey || settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 60 }, session }),
    }, { label: 'Realtime token (update your relay if this route returns 404)', relayBase: settings.relayBase, timeoutMs: 12_000 }) as { value?: unknown }
    if (signal.aborted || this.closed) throw new Error('Realtime cancelled')
    if (typeof result.value !== 'string' || !result.value.startsWith('ek_')) throw new Error('OpenAI returned no temporary Realtime key.')
    const socket = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription',
      ['realtime', `openai-insecure-api-key.${result.value}`])
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      this.readyReject = reject
      const abort = () => this.close()
      signal.addEventListener('abort', abort, { once: true })
      const fail = (message: string) => {
        if (this.closed) return
        if (!this.ready) reject(new Error(message))
        else this.callbacks.failed(message)
        this.close()
      }
      this.readyTimer = window.setTimeout(() => fail('Realtime connection timed out. Check phone WebSocket access or select HTTP mode.'), 10_000)
      // Confirm the requested model and minimal-delay configuration on the
      // socket, rather than treating a generic session.created as configured.
      socket.onopen = () => socket.send(JSON.stringify({ type: 'session.update', session }))
      socket.onmessage = event => {
        if (this.closed || signal.aborted) return
        let data: { type?: string; item_id?: string; transcript?: string; delta?: string;
          error?: { code?: string }; session?: { type?: string } }
        try { data = JSON.parse(String(event.data)) } catch { return }
        if (!data || typeof data !== 'object') return
        if (data.type === 'error' || data.type === 'conversation.item.input_audio_transcription.failed') {
          // Never surface raw payloads or temporary credentials.
          const code = String(data.error?.code ?? 'transcription_failed').replace(/[^a-z0-9_-]/gi, '').slice(0, 80)
          fail(`Realtime unavailable (${code}). Check model access/network, or choose gpt-4o-mini-transcribe / HTTP.`)
          return
        }
        if (data.type === 'session.created' || data.type === 'session.updated') {
          if (data.session?.type !== 'transcription') { fail('Expected an OpenAI transcription session.'); return }
          if (data.type === 'session.updated') {
            this.ready = true; window.clearTimeout(this.readyTimer); this.readyReject = null
            resolve()
          }
        }
        if (data.type === 'input_audio_buffer.committed' && typeof data.item_id === 'string') {
          const turn = this.commits.shift()
          if (!turn) return
          const existing = this.items.get(data.item_id)
          this.items.set(data.item_id, { turn, text: existing?.text ?? '', final: existing?.final ?? false })
        }
        const final = data.type === 'conversation.item.input_audio_transcription.completed'
        if (!final && data.type !== 'conversation.item.input_audio_transcription.delta') return
        if (typeof data.item_id !== 'string') return
        let item = this.items.get(data.item_id)
        if (!item) {
          // Live models can emit deltas before the turn is committed.
          const turn = this.commits[0] ?? this.turn
          if (!turn) return
          item = { turn, text: '', final: false }; this.items.set(data.item_id, item)
        }
        if (item.final) return
        const text = final ? data.transcript : data.delta
        if (typeof text !== 'string') return
        item.text = (final ? text : item.text + text).slice(-2400)
        item.final = final
        if (item.turn.voiced) this.callbacks.transcript({ ...item.turn, item: data.item_id, text: item.text, final })
        // Keep recent final IDs so a late duplicate cannot be treated as new.
        if (this.items.size > 96) for (const [id, value] of this.items) {
          if (value.final && this.items.size > 64) this.items.delete(id)
        }
      }
      socket.onerror = () => fail('Realtime WebSocket failed. Check phone network / app support, or select HTTP mode.')
      socket.onclose = () => {
        signal.removeEventListener('abort', abort)
        fail('Realtime disconnected / microphone paused. Tap to reconnect.')
      }
    })
  }
  push(pcm: Uint8Array, voice: boolean, revision: number) {
    if (!this.ready || this.closed) return
    this.turn ??= { revision, capturedAt: Date.now(), lastAudioAt: Date.now(), voiced: false, voicedMs: 0, order: ++this.order }
    this.turn.lastAudioAt = Date.now()
    if (voice) this.turn.voicedMs += pcm.length / 32
    this.turn.voiced = this.turn.voicedMs >= 120
    const bytes = this.resampler.convert(pcm)
    this.staged.push(bytes); this.stagedBytes += bytes.length
    if (this.stagedBytes >= 1920) this.flush() // ~40 ms of audio, not whole words/sentences.
  }
  private send(value: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.closed) return
    if (this.socket.bufferedAmount > 192_000) {
      this.callbacks.failed('Realtime upload is falling behind. Check the phone connection.'); this.close(); return
    }
    this.socket.send(JSON.stringify(value))
  }
  private flush() {
    if (!this.stagedBytes) return
    let binary = ''
    for (const bytes of this.staged) for (const byte of bytes) binary += String.fromCharCode(byte)
    this.send({ type: 'input_audio_buffer.append', audio: btoa(binary) })
    this.sentBytes += this.stagedBytes
    this.staged = []; this.stagedBytes = 0
  }
  commit() {
    this.flush()
    if (this.turn && this.sentBytes >= 4800) {
      if (this.commits.length >= 4) {
        this.callbacks.failed('Realtime server is not accepting audio turns. Follow paused; tap to reconnect.')
        this.close(); return
      }
      this.commits.push(this.turn)
      this.send({ type: 'input_audio_buffer.commit' })
      this.turn = null; this.sentBytes = 0
    }
  }
  close() {
    if (this.closed) return
    this.closed = true; this.ready = false
    window.clearTimeout(this.readyTimer)
    this.readyReject?.(new Error('Realtime cancelled')); this.readyReject = null
    if (this.socket) { this.socket.onopen = null; this.socket.onmessage = null; this.socket.onerror = null; this.socket.close() }
    this.socket = null; this.staged = []; this.items.clear(); this.commits = []; this.turn = null
  }
}

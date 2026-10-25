// ElevenLabs Music (docs/SOCIAL_MUSIC_PLAN.md): Business Agent's own ElevenLabs account makes the
// AI tracks businesses pay for per use (ELEVENLABS_API_KEY). One call makes one version: a prompt
// and a length in, an MP3 out. No imports, so scripts/ops/music-check.ts can use it as it is.

/** The API's own default model; ELEVENLABS_MUSIC_MODEL picks another (music_v2, music_v2_5). */
export const DEFAULT_MODEL = 'music_v1'
const URL_MUSIC = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128'

export interface ElevenLabsConfig { apiKey: string; model?: string }
export interface Composed { bytes: ArrayBuffer; type: 'audio/mpeg'; songId: string | null; model: string }

/** ElevenLabs turned the prompt down (an artist's name, lyrics it won't copy…): never charged. */
export class PromptRefused extends Error {
  /** ElevenLabs' own rewording, when it offers one. */
  suggestion?: string
  constructor(message: string, suggestion?: string) {
    super(message)
    this.suggestion = suggestion
  }
}

interface ErrorBody { detail?: string | { status?: string; message?: string; data?: { prompt_suggestion?: string } } | { msg?: string }[] }

/** What went wrong, in words someone at a café can act on. */
function explain(status: number, body: ErrorBody): Error {
  const d = body.detail
  const message = typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => x.msg).filter(Boolean).join('; ') : d?.message ?? ''
  const code = typeof d === 'object' && !Array.isArray(d) ? d?.status ?? '' : ''
  if (/bad_prompt|copyright|artist|lyrics|terms|policy/i.test(`${code} ${message}`)) {
    const suggestion = typeof d === 'object' && !Array.isArray(d) ? d?.data?.prompt_suggestion : undefined
    return new PromptRefused('ElevenLabs can’t make that: describe the feel instead of naming an artist or a song.', suggestion)
  }
  if (status === 401) return new Error('ElevenLabs: the key is missing or wrong (ELEVENLABS_API_KEY)')
  if (status === 402 || /quota|credit|payment/i.test(message)) return new Error('ElevenLabs: Business Agent’s music account is out of credit. Try again later.')
  if (status === 429) return new Error('ElevenLabs is busy. Try again in a minute.')
  return new Error(`ElevenLabs: ${message || `error ${status}`}`)
}

/** One version of a track, `seconds` long (3 s to 10 min), instrumental unless asked otherwise. */
export async function compose(cfg: ElevenLabsConfig, req: { prompt: string; seconds: number; instrumental?: boolean }): Promise<Composed> {
  const model = cfg.model || DEFAULT_MODEL
  const ms = Math.round(Math.min(600, Math.max(3, req.seconds)) * 1000)
  const res = await fetch(URL_MUSIC, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ prompt: req.prompt, music_length_ms: ms, model_id: model, force_instrumental: req.instrumental ?? true }),
  })
  if (!res.ok) throw explain(res.status, await res.json().catch(() => ({})) as ErrorBody)
  const bytes = await res.arrayBuffer()
  if (!bytes.byteLength) throw new Error('ElevenLabs sent back an empty track')
  return { bytes, type: 'audio/mpeg', songId: res.headers.get('song-id'), model }
}

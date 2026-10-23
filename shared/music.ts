// Music on social posts (docs/SOCIAL_MUSIC_PLAN.md), shared by the app and the Worker: the moods
// tracks are tagged with, the starter pack every business gets, how an AI prompt is written, how
// "For you" ranks the library for a post, and the small sums (parts, lengths, uses).
import { msg } from './i18n'
import type { PostKind } from './types'

/** Uploaded tracks: MP3 or M4A up to 20 MB. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
/** Photo stories offer these lengths (videos keep their own). */
export const PHOTO_SECONDS = [5, 10, 15, 30, 60] as const
export const DEFAULT_PHOTO_SECONDS = 15
/** ElevenLabs makes 3 s to 10 min; a use covers up to a minute. */
export const AI_MIN_SECONDS = 3
export const AI_MAX_SECONDS = 600

// ---------------------------------------------------------------------------------------------
// Moods
// ---------------------------------------------------------------------------------------------
export type Mood = 'chill' | 'upbeat' | 'acoustic' | 'lofi' | 'jazz' | 'latin' | 'summer' | 'festive' | 'cosy' | 'elegant' | 'energetic' | 'electronic'

/** Each mood: its name in the app, and how it's said to ElevenLabs. */
export const MOODS: Record<Mood, { label: string; prompt: string }> = {
  chill: { label: msg('Chill'), prompt: 'relaxed, laid-back' },
  upbeat: { label: msg('Upbeat'), prompt: 'upbeat, bright and happy' },
  acoustic: { label: msg('Acoustic'), prompt: 'acoustic' },
  lofi: { label: msg('Lo-fi'), prompt: 'lo-fi beats with soft vinyl crackle' },
  jazz: { label: msg('Jazz'), prompt: 'smooth jazz' },
  latin: { label: msg('Latin'), prompt: 'Latin rhythms' },
  summer: { label: msg('Summer'), prompt: 'sunny summer feel' },
  festive: { label: msg('Festive'), prompt: 'festive and warm, gentle bells' },
  cosy: { label: msg('Cosy'), prompt: 'warm and cosy' },
  elegant: { label: msg('Elegant'), prompt: 'elegant and refined' },
  energetic: { label: msg('Energetic'), prompt: 'energetic, driving rhythm' },
  electronic: { label: msg('Electronic'), prompt: 'modern electronic' },
}
export const MOOD_IDS = Object.keys(MOODS) as Mood[]
export const isMood = (m: string): m is Mood => m in MOODS

/** Instruments to choose from for an AI track. */
export const INSTRUMENTS: Record<string, { label: string; prompt: string }> = {
  acoustic_guitar: { label: msg('Acoustic guitar'), prompt: 'acoustic guitar' },
  spanish_guitar: { label: msg('Spanish guitar'), prompt: 'Spanish guitar' },
  piano: { label: msg('Piano'), prompt: 'piano' },
  strings: { label: msg('Strings'), prompt: 'strings' },
  beats: { label: msg('Lo-fi beats'), prompt: 'lo-fi drum beats' },
  jazz_trio: { label: msg('Jazz trio'), prompt: 'double bass, brushed drums and piano' },
  house: { label: msg('House beat'), prompt: 'four-on-the-floor house beat' },
  ukulele: { label: msg('Ukulele'), prompt: 'ukulele' },
  sax: { label: msg('Saxophone'), prompt: 'saxophone' },
  synth: { label: msg('Synth pads'), prompt: 'soft synth pads' },
}

/** Energy 1 (calm) to 5 (lively): how it's said, and a tempo to ask for. */
export const ENERGY = [
  { label: msg('Calm'), prompt: 'calm', bpm: 72 },
  { label: msg('Gentle'), prompt: 'gentle', bpm: 86 },
  { label: msg('Easy-going'), prompt: 'easy-going', bpm: 100 },
  { label: msg('Lively'), prompt: 'lively', bpm: 114 },
  { label: msg('Energetic'), prompt: 'high-energy', bpm: 126 },
] as const
export const energyOf = (n: number | null | undefined) => ENERGY[Math.min(5, Math.max(1, Math.round(n ?? 3))) - 1]

// ---------------------------------------------------------------------------------------------
// The starter pack: made once per business by Business Agent with ElevenLabs (free to them), so
// "For you" has something on day one. Names are names: the same in every language.
// ---------------------------------------------------------------------------------------------
export interface StarterTrack { key: string; title: string; prompt: string; moods: Mood[]; energy: number; bpm: number; genre: string }
export const STARTER_SECONDS = 40
export const STARTER: StarterTrack[] = [
  { key: 'sunday-morning', title: 'Sunday Morning', moods: ['acoustic', 'chill', 'cosy'], energy: 2, bpm: 88, genre: 'acoustic',
    prompt: 'Warm acoustic guitar and soft brushed drums, a sunny Sunday morning in a specialty café, relaxed' },
  { key: 'terraza', title: 'Terraza', moods: ['latin', 'summer', 'upbeat'], energy: 4, bpm: 118, genre: 'latin house',
    prompt: 'Latin house with Spanish guitar and congas, a summer evening on a café terrace, lively' },
  { key: 'rainy-window', title: 'Rainy Window', moods: ['lofi', 'cosy', 'chill'], energy: 1, bpm: 74, genre: 'lo-fi',
    prompt: 'Mellow lo-fi piano and soft beats with gentle rain, a cosy afternoon with coffee, calm' },
  { key: 'espresso-jazz', title: 'Espresso Jazz', moods: ['jazz', 'elegant'], energy: 3, bpm: 94, genre: 'jazz',
    prompt: 'Smooth jazz trio with double bass, brushed drums and piano, an elegant café' },
  { key: 'fresh-start', title: 'Fresh Start', moods: ['upbeat', 'energetic'], energy: 4, bpm: 120, genre: 'pop',
    prompt: 'Bright upbeat indie pop with claps and guitar, something new to celebrate, happy' },
  { key: 'golden-hour', title: 'Golden Hour', moods: ['summer', 'chill', 'electronic'], energy: 3, bpm: 100, genre: 'chillout',
    prompt: 'Warm chillout with soft synths and a gentle beat, golden sunset light by the sea' },
  { key: 'winter-lights', title: 'Winter Lights', moods: ['festive', 'cosy'], energy: 2, bpm: 96, genre: 'festive',
    prompt: 'Festive and cosy with bells, piano and soft strings, winter lights in a warm café' },
  { key: 'quiet-corner', title: 'Quiet Corner', moods: ['elegant', 'chill'], energy: 1, bpm: 70, genre: 'piano',
    prompt: 'Gentle solo piano, quiet and elegant, a calm corner with a book and coffee' },
  { key: 'match-night', title: 'Match Night', moods: ['energetic', 'upbeat'], energy: 5, bpm: 128, genre: 'stadium rock',
    prompt: 'Energetic stadium rock with big drums and guitars, a big match night with friends' },
  { key: 'brunch-club', title: 'Brunch Club', moods: ['upbeat', 'acoustic'], energy: 4, bpm: 106, genre: 'funk',
    prompt: 'Light funk with bass, guitar and keys, a busy and happy weekend brunch' },
  { key: 'beach-walk', title: 'Beach Walk', moods: ['summer', 'acoustic', 'upbeat'], energy: 3, bpm: 110, genre: 'ukulele pop',
    prompt: 'Breezy ukulele and whistling with light percussion, a walk on the beach in summer' },
  { key: 'late-night', title: 'Late Night', moods: ['electronic', 'chill', 'elegant'], energy: 3, bpm: 116, genre: 'deep house',
    prompt: 'Smooth deep house with soft keys, late evening drinks, stylish and relaxed' },
]

// ---------------------------------------------------------------------------------------------
// AI prompts
// ---------------------------------------------------------------------------------------------
/** Asking for a real artist's style or a song: refused before ElevenLabs is asked (it refuses too). */
const ARTIST_ASK = /\b(in the style of|sounds? like|by the artist|cover of|remix of|al estilo de|como (la canción|el grupo|la banda)|estilo de)\b/i
export const namesArtist = (text: string) => ARTIST_ASK.test(text)

export interface PromptChoice {
  moods: string[]
  instruments: string[]
  energy: number
  /** In the person's own words (optional). */
  describe?: string
  /** "a specialty café in Marbella" */
  business?: string
  kind: PostKind
  vocals?: boolean
}

/** The prompt sent to ElevenLabs: always in English, at most 600 characters. */
export function aiPrompt(c: PromptChoice): string {
  const e = energyOf(c.energy)
  const moods = c.moods.filter(isMood).map(m => MOODS[m].prompt)
  const instruments = c.instruments.filter(i => i in INSTRUMENTS).map(i => INSTRUMENTS[i].prompt)
  const parts = [
    `${[e.prompt, ...moods].join(', ')} ${c.vocals ? 'song' : 'instrumental background music'}`,
    instruments.length ? `with ${joinAnd(instruments)}` : '',
    c.business ? `for a social media ${c.kind === 'reel' ? 'reel' : c.kind === 'story' ? 'story' : 'post'} from ${c.business}` : '',
  ].filter(Boolean)
  const describe = c.describe?.trim().replace(/\s+/g, ' ')
  let out = `${parts.join(' ')}.${describe ? ` ${describe.replace(/[.!]*$/, '')}.` : ''} Around ${e.bpm} bpm.${c.vocals ? '' : ' No vocals.'}`
  out = out.charAt(0).toUpperCase() + out.slice(1)
  return out.length > 600 ? `${out.slice(0, 597)}...` : out
}

const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** How long an AI track should be for a clip: two seconds more for the fade, within ElevenLabs' limits. */
export const aiSeconds = (clip: number) => Math.min(AI_MAX_SECONDS, Math.max(AI_MIN_SECONDS, Math.ceil(clip) + 2))
/** Pay-per-use uses: one per started minute. */
export const usesFor = (seconds: number) => Math.max(1, Math.ceil(Math.max(seconds, AI_MIN_SECONDS) / 60))

// ---------------------------------------------------------------------------------------------
// Suggestions ("For you")
// ---------------------------------------------------------------------------------------------
/** Words in a caption (English and Spanish) and the moods they call for. */
export const OCCASIONS: { id: string; label: string; words: string[]; moods: Mood[] }[] = [
  { id: 'morning', label: msg('Morning coffee'), words: ['brunch', 'breakfast', 'desayuno', 'morning', 'mañana', 'buenos días', 'good morning', 'latte', 'flat white', 'croissant', 'tostada'],
    moods: ['acoustic', 'chill', 'cosy'] },
  { id: 'match', label: msg('Match day'), words: ['partido', 'match', 'fútbol', 'futbol', 'football', 'liga', 'game day', 'champions', 'gol', 'goal'],
    moods: ['energetic', 'upbeat'] },
  { id: 'festive', label: msg('Festive'), words: ['navidad', 'christmas', 'xmas', 'reyes', 'nochebuena', 'nochevieja', 'new year', 'año nuevo', 'feliz'],
    moods: ['festive', 'cosy'] },
  { id: 'summer', label: msg('Summer'), words: ['verano', 'summer', 'playa', 'beach', 'terraza', 'terrace', 'sol', 'sun', 'helado', 'ice cream', 'iced', 'frappé', 'granizado'],
    moods: ['summer', 'latin', 'upbeat'] },
  { id: 'rain', label: msg('Rainy day'), words: ['lluvia', 'rain', 'rainy', 'otoño', 'autumn', 'fall', 'frío', 'cold', 'invierno', 'winter', 'chocolate caliente', 'hot chocolate'],
    moods: ['lofi', 'cosy', 'jazz'] },
  { id: 'new', label: msg('Something new'), words: ['nuevo', 'nueva', 'new', 'menu', 'menú', 'launch', 'lanzamiento', 'opening', 'apertura', 'estreno', 'novedad'],
    moods: ['upbeat', 'energetic'] },
  { id: 'evening', label: msg('Evening'), words: ['noche', 'night', 'evening', 'tarde', 'cena', 'dinner', 'cocktail', 'cóctel', 'vino', 'wine', 'afterwork'],
    moods: ['elegant', 'jazz', 'electronic'] },
]

/** The occasions a caption mentions. */
export function occasionsIn(caption: string) {
  const text = ` ${caption.toLowerCase()} `
  return OCCASIONS.filter(o => o.words.some(w => text.includes(w.includes(' ') ? w : ` ${w}`) || text.includes(`#${w}`)))
}

/** What suggest() needs to know about a track. */
export interface Rankable {
  id: string; title: string; duration_s: number; moods: string[]; energy: number | null; vocals: boolean; saved: boolean; source: string
}
export interface SuggestContext {
  kind: PostKind
  /** How long the clip is. */
  seconds: number
  caption: string
  /** When it goes out (its hour, in the business's time zone); null: now or unknown. */
  hour: number | null
  sound: { moods: string[]; avoid: string[] }
  /** Tracks on the business's last few posts (used again less). */
  recent: string[]
  /** How well each track did on Instagram (likes and comments per post, averaged). */
  engagement?: Record<string, number>
}
export type Reason = 'sound' | 'occasion' | 'time' | 'saved' | 'own' | 'worked'
export interface Suggestion<T> { track: T; score: number; reasons: Reason[]; occasion?: string }

/** The library ranked for a post, best first; tracks in a mood the brand avoids are left out. */
export function suggest<T extends Rankable>(tracks: T[], c: SuggestContext): Suggestion<T>[] {
  const occasions = occasionsIn(c.caption)
  const wanted = new Set<string>(occasions.flatMap(o => o.moods))
  const brand = new Set(c.sound.moods)
  const avoid = new Set(c.sound.avoid)
  const best = Math.max(0, ...Object.values(c.engagement ?? {}))
  const out: Suggestion<T>[] = []
  for (const t of tracks) {
    if (t.moods.some(m => avoid.has(m))) continue
    const reasons: Reason[] = []
    let score = 0
    const brandHits = t.moods.filter(m => brand.has(m)).length
    if (brandHits) { score += 2 * brandHits; reasons.push('sound') }
    const occasionHits = t.moods.filter(m => wanted.has(m)).length
    if (occasionHits) { score += 3 * occasionHits; reasons.push('occasion') }
    const energy = t.energy ?? 3
    if (c.hour !== null) {
      const fits = c.hour < 12 ? energy <= 3 : c.hour >= 18 ? energy >= 3 : true
      if (fits) { score += 1; if (c.hour < 12 || c.hour >= 18) reasons.push('time') } else score -= 1
    }
    score += t.duration_s >= c.seconds ? 1 : -1
    if (t.saved) { score += 1.5; reasons.push('saved') }
    if (t.source !== 'starter') { score += 1; reasons.push('own') }
    const worked = c.engagement?.[t.id]
    if (worked && best > 0) { score += 2 * (worked / best); if (worked / best > 0.5) reasons.push('worked') }
    if (c.recent.includes(t.id)) score -= 3
    if (t.vocals) score -= 0.5
    out.push({ track: t, score, reasons, ...(occasionHits ? { occasion: occasions.find(o => o.moods.some(m => t.moods.includes(m)))?.label } : {}) })
  }
  return out.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
}

/** Why a track is suggested, in a few words (the chips under it). */
export const REASON_LABEL: Record<Reason, string> = {
  sound: msg('Your sound'), occasion: msg('Fits the caption'), time: msg('Fits the time'), saved: msg('Saved'), own: msg('Yours'), worked: msg('Did well before'),
}

// ---------------------------------------------------------------------------------------------
// Parts, times and the file with the music in
// ---------------------------------------------------------------------------------------------
/** Where the chosen part can start: inside the track (it loops when shorter than the clip). */
export const clampStart = (start: number, duration: number, clip: number) =>
  Math.round(Math.min(Math.max(0, start), Math.max(0, duration - clip)) * 10) / 10

/** 45 → "0:45", 125.4 → "2:05". */
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
/** "0:45", "1:05" or "45" → seconds; null when it can't be read. */
export function parseTime(text: string): number | null {
  const t = text.trim()
  if (!t) return 0
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t) ?? /^()(\d{1,3})$/.exec(t)
  return m ? Number(m[1] || 0) * 60 + Number(m[2]) : null
}

/** The choices that make the file: when they change, the music is put in again. */
export interface MixChoice {
  url: string; start: number; seconds: number; music_volume: number; original_volume: number; fade_in: boolean; fade_out: boolean
  label?: boolean; sources: string[]; cuts?: number[]
}
/** A short fingerprint of the choices (FNV-1a), kept on the post as `rendered_for`. */
export function renderKey(c: MixChoice) {
  const text = JSON.stringify([c.url, c.start.toFixed(1), c.seconds.toFixed(1), c.music_volume, c.original_volume, c.fade_in, c.fade_out, !!c.label, c.sources, c.cuts ?? []])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

/** Where to cut photos so each change lands on a beat: every few beats, each photo at least ~1.2 s. */
export function beatCuts(bpm: number | null | undefined, photos: number, seconds: number): number[] {
  if (photos < 2) return [0]
  const even = seconds / photos
  if (!bpm) return Array.from({ length: photos }, (_, i) => Math.round(i * even * 100) / 100)
  const beat = 60 / bpm
  // The whole number of beats per photo closest to an even share, never under 1.2 s.
  const per = Math.max(Math.ceil(1.2 / beat), Math.round(even / beat))
  const cuts = Array.from({ length: photos }, (_, i) => Math.round(i * per * beat * 100) / 100)
  // Too many photos for the length at that pace: share it evenly instead.
  return cuts[cuts.length - 1] < seconds - 0.5 ? cuts : Array.from({ length: photos }, (_, i) => Math.round(i * even * 100) / 100)
}

/** The sound's name on a reel: "Easy Beans · Sunday Morning" (Instagram allows one change, at most 100 characters here). */
export const audioName = (business: string, title: string) => `${business.trim()} · ${title.trim()}`.slice(0, 100)

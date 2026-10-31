// What the capture logged for each recording (video/capture/run.mjs): its length, the viewport, and
// every click with the box of what was clicked, so the camera can zoom onto it.
import type { CamKey, } from './kit'
import { rawToOut, type Segment } from './timeline'
import setup from '../public/clips/setup.json'
import hours from '../public/clips/hours.json'
import closure from '../public/clips/closure.json'
import menu from '../public/clips/menu.json'
import clockin from '../public/clips/clockin.json'
import weborder from '../public/clips/weborder.json'

interface Box { x: number; y: number; width: number; height: number }
interface ClipEvent { t: number; type: string; label?: string; box?: Box; x?: number; y?: number }
export interface ClipMeta { name: string; duration: number; viewport: { width: number; height: number }; events: ClipEvent[] }

export const META = { setup, hours, closure, menu, clockin, weborder } as unknown as Record<string, ClipMeta>

/** The moment (frames into the scene) of a logged event, through the cuts and speed-ups. */
export function eventAt(clip: ClipMeta, label: string, segs: Segment[], nth = 0): number {
  const e = clip.events.filter(x => x.label === label)[nth]
  if (!e) throw new Error(`${clip.name}: no event ${label}`)
  const f = rawToOut(e.t, segs)
  if (f === null) throw new Error(`${clip.name}: ${label} was cut`)
  return f
}

/** A camera key on an event's box: zoom `s`, `lead` frames before the event (so the zoom lands as it happens). */
export function camOn(clip: ClipMeta, label: string, segs: Segment[], s: number, lead = 6, offset = { x: 0, y: 0 }): CamKey {
  const e = clip.events.find(x => x.label === label)!
  const b = e.box!
  return { f: Math.max(0, eventAt(clip, label, segs) - lead), s, fx: b.x + b.width / 2 + offset.x, fy: b.y + b.height / 2 + offset.y }
}

/** Click sounds for every click of a clip that made the cut. */
export function clicksOf(clip: ClipMeta, segs: Segment[]): number[] {
  return clip.events.filter(e => e.type === 'click').map(e => rawToOut(e.t, segs)).filter((f): f is number => f !== null)
}
